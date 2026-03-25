import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

// Helpers
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
        "tell", "talk", "about", "describe", "explain", "what", "which",
        "how", "many", "much", "where", "top", "highest", "lowest",
        "most", "least", "total", "amount", "count", "average",
        "everything", "all", "detail", "details", "info", "information",
        "status", "gap", "missing", "analyze", "analysis",
    ];
    const lower = query.toLowerCase();
    if (allowedKeywords.some((kw) => lower.includes(kw))) return true;
    if (/\d{4,}/.test(query)) return true; 
    return false;
}

function serializeBigInt(data: any): any {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? Number(value) : value
        )
    );
}

const ID_COLUMNS = ["id", "orderId", "customerId", "invoiceId", "deliveryId", "paymentId", "journalId", "journalEntryId", "productId"];

function extractHighlightedIds(rows: any[]): string[] {
    const ids = new Set<string>();
    const rowsArray = Array.isArray(rows) ? rows : [];
    for (const row of rowsArray) {
        if (!row || typeof row !== 'object') continue;
        for (const col of ID_COLUMNS) {
            const val = row[col];
            if (val && typeof val === "string") ids.add(val.toUpperCase());
        }
        for (const val of Object.values(row)) {
            if (typeof val === "string" && (/^[SB]\d{10,}/i.test(val) || /^\d{6,}$/.test(val))) {
                ids.add(val.toUpperCase());
            }
        }
    }
    return Array.from(ids);
}

// ─────────────────────────────────────────────
// Updated Helper: History Formatting
// ─────────────────────────────────────────────
function formatHistory(history: { role: string; content: string }[]) {
    if (!history || history.length === 0) return "";
    return "\n\nConversation History:\n" + history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
}

// ─────────────────────────────────────────────
// Smart Entity Resolution (NER + DB Lookup)
// ─────────────────────────────────────────────

async function extractEntityNames(query: string, history: any[]): Promise<{ name: string; type: "customer" | "product" | "order" }[]> {
    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content: `Extract potential entity names and their types from the user query.
Types: "customer", "product", "order".
Use the conversation history if the current query uses pronouns like "its", "that", "those".
Example: "Melton Group" -> {"entities": [{"name": "Melton Group", "type": "customer"}]}
Return ONLY a JSON object: {"entities": [{"name": "string", "type": "customer|product|order"}]}.${formatHistory(history)}`
                },
                { role: "user", content: query }
            ],
            response_format: { type: "json_object" }
        });
        const content = JSON.parse(res.choices[0]?.message?.content || "{}");
        return content.entities || [];
    } catch (err) {
        console.error("NER Error:", err);
        return [];
    }
}

async function resolveEntities(entities: { name: string; type: string }[]): Promise<string[]> {
    const foundIds: string[] = [];
    for (const ent of entities) {
        if (ent.type === "customer") {
            const matches = await prisma.customer.findMany({
                where: { name: { contains: ent.name, mode: 'insensitive' } },
                select: { id: true }
            });
            foundIds.push(...matches.map(m => m.id));
        } else if (ent.type === "product") {
            const matches = await prisma.product.findMany({
                where: { name: { contains: ent.name, mode: 'insensitive' } },
                select: { id: true }
            });
            foundIds.push(...matches.map(m => m.id));
        } else if (ent.type === "order") {
             const matches = await prisma.order.findMany({
                where: { id: { contains: ent.name, mode: 'insensitive' } },
                select: { id: true }
            });
            foundIds.push(...matches.map(m => m.id));
        }
    }
    return Array.from(new Set(foundIds));
}

// Intent Classification
type QueryIntent = "sql" | "flow_trace" | "entity_explore" | "gap_analysis";

