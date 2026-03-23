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

// helper to handle SAP casing inconsistency
function get(obj: any, camel: string, pascal: string) {
    return obj[camel] ?? obj[pascal];
}

async function main() {
    const base = "sap-o2c-data";

    const customers = readAllJSONLFromFolder(path.join(base, "business_partners"));
    const orders = readAllJSONLFromFolder(path.join(base, "sales_order_headers"));
    const orderItems = readAllJSONLFromFolder(path.join(base, "sales_order_items"));
    const invoices = readAllJSONLFromFolder(path.join(base, "billing_document_headers"));
    const payments = readAllJSONLFromFolder(path.join(base, "payments_accounts_receivable"));
    const deliveries = readAllJSONLFromFolder(
        path.join(base, "outbound_delivery_headers")
    );

    const deliveryItems = readAllJSONLFromFolder(
        path.join(base, "outbound_delivery_items")
    );

    const journalEntries = readAllJSONLFromFolder(
        path.join(base, "journal_entry_items_accounts_receivable")
    );


    console.log("Loaded data");

    // ------------------ CUSTOMERS ------------------
    let insertedCustomers = 0;

    for (const c of customers) {
        const id = get(c, "businessPartner", "BusinessPartner");

        if (!id) continue;

        await prisma.customer.upsert({
            where: { id },
            update: {},
            create: {
                id,
                name:
                    get(c, "businessPartnerFullName", "BusinessPartnerFullName") ||
                    get(c, "businessPartnerName", "BusinessPartnerName") ||
                    "Unknown",
            },
        });

        insertedCustomers++;
        if (insertedCustomers >= 200) break;
    }

    console.log("Customers inserted:", insertedCustomers);

    // ------------------ PRODUCTS ------------------
    const seenProducts = new Set();

    for (const item of orderItems) {
        const material = get(item, "material", "Material");

        if (!material || seenProducts.has(material)) continue;

        seenProducts.add(material);

        await prisma.product.upsert({
            where: { id: material },
            update: {},
            create: {
                id: material,
                name: material,
            },
        });

        if (seenProducts.size >= 200) break;
    }

    console.log("Products inserted:", seenProducts.size);

    // ------------------ ORDERS ------------------
    let insertedOrders = 0;

    for (const o of orders) {
        const orderId = get(o, "salesOrder", "SalesOrder");
        const customerId = get(o, "soldToParty", "SoldToParty");

        if (!orderId || !customerId) continue;

        await prisma.order.upsert({
            where: { id: orderId },
            update: {},
            create: {
                id: orderId,
                customerId,
                createdAt: get(o, "creationDate", "CreationDate") || "",
                totalAmount: Number(get(o, "totalNetAmount", "TotalNetAmount") || 0),
                deliveryStatus: get(o, "overallDeliveryStatus", "OverallDeliveryStatus") || "UNKNOWN",
                metadata: JSON.stringify({
                    salesOrg: get(o, "salesOrganization", "SalesOrganization"),
                    currency: get(o, "transactionCurrency", "TransactionCurrency"),
                    createdBy: get(o, "createdByUser", "CreatedByUser"),
                    netAmount: get(o, "totalNetAmount", "TotalNetAmount"),
                    deliveryStatus: get(o, "overallDeliveryStatus", "OverallDeliveryStatus"),
                }),
            },
        });

        insertedOrders++;
        if (insertedOrders >= 200) break;
    }

    console.log("Orders inserted:", insertedOrders);

    // ------------------ ORDER ITEMS ------------------
    let insertedItems = 0;

    for (const i of orderItems) {
        const orderId = get(i, "salesOrder", "SalesOrder");
        const material = get(i, "material", "Material");

        if (!orderId || !material) continue;

        await prisma.orderItem.upsert({
            where: { id: `${orderId}-${material}` },
            update: {},
            create: {
                id: `${orderId}-${material}`,
                orderId,
                productId: material,
                quantity: Number(get(i, "orderQuantity", "OrderQuantity") || 0),
                netAmount: Number(get(i, "netAmount", "NetAmount") || 0),
                metadata: JSON.stringify({
                    plant: get(i, "plant", "Plant"),
                    storageLocation: get(i, "storageLocation", "StorageLocation"),
                    currency: get(i, "transactionCurrency", "TransactionCurrency"),
                }),
            },
        });

        insertedItems++;
        if (insertedItems >= 500) break;
    }

    console.log("OrderItems inserted:", insertedItems);

    // ------------------ INVOICES + JOURNAL ------------------
    let insertedInvoices = 0;

    for (const i of invoices) {
        const invoiceId = get(i, "billingDocument", "BillingDocument");
        const customerId = get(i, "soldToParty", "SoldToParty");

        if (!invoiceId || !customerId) continue;

        await prisma.invoice.upsert({
            where: { id: invoiceId },
            update: {},
            create: {
                id: invoiceId,
                customerId,
                accountingDocument: get(i, "accountingDocument", "AccountingDocument") || "NA",
                totalAmount: Number(get(i, "totalNetAmount", "TotalNetAmount") || 0),
                createdAt: get(i, "creationDate", "CreationDate") || "",
                metadata: JSON.stringify({
                    billingType: get(i, "billingDocumentType", "BillingDocumentType"),
                    currency: get(i, "transactionCurrency", "TransactionCurrency"),
                    companyCode: get(i, "companyCode", "CompanyCode"),
                    fiscalYear: get(i, "fiscalYear", "FiscalYear"),
                }),
            },
        });

        const accDoc = get(i, "accountingDocument", "AccountingDocument");

        if (accDoc) {
            await prisma.journalEntry.upsert({
                where: { id: accDoc },
                update: {},
                create: {
                    id: accDoc,
                    invoiceId: invoiceId,
                    amount: Number(get(i, "totalNetAmount", "TotalNetAmount") || 0),
                    createdAt: get(i, "creationDate", "CreationDate") || "",
                    metadata: JSON.stringify({
                        companyCode: get(i, "companyCode", "CompanyCode"),
                        fiscalYear: get(i, "fiscalYear", "FiscalYear"),
                        currency: get(i, "transactionCurrency", "TransactionCurrency"),
                    }),
                },
            });
        }

        insertedInvoices++;
        if (insertedInvoices >= 200) break;
    }

    console.log("Invoices inserted:", insertedInvoices);

    // ------------------ PAYMENTS ------------------
    let insertedPayments = 0;

    for (const p of payments) {
        const paymentId = get(p, "accountingDocument", "AccountingDocument");
        const customerId = get(p, "customer", "Customer");

        if (!paymentId || !customerId) continue;

        await prisma.payment.upsert({
            where: { id: paymentId },
            update: {},
            create: {
                id: paymentId,
                customerId,
                amount: Number(get(p, "amountInCompanyCodeCurrency", "AmountInCompanyCodeCurrency") || 0),
                createdAt: get(p, "postingDate", "PostingDate") || "",
                metadata: JSON.stringify({
                    companyCode: get(p, "companyCode", "CompanyCode"),
                    currency: get(p, "transactionCurrency", "TransactionCurrency"),
                    postingDate: get(p, "postingDate", "PostingDate"),
                }),
            },
        });

        insertedPayments++;
        if (insertedPayments >= 200) break;
    }

    console.log("Payments inserted:", insertedPayments);

    // ------------------ DELIVERIES ------------------
    let insertedDeliveries = 0;

    for (const d of deliveries) {
        const deliveryId = get(d, "deliveryDocument", "DeliveryDocument");

        const orderId =
            get(d, "referenceSDDocument", "ReferenceSDDocument") ||
            get(d, "referenceDocument", "ReferenceDocument") ||
            get(d, "precedingDocument", "PrecedingDocument");

        if (!deliveryId) continue;

        await prisma.delivery.upsert({
            where: { id: deliveryId },
            update: {},
            create: {
                id: deliveryId,
                createdAt: get(d, "creationDate", "CreationDate") || "",
                status:
                    get(d, "overallGoodsMovementStatus", "OverallGoodsMovementStatus") ||
                    "UNKNOWN",

                ...(orderId
                    ? {
                        order: {
                            connect: { id: orderId },
                        },
                    }
                    : {}),

                metadata: JSON.stringify({
                    shippingPoint: get(d, "shippingPoint", "ShippingPoint"),
                    deliveryType: get(d, "deliveryDocumentType", "DeliveryDocumentType"),
                    plant: get(d, "plant", "Plant"),
                }),
            }
        });

        insertedDeliveries++;
        if (insertedDeliveries >= 200) break;
    }

    console.log("Deliveries inserted:", insertedDeliveries);

    let insertedJournals = 0;

    for (const j of journalEntries) {
        const journalId = get(j, "accountingDocument", "AccountingDocument");
        const invoiceId = get(j, "referenceDocument", "ReferenceDocument");

        if (!journalId || !invoiceId) continue;

        await prisma.journalEntry.upsert({
            where: { id: journalId },
            update: {},
            create: {
                id: journalId,
                invoiceId: invoiceId,
                amount: Number(
                    get(j, "amountInTransactionCurrency", "AmountInTransactionCurrency") || 0
                ),
                createdAt: get(j, "postingDate", "PostingDate") || "",

                metadata: JSON.stringify({
                    companyCode: get(j, "companyCode", "CompanyCode"),
                    fiscalYear: get(j, "fiscalYear", "FiscalYear"),
                    glAccount: get(j, "gLAccount", "GLAccount"),
                    currency: get(j, "transactionCurrency", "TransactionCurrency"),
                    profitCenter: get(j, "profitCenter", "ProfitCenter"),
                    costCenter: get(j, "costCenter", "CostCenter"),
                }),
            },
        });

        insertedJournals++;
        if (insertedJournals >= 200) break;
    }

    console.log("Journal Entries inserted:", insertedJournals);

    console.log("🔥 FULL GRAPH DATA SEEDED");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });