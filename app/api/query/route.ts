import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function isSafeSQL(sql: string) {
    const lower = sql.toLowerCase().trim();
    if (!lower.startsWith("select")) return false;
    const blocked = ["insert", "update", "delete", "drop", "alter", "truncate"];
    return !blocked.some((kw) => lower.includes(kw));
}

function isRelevantQuery(query: string) {
    const allowedKeywords = [
        "order", "orders", "customer", "customers", "delivery", "deliveries",
        "invoice", "invoices", "payment", "payments", "product", "products",
        "billing", "journal", "flow", "trace", "broken", "incomplete",
        "show", "highlight", "visualize", "explore", "related", "connected",
        "find", "list", "path", "chain", "sales", "sap", "material",
        // Conversational words
        "tell", "talk", "about", "describe", "explain", "what", "which",
        "how", "many", "much", "where", "top", "highest", "lowest",
        "most", "least", "total", "amount", "count", "average",
        "everything", "all", "detail", "details", "info", "information",
        "status", "gap", "missing", "analyze", "analysis",
    ];
    const lower = query.toLowerCase();
    // Allow if any keyword matches OR if query contains a numeric ID (entity reference)
    if (allowedKeywords.some((kw) => lower.includes(kw))) return true;
    if (/\d{4,}/.test(query)) return true; // e.g. "740506" → referencing an entity
    return false;
}

function serializeBigInt(data: any): any {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? Number(value) : value
        )
    );
}

// The columns in our DB result that correspond to graph node IDs
const ID_COLUMNS = ["id", "orderId", "customerId", "invoiceId", "deliveryId", "paymentId", "journalId", "journalEntryId"];

function extractHighlightedIds(rows: any[]): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
        for (const col of ID_COLUMNS) {
            const val = row[col];
            if (val && typeof val === "string") ids.add(val);
        }
    }
    return Array.from(ids);
}

// ─────────────────────────────────────────────
// Intent Classification
// ─────────────────────────────────────────────

type QueryIntent = "sql" | "flow_trace" | "entity_explore" | "gap_analysis";

async function classifyIntent(query: string): Promise<QueryIntent> {
    const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `Classify the user's query into exactly ONE of these intents:
- "flow_trace": user wants to see/trace the full document flow chain (e.g. "trace order X", "show full flow", "what happened to invoice Y", "follow this order")
- "entity_explore": user wants to see all entities related to a specific named entity (e.g. "show everything related to customer 310000108", "what is order 740506 connected to")
- "gap_analysis": user wants to find broken/missing/incomplete flows (e.g. "broken flows", "delivered but not billed", "orders with no invoice", "incomplete")
- "sql": anything else — ranking, aggregation, counting, listing, normal data questions

Respond with ONLY the intent string, nothing else.`
            },
            { role: "user", content: query }
        ],
    });
    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() as QueryIntent;
    const valid: QueryIntent[] = ["flow_trace", "entity_explore", "gap_analysis", "sql"];
    return valid.includes(raw) ? raw : "sql";
}

// ─────────────────────────────────────────────
// Graph Traversal Engine (BFS across O2C graph)
// ─────────────────────────────────────────────