async function classifyIntent(query: string, history: any[]): Promise<QueryIntent> {
    const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `Classify the user's query into exactly ONE of these intents:
- "flow_trace": user wants to trace a SPECIFIC document's full lifecycle chain (e.g. "trace order 740506", "show full flow for invoice 123")
- "entity_explore": user wants to see what a SPECIFIC entity (by ID) is connected to (e.g. "show everything related to customer 310000108")
- "gap_analysis": user wants to find broken/missing/incomplete flows (e.g. "broken flows", "delivered but not billed")
- "sql": listing all entities, ranking, aggregation, counting, or normal data questions.

Respond with ONLY the intent string, nothing else.${formatHistory(history)}`
            },
            { role: "user", content: query }
        ],
    });
    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() as QueryIntent;
    const valid: QueryIntent[] = ["flow_trace", "entity_explore", "gap_analysis", "sql"];
    return valid.includes(raw) ? raw : "sql";
}

// Graph Traversal Engine
async function traverseGraph(seedIds: string[], maxHops = 2): Promise<string[]> {
    const collected = new Set<string>(seedIds);
    const toExpand = [...seedIds];

    for (let hop = 0; hop < maxHops; hop++) {
        const batch = [...toExpand];
        toExpand.length = 0;

        await Promise.all(batch.map(async (id) => {
            const results = await Promise.allSettled([
                prisma.order.findMany({ where: { customerId: id }, select: { id: true, customerId: true } }),
                prisma.invoice.findMany({ where: { customerId: id }, select: { id: true, customerId: true, orderId: true } }),
                prisma.payment.findMany({ where: { customerId: id }, select: { id: true, customerId: true } }),
                prisma.order.findFirst({ where: { id }, select: { id: true, customerId: true } }).then(o => o ? [o] : []),
                prisma.delivery.findMany({ where: { orderId: id }, select: { id: true, orderId: true } }),
                prisma.invoice.findMany({ where: { orderId: id }, select: { id: true, orderId: true, customerId: true } }),
                prisma.orderItem.findMany({ where: { orderId: id }, select: { productId: true } }),
                prisma.invoice.findFirst({ where: { id }, select: { id: true, orderId: true, customerId: true } }).then(i => i ? [i] : []),
                prisma.journalEntry.findMany({ where: { invoiceId: id }, select: { id: true, invoiceId: true } }),
                prisma.delivery.findFirst({ where: { id }, select: { id: true, orderId: true } }).then(d => d ? [d] : []),
                prisma.deliveryItem.findMany({ where: { deliveryId: id }, select: { productId: true } }),
                prisma.orderItem.findMany({ where: { productId: id }, select: { orderId: true } }),
                prisma.deliveryItem.findMany({ where: { productId: id }, select: { deliveryId: true } }),
                prisma.journalEntry.findFirst({ where: { id }, select: { id: true, invoiceId: true } }).then(j => j ? [j] : []),
                prisma.payment.findFirst({ where: { id }, select: { id: true, customerId: true } }).then(p => p ? [p] : []),
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

function extractMentionedIds(query: string): string[] {
    const patterns = [
        /\b\d{6,}\b/g,                     
        /\b[SB]\d{10,}\b/gi,               
    ];
    const found = new Set<string>();
    for (const pattern of patterns) {
        const matches = query.match(pattern) || [];
        for (const m of matches) found.add(m.toUpperCase()); 
    }
    return Array.from(found);
}

// ─────────────────────────────────────────────
// Intelligent Filtering — pick nodes to highlight
// ─────────────────────────────────────────────

async function selectRelevantEntities(query: string, intent: string, dbResult: any[]): Promise<{ seeds: string[], highlights: string[] }> {
    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                {
                    role: "system",
                    content: `You are a graph visualization assistant. Given a user query and the database results, identify the MOST RELEVANT entities (IDs) to highlight.

Categories:
- "seeds": The direct "Answer Entities" (e.g., if asked "Which customers...", these ARE the Customers). These are the source of the visualization.
- "highlights": Contextual entities like Products, Orders, or Deliveries that connect the seeds together or explain their relationship.

Rules:
1. Return ONLY a JSON object: {"seeds": ["ID1", "ID2"], "highlights": ["ID3", "ID4"]}.
2. CRITICAL: If the user asks for a TYPE (e.g., "Which customers"), you MUST include the IDs of those customers in "seeds".
3. CRITICAL: If the user refers to a named entity (e.g. "Melton Group"), you MUST include its ID in "seeds" if present in the results.
4. Only use IDs present in the results.
5. If there are many results (>25), pick the most relevant ones. Do not be too stingy; we want a rich graph.
6. Look at ALL columns in the result rows, not just the obvious ones. Any string that looks like an ID should be considered.`
                },
                {
                    role: "user",
                    content: `User Query: ${query}\nIntent: ${intent}\nResults (JSON): ${JSON.stringify(serializeBigInt(dbResult)).slice(0, 5000)}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = JSON.parse(res.choices[0]?.message?.content || "{}");
        // Normalize IDs to uppercase
        const seeds = (content.seeds || []).map((id: string) => id.toUpperCase());
        const highlights = (content.highlights || []).map((id: string) => id.toUpperCase());
        
        return { seeds, highlights };
    } catch (err) {
        console.error("Filtering error:", err);
        return { seeds: [], highlights: [] };
    }
}

async function runGapAnalysis(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT "Order"."id"
        FROM "Order"
        LEFT JOIN "Delivery" ON "Order"."id" = "Delivery"."orderId"
        LEFT JOIN "Invoice" ON "Order"."id" = "Invoice"."orderId"
        WHERE "Delivery"."id" IS NULL OR "Invoice"."id" IS NULL
        LIMIT 50
    `);
    return rows.map((r: any) => r.id);
}

async function runSQLQuery(userQuery: string, history: any[]): Promise<{ rows: any[], sql: string }> {
    let attempts = 0;
    let lastError = "";
    let lastSQL = "";

    while (attempts < 2) {
        attempts++;
        try {
            const systemPrompt = `You are an expert SQL generator for a SAP Order-to-Cash (O2C) database.
Generate ONLY SQL queries based on the schema below for PostgreSQL.

Schema:
- "Customer"("id" TEXT, "name" TEXT)
- "Order"("id" TEXT, "customerId" TEXT, "createdAt" TEXT, "totalAmount" NUMERIC, "deliveryStatus" TEXT)
- "OrderItem"("id" TEXT, "orderId" TEXT, "productId" TEXT, "quantity" NUMERIC, "netAmount" NUMERIC)
- "Product"("id" TEXT, "name" TEXT)
- "Delivery"("id" TEXT, "orderId" TEXT, "createdAt" TEXT, "status" TEXT)
- "DeliveryItem"("id" TEXT, "deliveryId" TEXT, "productId" TEXT, "quantity" NUMERIC)
- "Invoice"("id" TEXT, "customerId" TEXT, "orderId" TEXT, "accountingDocument" TEXT, "totalAmount" NUMERIC, "createdAt" TEXT)
- "InvoiceItem"("id" TEXT, "invoiceId" TEXT, "orderId" TEXT, "productId" TEXT, "quantity" NUMERIC, "netAmount" NUMERIC)
- "JournalEntry"("id" TEXT, "invoiceId" TEXT, "amount" NUMERIC, "createdAt" TEXT)
- "Payment"("id" TEXT, "customerId" TEXT, "amount" NUMERIC, "createdAt" TEXT)

Rules:
1. Generate exactly ONE single SQL query. 
2. ONLY SELECT queries.
3. PostgreSQL is case-sensitive. ALWAYS double-quote ALL table and column names (e.g. "Order"."totalAmount", "Customer"."name").
4. ALL "id" columns are TEXT. Wrap ID values in single quotes.
5. ALL camelCase columns (like "totalAmount", "customerId", "orderId") MUST be double-quoted.
6. CRITICAL: JOIN clauses MUST come BEFORE WHERE clauses.
6. MANDATORY: ALWAYS select the "id" columns for every table you JOIN or FROM (e.g. "Customer"."id", "Order"."id") so they can be highlighted on the graph.
7. CRITICAL RELATIONS: 
   - "Order"."customerId" = "Customer"."id"
   - "OrderItem"."orderId" = "Order"."id"
   - "Invoice"."orderId" = "Order"."id"
   - "JournalEntry"."invoiceId" = "Invoice"."id"
   - "Delivery"."orderId" = "Order"."id"
8. CRITICAL: Use LEFT JOIN when asked to "trace" or "show flow" for a specific ID to ensure the query doesn't return 0 rows if some documents in the chain are missing.
9. JOIN MINIMIZATION: Only JOIN tables that are absolutely necessary.
10. Use ILIKE for case-insensitive search.
11. LIMIT your results to 100 for listings, but DO NOT limit for aggregate queries (SUM, COUNT).
12. DEFINITION: "Spending" or "Purchases" refers to the SUM of "Order"."totalAmount".
13. IMPORTANT: When joining tables, ALWAYS use explicit aliases for ID columns (e.g. SELECT "Customer"."id" AS "customerId", "Order"."id" AS "orderId").
15. Return ONLY raw SQL string. NO MARKDOWN. NO EXPLANATIONS.
16. CRITICAL: Always prioritize the CURRENT Database schema and results over any numbers mentioned in the Conversation History.
17. IF YOU ADD ANY TEXT OTHER THAN THE SQL QUERY, THE SYSTEM WILL FAIL. ${formatHistory(history)}`;

            let userPrompt = userQuery;
            if (lastError) {
                userPrompt = `The previous SQL query failed with error: "${lastError}".
Original SQL was: ${lastSQL}

PLEASE FIX THE SYNTAX. 
Common fix: If you have a JOIN, make sure it comes BEFORE the WHERE clause. 
Ensure all identifiers are double-quoted.`;
            }

            const sqlGen = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0, // Ensure consistency
            });

            let sql = sqlGen.choices[0]?.message?.content?.trim() || "";
            
            // Clean up backticks or explanations if the 8b model ignored instructions
            if (sql.includes("```")) {
                const match = sql.match(/```(?:sql)?([\s\S]*?)```/);
                if (match) sql = match[1].trim();
            }
            
            // If it still has multiple lines and one starts with SELECT, try to isolate it
            if (sql.toLowerCase().includes("select") && (sql.includes("Explanation") || sql.includes("Here is"))) {
                const lines = sql.split("\n");
                const selectLine = lines.find(l => l.trim().toLowerCase().startsWith("select"));
                if (selectLine) {
                    // Try to find the full query block
                    const startIndex = sql.toLowerCase().indexOf("select");
                    const endIndex = sql.indexOf(";", startIndex);
                    if (endIndex !== -1) {
                        sql = sql.substring(startIndex, endIndex + 1).trim();
                    }
                }
            }

            if (!sql) return { rows: [], sql: "" };
            lastSQL = sql;
            console.log("SQL Attempt " + attempts + ": " + sql);

            if (!isSafeSQL(sql)) return { rows: [], sql };

            const result = await prisma.$queryRawUnsafe<any[]>(sql);
            const rows = Array.isArray(result) ? result : [];
            
            if (rows.length === 0 && attempts === 1) {
                 lastError = "No results found. Try a more relaxed search using ILIKE or check ID prefixes.";
                 continue;
            }

            return { rows, sql };
        } catch (err: any) {
            console.error("SQL Error Attempt " + attempts + ": " + err.message);
            lastError = err.message;
            if (attempts >= 2) return { rows: [], sql: lastSQL };
        }
    }
    return { rows: [], sql: lastSQL };
}

export async function POST(req: Request) {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            try {
                const body = await req.json();
                const userQuery = body?.query?.trim();
                const history = body?.history || [];

                if (!userQuery) {
                    send({ type: "error", content: "Please enter a valid query." });
                    controller.close();
                    return;
                }

                if (!isRelevantQuery(userQuery)) {
                    send({ type: "error", content: "This system only answers questions related to Order-to-Cash business data." });
                    controller.close();
                    return;
                }

                // 1. Intent Classification
                send({ type: "status", content: "Classifying intent..." });
                const intent = await classifyIntent(userQuery, history);
                console.log("Intent: " + intent);

                // 2. Entity Resolution
                send({ type: "status", content: "Resolving entities..." });
                const mentionedIds = extractMentionedIds(userQuery);
                const potentialEntities = await extractEntityNames(userQuery, history);
                const resolvedIds = await resolveEntities(potentialEntities);

                let highlightedIds: string[] = [];
                let seedIds: string[] = Array.from(new Set([...mentionedIds, ...resolvedIds]));
                let dbResultForAnswer: any[] = [];
                let lastSQL = "";

                // 3. Main Data Fetching
                if (intent === "gap_analysis") {
                    send({ type: "status", content: "Running gap analysis..." });
                    const gapIds = await runGapAnalysis();
                    dbResultForAnswer = [{ message: "Found potential gaps in these representative entities", entities: gapIds }];
                    seedIds = gapIds.slice(0, 5);
                    highlightedIds = await traverseGraph(seedIds, 1);
                } else {
                    send({ type: "status", content: "Generating SQL..." });
                    const sqlResult = await runSQLQuery(userQuery, history);
                    dbResultForAnswer = sqlResult.rows;
                    lastSQL = sqlResult.sql;
                    
                    const extractedIds = extractHighlightedIds(dbResultForAnswer);
                    
                    send({ type: "status", content: "Optimizing graph visualization..." });
                    const filtered = await selectRelevantEntities(userQuery, intent, dbResultForAnswer);

                    if (filtered.seeds.length > 0 || extractedIds.length > 0) {
                        seedIds = Array.from(new Set([...mentionedIds, ...resolvedIds, ...filtered.seeds]));
                        const llmHighlights = filtered.highlights;
                        highlightedIds = Array.from(new Set([...seedIds, ...llmHighlights, ...extractedIds]));

                        if (intent !== "flow_trace" && llmHighlights.length === 0 && extractedIds.length === 0) {
                            highlightedIds = await traverseGraph(seedIds, 1);
                        }
                    } else {
                        seedIds = mentionedIds;
                        highlightedIds = mentionedIds.length > 0 ? await traverseGraph(mentionedIds, 1) : [];
                    }
                }

                // 4. Stream LLM Answer
                send({ type: "status", content: "Generating response..." });
                
                const responseStream = await groq.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        {
                            role: "system",
                            content: `You are a data analyst. Convert database results into a clear, concise natural language answer. 
Use bullet points for listing details. Mention IDs clearly so the user knows what was found on the graph.
CRITICAL: Always prioritize the CURRENT Database Results provided below over any conflicting values in the Conversation History.
Use the Conversation History only for context and resolving pronouns like "it" or "that".${formatHistory(history)}`,
                        },
                        {
                            role: "user",
                            content: "User query: " + userQuery + "\n\nDatabase result:\n" + JSON.stringify(serializeBigInt(dbResultForAnswer)),
                        },
                    ],
                    stream: true,
                });

                send({ type: "answer_start" });
                for await (const chunk of responseStream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        send({ type: "answer_chunk", content });
                    }
                }

                // 5. Final Metadata
                const highlightMode = (intent === "flow_trace" || intent === "gap_analysis") ? "flow" : "nodes_only";
                send({ 
                    type: "metadata", 
                    highlightedIds, 
                    seedIds, 
                    intent, 
                    highlightMode 
                });

                controller.close();
            } catch (error: any) {
                console.error("Stream Error:", error);
                send({ type: "error", content: "Error processing request: " + error.message });
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

