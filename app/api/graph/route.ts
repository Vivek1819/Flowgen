import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const [
      customers,
      orders,
      deliveries,
      products,
      orderItems,
      deliveryItems,
      invoices,
      journalEntries,
      payments,
    ] = await Promise.all([
      prisma.customer.findMany(),
      prisma.order.findMany(),
      prisma.delivery.findMany(),
      prisma.product.findMany(),
      prisma.orderItem.findMany(),
      prisma.deliveryItem.findMany(),
      prisma.invoice.findMany(),
      prisma.journalEntry.findMany(),
      prisma.payment.findMany(),
    ]);

    return Response.json({
      customers,
      orders,
      deliveries,
      products,
      orderItems,
      deliveryItems,
      invoices,
      journalEntries,
      payments,
    });
  } catch (error) {
    console.error(error);

    return Response.json({
      error: "Failed to fetch graph data",
    });
  }
}