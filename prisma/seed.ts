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

function cleanMetadata(obj: any) {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
        // Prefer camelCase if both exist (e.g., if key is PascalCase and the camelCase version exists, skip the PascalCase one)
        const lowerFirst = key.charAt(0).toLowerCase() + key.slice(1);
        
        if (key !== lowerFirst && obj[lowerFirst] !== undefined && obj[key] === obj[lowerFirst]) {
            continue;
        }
        
        cleaned[key] = obj[key];
    }
    return cleaned;
}

async function main() {
    const base = "sap-o2c-data";

    const customers = readAllJSONLFromFolder(path.join(base, "business_partners"));
    const orders = readAllJSONLFromFolder(path.join(base, "sales_order_headers"));
    const orderItems = readAllJSONLFromFolder(path.join(base, "sales_order_items"));
    const invoices = readAllJSONLFromFolder(path.join(base, "billing_document_headers"));
    const invoiceItems = readAllJSONLFromFolder(path.join(base, "billing_document_items"));
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

    const invoiceToOrderMap = new Map<string, string>();
    for (const item of invoiceItems) {
        const invId = get(item, "billingDocument", "BillingDocument");
        const ordId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        if (invId && ordId && !invoiceToOrderMap.has(invId)) {
            invoiceToOrderMap.set(invId, ordId);
        }
    }

    const orderItemToProductMap = new Map<string, string>();
    for (const item of orderItems) {
        const ordId = get(item, "salesOrder", "SalesOrder");
        const itemId = get(item, "salesOrderItem", "SalesOrderItem");
        const material = get(item, "material", "Material");
        // Sometimes item ID has leading zeros, e.g. "000010" vs "10"
        if (ordId && itemId && material) {
            orderItemToProductMap.set(`${ordId}-${Number(itemId)}`, material);
        }
    }


    console.log("Clearing existing data...");
    await prisma.journalEntry.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.deliveryItem.deleteMany();
    await prisma.delivery.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();

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
    const insertedOrderIds = new Set<string>();

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
                metadata: JSON.stringify(cleanMetadata(o)),
            },
        });

        insertedOrderIds.add(orderId);
        insertedOrders++;
        if (insertedOrders >= 2000) break; // Insert up to 2000 orders to get good overlap
    }

    console.log("Orders inserted:", insertedOrders);

    // ------------------ DUMMY DEPENDENCIES FROM ITEMS ------------------
    console.log("Injecting missing dependencies for foreign keys...");
    for (const item of invoiceItems) {
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const productId = get(item, "material", "Material");

        if (productId && !seenProducts.has(productId)) {
            await prisma.product.upsert({
                where: { id: productId },
                update: {},
                create: { id: productId, name: productId },
            });
            seenProducts.add(productId);
        }

        if (orderId && !insertedOrderIds.has(orderId)) {
            await prisma.order.upsert({
                where: { id: orderId },
                update: {},
                create: {
                    id: orderId,
                    customerId: insertedCustomers > 0 ? customers[0].businessPartner : "UNKNOWN",
                    createdAt: "",
                    totalAmount: 0,
                    deliveryStatus: "UNKNOWN",
                    metadata: "{}"
                },
            });
            insertedOrderIds.add(orderId);
        }
    }

    // Also inject from deliveryItems
    for (const item of deliveryItems) {
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const orderItemId = get(item, "referenceSdDocumentItem", "ReferenceSdDocumentItem");
        const productId = orderId && orderItemId
            ? orderItemToProductMap.get(`${orderId}-${Number(orderItemId)}`) || ""
            : "";

        if (productId && !seenProducts.has(productId)) {
            await prisma.product.upsert({
                where: { id: productId },
                update: {},
                create: { id: productId, name: productId },
            });
            seenProducts.add(productId);
        }

        if (orderId && !insertedOrderIds.has(orderId)) {
            await prisma.order.upsert({
                where: { id: orderId },
                update: {},
                create: {
                    id: orderId,
                    customerId: customers[0] ? get(customers[0], "businessPartner", "BusinessPartner") : "UNKNOWN",
                    createdAt: "",
                    totalAmount: 0,
                    deliveryStatus: "UNKNOWN",
                    metadata: "{}"
                },
            });
            insertedOrderIds.add(orderId);
        }
    }
    
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
                metadata: JSON.stringify(cleanMetadata(i)),
            },
        });

        insertedItems++;
        if (insertedItems >= 500) break;
    }

    console.log("OrderItems inserted:", insertedItems);

    // ------------------ INVOICES + JOURNAL ------------------
    let insertedInvoices = 0;
    const insertedInvoiceIds = new Set<string>();

    for (const i of invoices) {
        const invoiceId = get(i, "billingDocument", "BillingDocument");
        const customerId = get(i, "soldToParty", "SoldToParty");

        if (!invoiceId || !customerId) continue;

        const orderId = invoiceToOrderMap.get(invoiceId);

        await prisma.invoice.upsert({
            where: { id: invoiceId },
            update: {},
            create: {
                id: invoiceId,
                customerId,
                accountingDocument: get(i, "accountingDocument", "AccountingDocument") || "NA",
                totalAmount: Number(get(i, "totalNetAmount", "TotalNetAmount") || 0),
                createdAt: get(i, "creationDate", "CreationDate") || "",
                metadata: JSON.stringify(cleanMetadata(i)),
                orderId: (orderId && insertedOrderIds.has(orderId)) ? orderId : null,
            },
        });

        insertedInvoiceIds.add(invoiceId);

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
                    metadata: JSON.stringify(cleanMetadata(i)),
                },
            });
        }

        insertedInvoices++;
        if (insertedInvoices >= 1000) break;
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
                metadata: JSON.stringify(cleanMetadata(p)),
            },
        });

        insertedPayments++;
        if (insertedPayments >= 200) break;
    }

    console.log("Payments inserted:", insertedPayments);

    // ------------------ DELIVERIES ------------------
    let insertedDeliveries = 0;
    const insertedDeliveryIds = new Set<string>();

    for (const d of deliveries) {
        const deliveryId = get(d, "deliveryDocument", "DeliveryDocument");

        const orderId =
            get(d, "referenceSDDocument", "ReferenceSDDocument") ||
            get(d, "referenceDocument", "ReferenceDocument") ||
            get(d, "precedingDocument", "PrecedingDocument");

        if (!deliveryId || !orderId || !insertedOrderIds.has(orderId)) continue;

        await prisma.delivery.upsert({
            where: { id: deliveryId },
            update: {},
            create: {
                id: deliveryId,
                createdAt: get(d, "creationDate", "CreationDate") || "",
                status:
                    get(d, "overallGoodsMovementStatus", "OverallGoodsMovementStatus") ||
                    "UNKNOWN",

                ...(orderId && insertedOrderIds.has(orderId)
                    ? {
                        order: {
                            connect: { id: orderId },
                        },
                    }
                    : {}),

                metadata: JSON.stringify(cleanMetadata(d)),
            }
        });

        insertedDeliveries++;
        insertedDeliveryIds.add(deliveryId);
        if (insertedDeliveries >= 1000) break;
    }

    console.log("Deliveries inserted:", insertedDeliveries);

    // ------------------ DELIVERY ITEMS ------------------
    let insertedDelItems = 0;
    for (const item of deliveryItems) {
        const deliveryId = get(item, "deliveryDocument", "DeliveryDocument");
        const itemId = get(item, "deliveryDocumentItem", "DeliveryDocumentItem");
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const orderItemId = get(item, "referenceSdDocumentItem", "ReferenceSdDocumentItem");
        
        let productId = "";
        if (orderId && orderItemId) {
            productId = orderItemToProductMap.get(`${orderId}-${Number(orderItemId)}`) || "";
        }

        if (!deliveryId || !productId || !insertedDeliveryIds.has(deliveryId) || !seenProducts.has(productId)) continue;

        await prisma.deliveryItem.upsert({
            where: { id: `${deliveryId}-${itemId}` },
            update: {},
            create: {
                id: `${deliveryId}-${itemId}`,
                deliveryId,
                productId,
                quantity: Number(get(item, "actualDeliveryQuantity", "ActualDeliveryQuantity") || 0),
            }
        });
        insertedDelItems++;
        if (insertedDelItems >= 500) break;
    }
    console.log("Delivery Items inserted:", insertedDelItems);

    // ------------------ INVOICE ITEMS ------------------
    let insertedInvItems = 0;
    for (const item of invoiceItems) {
        const invoiceId = get(item, "billingDocument", "BillingDocument");
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const productId = get(item, "material", "Material");
        const itemId = get(item, "billingDocumentItem", "BillingDocumentItem");

        if (!invoiceId || !orderId || !productId || !insertedInvoiceIds.has(invoiceId) || !insertedOrderIds.has(orderId) || !seenProducts.has(productId)) continue;

        await prisma.invoiceItem.upsert({
            where: { id: `${invoiceId}-${itemId}` },
            update: {},
            create: {
                id: `${invoiceId}-${itemId}`,
                invoiceId,
                orderId,
                productId,
                quantity: Number(get(item, "billingQuantity", "BillingQuantity") || 0),
                netAmount: Number(get(item, "netAmount", "NetAmount") || 0),
            }
        });
        insertedInvItems++;
        if (insertedInvItems >= 500) break;
    }
    console.log("Invoice Items inserted:", insertedInvItems);

    let insertedJournals = 0;

    for (const j of journalEntries) {
        const journalId = get(j, "accountingDocument", "AccountingDocument");
        const invoiceId = get(j, "referenceDocument", "ReferenceDocument");

        if (!journalId || !invoiceId || !insertedInvoiceIds.has(invoiceId)) continue;

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

                metadata: JSON.stringify(cleanMetadata(j)),
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