async function traverseGraph(seedIds: string[], maxHops = 2): Promise<string[]> {
    const collected = new Set<string>(seedIds);
    const toExpand = [...seedIds];

    for (let hop = 0; hop < maxHops; hop++) {
        const batch = [...toExpand];
        toExpand.length = 0;

        await Promise.all(batch.map(async (id) => {
            const results = await Promise.allSettled([
                // Customer → Orders, Invoices, Payments
                prisma.order.findMany({ where: { customerId: id }, select: { id: true, customerId: true } }),
                prisma.invoice.findMany({ where: { customerId: id }, select: { id: true, customerId: true, orderId: true } }),
                prisma.payment.findMany({ where: { customerId: id }, select: { id: true, customerId: true } }),

                // Order → Customer, Deliveries, Invoices
                prisma.order.findFirst({ where: { id }, select: { id: true, customerId: true } })
                    .then(o => o ? [o] : []),
                prisma.delivery.findMany({ where: { orderId: id }, select: { id: true, orderId: true } }),
                prisma.invoice.findMany({ where: { orderId: id }, select: { id: true, orderId: true, customerId: true } }),

                // Invoice → Order, Customer, JournalEntries
                prisma.invoice.findFirst({ where: { id }, select: { id: true, orderId: true, customerId: true } })
                    .then(i => i ? [i] : []),
                prisma.journalEntry.findMany({ where: { invoiceId: id }, select: { id: true, invoiceId: true } }),

                // Delivery → Order
                prisma.delivery.findFirst({ where: { id }, select: { id: true, orderId: true } })
                    .then(d => d ? [d] : []),

                // JournalEntry → Invoice
                prisma.journalEntry.findFirst({ where: { id }, select: { id: true, invoiceId: true } })
                    .then(j => j ? [j] : []),

                // Payment → Customer
                prisma.payment.findFirst({ where: { id }, select: { id: true, customerId: true } })
                    .then(p => p ? [p] : []),
            ]);

            for (const result of results) {
                if (result.status !== "fulfilled") continue;
                const rows = Array.isArray(result.value) ? result.value : [];
                for (const row of rows as any[]) {
                    for (const val of Object.values(row)) {
                        if (val && typeof val === "string" && !collected.has(val)) {
                            collected.add(val);
                            toExpand.push(val);
                        }
                    }
                }
            }
        }));
    }

    return Array.from(collected);
}

// ─────────────────────────────────────────────
// Extract entity IDs mentioned in query text
// ─────────────────────────────────────────────

function extractMentionedIds(query: string): string[] {
    // Match numeric IDs (SAP order/invoice/customer IDs), e.g. 740506, 90504219, 310000108
    // Also match product/material codes like S8907367008620
    const patterns = [
        /\b\d{6,}\b/g,                     // long numeric IDs (orders, invoices, customers)
        /\b[SB]\d{13}\b/g,                  // SAP material codes
    ];
    const found = new Set<string>();
    for (const pattern of patterns) {
        const matches = query.match(pattern) || [];
        for (const m of matches) found.add(m);
    }
    return Array.from(found);
}

// ─────────────────────────────────────────────
// Gap Analysis — find incomplete flow orders
// ─────────────────────────────────────────────

