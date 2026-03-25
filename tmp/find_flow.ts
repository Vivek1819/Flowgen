import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function findFullFlow() {
    try {
        const chain = await prisma.invoice.findFirst({
            where: {
                orderId: { not: null },
                journalEntries: { some: {} }
            },
            include: {
                order: true,
                journalEntries: true
            }
        });

        if (chain) {
            console.log("FOUND CHAIN (Order -> Invoice -> Journal):");
            console.log("Order ID:", chain.order?.id);
            console.log("Invoice ID:", chain.id);
            console.log("Journal ID:", chain.journalEntries[0].id);
            
            if (chain.orderId) {
                const deliveries = await prisma.delivery.findMany({ where: { orderId: chain.orderId } });
                console.log("Deliveries for this Order:", deliveries.map(d => d.id));
            }
        } else {
            console.log("No Order -> Invoice -> Journal chain found.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

findFullFlow();
