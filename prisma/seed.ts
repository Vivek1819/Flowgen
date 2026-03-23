import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // Customer
    await prisma.customer.create({
        data: {
            id: "C1",
            name: "Acme Corp",
        },
    });

    // Order
    await prisma.order.create({
        data: {
            id: "O1",
            customerId: "C1",
            createdAt: "2024-01-01",
            totalAmount: 1000,
            deliveryStatus: "DELIVERED",
        },
    });

    // Order Item
    await prisma.orderItem.create({
        data: {
            id: "OI1",
            orderId: "O1",
            productId: "P1",
            quantity: 2,
            netAmount: 500,
        },
    });

    // Invoice
    await prisma.invoice.create({
        data: {
            id: "I1",
            customerId: "C1",
            accountingDocument: "A1",
            totalAmount: 1000,
            createdAt: "2024-01-02",
        },
    });

    // Payment
    await prisma.payment.create({
        data: {
            id: "P1",
            customerId: "C1",
            amount: 1000,
            createdAt: "2024-01-03",
        },
    });

    console.log("Seed data inserted 🌱");
}

main()
    .catch((e) => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });