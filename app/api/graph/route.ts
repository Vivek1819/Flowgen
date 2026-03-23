import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const customers = await prisma.customer.findMany();
    const orders = await prisma.order.findMany();
    const invoices = await prisma.invoice.findMany();

    return Response.json({
      customers,
      orders,
      invoices,
    });
  } catch (error) {
    console.error(error);

    return Response.json({
      error: "Failed to fetch graph data",
    });
  }
}