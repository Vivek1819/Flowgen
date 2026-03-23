import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const userQuery = body?.query?.trim();

        if (!userQuery) {
            return Response.json({
                answer: "Please enter a valid query.",
            });
        }

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an assistant that analyzes Order-to-Cash business data. Only answer queries related to business data, orders, deliveries, invoices, or payments. Be concise and factual.",
                },
                {
                    role: "user",
                    content: userQuery,
                },
            ],
        });

        const answer =
            completion.choices[0]?.message?.content ||
            "No response generated.";

        return Response.json({ answer });
    } catch (error) {
        console.error(error);

        return Response.json({
            answer: "Error processing request",
        });
    }
}