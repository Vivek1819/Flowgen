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
                        You are an expert SQL generator.

                        Generate ONLY SQL queries based on the schema below.

                        Schema:
                        - Customer(id, name)
                        - Order(id, customerId, createdAt, totalAmount, deliveryStatus)
                        - OrderItem(id, orderId, productId, quantity, netAmount)
                        - Invoice(id, customerId, accountingDocument, totalAmount, createdAt)
                        - Payment(id, customerId, amount, createdAt)

                        Rules:
                        - Only generate SELECT queries
                        - Do NOT explain anything
                        - Do NOT include markdown
                        - Use correct table names exactly as given
                        - If a table name is a reserved SQL keyword (like Order), wrap it in double quotes ("Order")
                        - Keep queries simple
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
            .replace(/\bOrder\b/g, '"Order"')
            .replace(/\s+/g, " ")
            .trim();

        // ✅ STEP 2: Execute SQL
        let dbResult;

        try {
            dbResult = await prisma.$queryRawUnsafe(safeSQL);
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

        return Response.json({ answer });

    } catch (error) {
        console.error(error);

        return Response.json({
            answer: "Error processing request",
        });
    }
}