async function runGapAnalysis(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT "Order"."id"
        FROM "Order"
        LEFT JOIN "Delivery" ON "Order"."id" = "Delivery"."orderId"
        LEFT JOIN "Invoice" ON "Order"."id" = "Invoice"."orderId"
        LEFT JOIN "JournalEntry" ON "Invoice"."id" = "JournalEntry"."invoiceId"
        WHERE "Delivery"."id" IS NULL OR "Invoice"."id" IS NULL
        LIMIT 50
    `);
    return rows.map((r: any) => r.id);
}

// ─────────────────────────────────────────────
// Main POST handler
// ─────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const userQuery = body?.query?.trim();

        if (!userQuery) {
            return Response.json({ answer: "Please enter a valid query." });
        }

        if (!isRelevantQuery(userQuery)) {
            return Response.json({
                answer: "This system only answers questions related to Order-to-Cash business data.",
            });
        }

        // ── STEP 1: Classify intent ──────────────────────────────────────────
        const intent = await classifyIntent(userQuery);
        console.log("Intent:", intent);

        let highlightedIds: string[] = [];
        let dbResultForAnswer: any[] = [];

        // ── STEP 2: Graph-mode branch (flow_trace / entity_explore / gap_analysis) ─
        if (intent === "flow_trace" || intent === "entity_explore") {
            const mentionedIds = extractMentionedIds(userQuery);
            console.log("Mentioned IDs:", mentionedIds);

            const hops = intent === "flow_trace" ? 2 : 1; // entity_explore = immediate neighbors only

            if (mentionedIds.length > 0) {
                highlightedIds = await traverseGraph(mentionedIds, hops);
            } else {
                // No IDs found in text — use SQL to find them first, then traverse
                const sqlRows = await runSQLQuery(userQuery);
                const seedIds = extractHighlightedIds(sqlRows);
                highlightedIds = seedIds.length > 0 ? await traverseGraph(seedIds, hops) : [];
                dbResultForAnswer = sqlRows;
            }
        } else if (intent === "gap_analysis") {
            const gapIds = await runGapAnalysis();
            // Expand each broken order to show its full partial chain
            highlightedIds = gapIds.length > 0 ? await traverseGraph(gapIds.slice(0, 10)) : [];
        }

        // ── STEP 3: Always run SQL for the text answer ───────────────────────
        if (dbResultForAnswer.length === 0) {
            dbResultForAnswer = await runSQLQuery(userQuery);
        }

        // For pure SQL mode, also extract IDs from result to highlight
        if (intent === "sql" && highlightedIds.length === 0) {
            highlightedIds = extractHighlightedIds(serializeBigInt(dbResultForAnswer));
        }

        // ── STEP 4: LLM formats the final answer ─────────────────────────────
        const formatted = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: "You are a data analyst. Convert database results into a clear, concise natural language answer. Use bullet points for listing details or multiple items. If data is empty say no results were found.",
                },
                {
                    role: "user",
                    content: `User query: ${userQuery}\n\nDatabase result:\n${JSON.stringify(serializeBigInt(dbResultForAnswer))}`,
                },
            ],
        });

        const answer = formatted.choices[0]?.message?.content || "No response generated.";

        return Response.json({ answer, highlightedIds, intent });

    } catch (error) {
        console.error(error);
        return Response.json({ answer: "Error processing request" });
    }
}

// ─────────────────────────────────────────────
// SQL sub-routine (shared between modes)
// ─────────────────────────────────────────────

async function runSQLQuery(userQuery: string): Promise<any[]> {
    try {
        const sqlGen = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are an expert SQL generator for a SAP Order-to-Cash (O2C) database.
Generate ONLY SQL queries based on the schema below for PostgreSQL.

Schema:
- "Customer"("id", "name")
- "Order"("id", "customerId", "createdAt", "totalAmount", "deliveryStatus")
- "OrderItem"("id", "orderId", "productId", "quantity", "netAmount")
- "Product"("id", "name")
- "Delivery"("id", "orderId", "createdAt", "status")
- "DeliveryItem"("id", "deliveryId", "productId", "quantity")
- "Invoice"("id", "customerId", "orderId", "accountingDocument", "totalAmount", "createdAt")
- "InvoiceItem"("id", "invoiceId", "orderId", "productId", "quantity", "netAmount")
- "JournalEntry"("id", "invoiceId", "amount", "createdAt")
- "Payment"("id", "customerId", "amount", "createdAt")

Synonyms:
- "Sales Order" = Order
- "Billing" = Invoice
- "Material" = Product

Rules:
- Generate exactly ONE single SQL query. 
- ONLY SELECT queries.
- CRITICAL: PostgreSQL is case-sensitive for camelCase/PascalCase identifiers. 
- ALWAYS wrap ALL table names and ALL column names in double quotes, e.g., SELECT "id" FROM "Order".
- Use "Order"."id" style for joins to avoid ambiguity.
- Always LIMIT 50.
- For incomplete flows, use LEFT JOIN + IS NULL check.
- NO markdown, NO explaining, NO formatting and do not ever explain anything. just return plain SQL string.`
                },
                { role: "user", content: userQuery },
            ],
        });

        const sql = sqlGen.choices[0]?.message?.content?.trim() || "";
        console.log("Generated SQL:", sql);

        if (!isSafeSQL(sql)) return [];

        const safeSQL = sql.replace(/\s+/g, " ").trim();
        const result = await prisma.$queryRawUnsafe<any[]>(safeSQL);
        const rows = Array.isArray(result) ? result.slice(0, 25) : [];
        console.log("DB rows:", rows.length);
        return rows;
    } catch (err) {
        console.error("SQL error:", err);
        return [];
    }
}