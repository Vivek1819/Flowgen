import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

function isSafeSQL(sql: string) {
    const lower = sql.toLowerCase().trim();

    // Only allow SELECT
    if (!lower.startsWith("select")) return false;

    // Block dangerous keywords
    const blocked = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "truncate",
    ];

    return !blocked.some((keyword) => lower.includes(keyword));
}

function isRelevantQuery(query: string) {
    const allowedKeywords = [
        "order",
        "orders",
        "customer",
        "customers",
        "delivery",
        "deliveries",
        "invoice",
        "invoices",
        "payment",
        "payments",
        "product",
        "products",
        "billing",
        "journal",
        "flow",
        "trace",
        "broken",
        "incomplete"
    ];

    const lowerQuery = query.toLowerCase();

    return allowedKeywords.some((keyword) =>
        lowerQuery.includes(keyword)
    );
}

function serializeBigInt(data: any): any {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? Number(value) : value
        )
    );
}

// The columns in our DB result that directly correspond to graph node IDs
const ID_COLUMNS = ["id", "orderId", "customerId", "invoiceId", "deliveryId", "paymentId", "journalId", "journalEntryId"];

function extractHighlightedIds(rows: any[]): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
        for (const col of ID_COLUMNS) {
            const val = row[col];
            if (val && typeof val === "string") {
                ids.add(val);
            }
        }
    }
    return Array.from(ids);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const userQuery = body?.query?.trim();

        if (!userQuery) {
            return Response.json({
                answer: "Please enter a valid query.",
            });
        }

        // ✅ Guardrail
        if (!isRelevantQuery(userQuery)) {
            return Response.json({
                answer:
                    "This system only answers questions related to Order-to-Cash business data.",
            });
        }

        // ✅ STEP 1: LLM → SQL
        const sqlGen = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `
                        You are an expert SQL generator for a SAP Order-to-Cash (O2C) database.

                        Generate ONLY SQL queries based on the schema below for SQLite.

                        Schema:
                        - Customer(id, name)
                        - Order(id, customerId, createdAt, totalAmount, deliveryStatus)
                        - OrderItem(id, orderId, productId, quantity, netAmount)
                        - Product(id, name)
                        - Delivery(id, orderId, createdAt, status)
                        - DeliveryItem(id, deliveryId, productId, quantity)
                        - Invoice(id, customerId, orderId, accountingDocument, totalAmount, createdAt)
                        - InvoiceItem(id, invoiceId, orderId, productId, quantity, netAmount)
                        - JournalEntry(id, invoiceId, amount, createdAt)
                        - Payment(id, customerId, amount, createdAt)

                        Synonyms & Mapping:
                        - "Billing Document" or "Bill" = Invoice
                        - "Journal" = JournalEntry
                        - "Material" = Product
                        - "Sales Order" = Order

                        Rules:
                        - ONLY generate exactly ONE single SQL query. Never generate multiple queries.
                        - Only generate SELECT queries.
                        - Do NOT explain anything. Do NOT include markdown quotes, just plain SQL.
                        - Use correct table names exactly as given. Wrap table names in double quotes, e.g. "Order".
                        - For 'Give me ONE example' or tracing, use LIMIT 1 (do NOT use WHERE id = 1 unless an ID is explicitly provided in the user prompt).
                        - To trace the full flow, JOIN "Order" -> Delivery -> Invoice -> JournalEntry.
                        - To find incomplete flows, use LEFT JOIN and check for NULL (e.g. Invoice.id IS NULL).
                        - Always limit results using LIMIT 50 to prevent overflow.
                        `
                },

                {
                    role: "user",
                    content: userQuery,
                },
            ],
        });

        const generatedSQL =
            sqlGen.choices[0]?.message?.content?.trim() || "";

        console.log("Generated SQL:", generatedSQL);

        if (!isSafeSQL(generatedSQL)) {
            return Response.json({
                answer: "Unsafe or invalid query generated.",
            });
        }

        const safeSQL = generatedSQL
            .replace(/\s+/g, " ")
            .trim();

        // ✅ STEP 2: Execute SQL
        let dbResult;

        try {
            dbResult = await prisma.$queryRawUnsafe(safeSQL) as any[];
            if (Array.isArray(dbResult) && dbResult.length > 25) {
                dbResult = dbResult.slice(0, 25);
            }
            console.log("DB Result length:", dbResult?.length);
            require('fs').appendFileSync('sql-logs.txt', 'DB_RESULT:\\n' + JSON.stringify(serializeBigInt(dbResult)) + '\\n\\n');
        } catch (err) {
            console.error("SQL Execution Error:", err);

            return Response.json({
                answer: "Failed to execute generated query.",
            });
        }

        // ✅ STEP 3: Format result via LLM
        const finalResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a data analyst. Convert database results into a clear natural language answer.",
                },
                {
                    role: "user",
                    content: `User query: ${userQuery}

                    Database result:
                    ${JSON.stringify(serializeBigInt(dbResult))}
                    `,
                },
            ],
        });

        const answer =
            finalResponse.choices[0]?.message?.content ||
            "No response generated.";

        const highlightedIds = extractHighlightedIds(serializeBigInt(dbResult));

        return Response.json({ answer, highlightedIds });

    } catch (error) {
        console.error(error);

        return Response.json({
            answer: "Error processing request",
        });
    }
}