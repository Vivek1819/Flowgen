import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function readAllJSONLFromFolder(folderPath: string) {
    const files = fs.readdirSync(folderPath);
    let allData: any[] = [];

    for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;

        const filePath = path.join(folderPath, file);
        const lines = fs.readFileSync(filePath, "utf-8").split("\n");

        const parsed = lines.filter(Boolean).map((line) => JSON.parse(line));
        allData = allData.concat(parsed);
    }

    return allData;
}

async function main() {
    const base = "sap-o2c-data";

    // LOAD DATA
    const customers = readAllJSONLFromFolder(
        path.join(base, "business_partners")
    );

    const orders = readAllJSONLFromFolder(
        path.join(base, "sales_order_headers")
    );

    const orderItems = readAllJSONLFromFolder(
        path.join(base, "sales_order_items")
    );

    const invoices = readAllJSONLFromFolder(
        path.join(base, "billing_document_headers")
    );

    const payments = readAllJSONLFromFolder(
        path.join(base, "payments_accounts_receivable")
    );

    console.log("Customers:", customers.length);
    console.log("Orders:", orders.length);

    // ------------------ CUSTOMERS ------------------
    const seenCustomers = new Set();

    for (const c of customers) {
        const customerId = c.businessPartner || c.customer;

        if (!customerId || seenCustomers.has(customerId)) continue;

        seenCustomers.add(customerId);

        await prisma.customer.create({
            data: {
                id: customerId,
                name:
                    c.businessPartnerFullName ||
                    c.businessPartnerName ||
                    "Unknown",
            },
        });

        if (seenCustomers.size >= 100) break; // limit safely
    }

    // ------------------ ORDERS ------------------
    for (const o of orders.slice(0, 200)) {
        const orderId = o.salesOrder;
        const customerId = o.soldToParty;

        if (!orderId || !customerId) continue;

        const items = orderItems
            .filter((i: any) => i.salesOrder === orderId)
            .slice(0, 10)
            .map((i: any) => ({
                product: i.material,
                quantity: i.orderQuantity,
                amount: i.netAmount,
            }));

        await prisma.order.upsert({
            where: { id: orderId },
            update: {},
            create: {
                id: orderId,
                customerId,
                createdAt: o.creationDate || "",
                totalAmount: Number(o.totalNetAmount || 0),
                deliveryStatus: o.overallDeliveryStatus || "UNKNOWN",
                metadata: JSON.stringify({
                    salesOrg: o.salesOrganization,
                    items,
                }),
            },
        });
    }

    // ------------------ INVOICES ------------------
    for (const i of invoices.slice(0, 200)) {
        const invoiceId = i.billingDocument;
        const customerId = i.soldToParty;

        if (!invoiceId || !customerId) continue;

        await prisma.invoice.upsert({
            where: { id: invoiceId },
            update: {},
            create: {
                id: invoiceId,
                customerId,
                accountingDocument: i.accountingDocument || "NA",
                totalAmount: Number(i.totalNetAmount || 0),
                createdAt: i.creationDate || "",
                metadata: JSON.stringify({
                    billingType: i.billingDocumentType,
                    currency: i.transactionCurrency,
                }),
            },
        });
    }

    // ------------------ PAYMENTS ------------------
    for (const p of payments.slice(0, 200)) {
        const paymentId = p.accountingDocument;
        const customerId = p.customer;

        if (!paymentId || !customerId) continue;

        await prisma.payment.upsert({
            where: { id: paymentId },
            update: {},
            create: {
                id: paymentId,
                customerId,
                amount: Number(p.amountInCompanyCodeCurrency || 0),
                createdAt: p.postingDate || "",
                metadata: JSON.stringify({
                    companyCode: p.companyCode,
                    currency: p.transactionCurrency,
                }),
            },
        });
    }

    console.log("🔥 DATA SEEDED CORRECTLY WITH METADATA");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });