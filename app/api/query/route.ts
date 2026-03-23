export async function POST(req: Request) {
  const body = await req.json();

  return Response.json({
    answer: `You asked: ${body.query}`,
  });
}