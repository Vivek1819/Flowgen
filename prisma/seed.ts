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

    const deliveryToOrderMap = new Map<string, string>();
    for (const item of deliveryItems) {
        const delId = get(item, "deliveryDocument", "DeliveryDocument");
        const ordId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        if (delId && ordId && !deliveryToOrderMap.has(delId)) {
            deliveryToOrderMap.set(delId, ordId);
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
    const customerData = [];
    const seenCustomers = new Set<string>();

    for (const c of customers) {
        const id = get(c, "businessPartner", "BusinessPartner");
        if (!id || seenCustomers.has(id)) continue;
        seenCustomers.add(id);

        customerData.push({
            id,
            name:
                get(c, "businessPartnerFullName", "BusinessPartnerFullName") ||
                get(c, "businessPartnerName", "BusinessPartnerName") ||
                "Unknown",
        });

        if (customerData.length >= 200) break;
    }

    await prisma.customer.createMany({ data: customerData, skipDuplicates: true });
    console.log("Customers inserted:", customerData.length);

    // ------------------ PRODUCTS ------------------
    const productData = [];
    const seenProducts = new Set<string>();

    for (const item of orderItems) {
        const material = get(item, "material", "Material");
        if (!material || seenProducts.has(material)) continue;
        seenProducts.add(material);

        productData.push({
            id: material,
            name: material,
        });

        if (productData.length >= 200) break;
    }

    await prisma.product.createMany({ data: productData, skipDuplicates: true });
    console.log("Products inserted:", productData.length);

    // ------------------ ORDERS ------------------
    const orderData = [];
    const insertedOrderIds = new Set<string>();

    for (const o of orders) {
        const orderId = get(o, "salesOrder", "SalesOrder");
        const customerId = get(o, "soldToParty", "SoldToParty");

        if (!orderId || !customerId || insertedOrderIds.has(orderId)) continue;

        orderData.push({
            id: orderId,
            customerId,
            createdAt: get(o, "creationDate", "CreationDate") || "",
            totalAmount: Number(get(o, "totalNetAmount", "TotalNetAmount") || 0),
            deliveryStatus: get(o, "overallDeliveryStatus", "OverallDeliveryStatus") || "UNKNOWN",
            metadata: JSON.stringify(cleanMetadata(o)),
        });

        insertedOrderIds.add(orderId);
        if (orderData.length >= 2000) break; 
    }

    await prisma.order.createMany({ data: orderData, skipDuplicates: true });
    console.log("Orders inserted:", orderData.length);

    // ------------------ DUMMY DEPENDENCIES FROM ITEMS ------------------
    console.log("Injecting missing dependencies for foreign keys...");

    const missingProductIds = new Set<string>();
    const missingOrderIds = new Set<string>();

    for (const item of invoiceItems) {
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const productId = get(item, "material", "Material");

        if (productId && !seenProducts.has(productId)) missingProductIds.add(productId);
        if (orderId && !insertedOrderIds.has(orderId)) missingOrderIds.add(orderId);
    }

    for (const item of deliveryItems) {
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const orderItemId = get(item, "referenceSdDocumentItem", "ReferenceSdDocumentItem");
        const productId = orderId && orderItemId
            ? orderItemToProductMap.get(`${orderId}-${Number(orderItemId)}`) || ""
            : "";

        if (productId && !seenProducts.has(productId)) missingProductIds.add(productId);
        if (orderId && !insertedOrderIds.has(orderId)) missingOrderIds.add(orderId);
    }

    if (missingProductIds.size > 0) {
        const productData = Array.from(missingProductIds).map(id => ({ id, name: id }));
        await prisma.product.createMany({ data: productData, skipDuplicates: true });
        for (const id of missingProductIds) seenProducts.add(id);
    }

    if (missingOrderIds.size > 0) {
        const orderData = Array.from(missingOrderIds).map(id => ({
            id,
            customerId: customerData.length > 0 ? get(customers[0], "businessPartner", "BusinessPartner") : "UNKNOWN",
            createdAt: "",
            totalAmount: 0,
            deliveryStatus: "UNKNOWN",
            metadata: "{}"
        }));
        await prisma.order.createMany({ data: orderData, skipDuplicates: true });
        for (const id of missingOrderIds) insertedOrderIds.add(id);
    }
    
    // ------------------ ORDER ITEMS ------------------
    const orderItemData = [];
    for (const i of orderItems) {
        const orderId = get(i, "salesOrder", "SalesOrder");
        const material = get(i, "material", "Material");

        if (!orderId || !material) continue;
        const id = `${orderId}-${material}`;

        orderItemData.push({
            id,
            orderId,
            productId: material,
            quantity: Number(get(i, "orderQuantity", "OrderQuantity") || 0),
            netAmount: Number(get(i, "netAmount", "NetAmount") || 0),
            metadata: JSON.stringify(cleanMetadata(i)),
        });

        if (orderItemData.length >= 500) break;
    }
    await prisma.orderItem.createMany({ data: orderItemData, skipDuplicates: true });
    console.log("OrderItems inserted:", orderItemData.length);

    // ------------------ INVOICES + JOURNAL ------------------
    const invoiceData = [];
    const journalData = [];
    const insertedInvoiceIds = new Set<string>();

    for (const i of invoices) {
        const invoiceId = get(i, "billingDocument", "BillingDocument");
        const customerId = get(i, "soldToParty", "SoldToParty");

        if (!invoiceId || !customerId || insertedInvoiceIds.has(invoiceId)) continue;

        const orderId = invoiceToOrderMap.get(invoiceId);

        invoiceData.push({
            id: invoiceId,
            customerId,
            accountingDocument: get(i, "accountingDocument", "AccountingDocument") || "NA",
            totalAmount: Number(get(i, "totalNetAmount", "TotalNetAmount") || 0),
            createdAt: get(i, "creationDate", "CreationDate") || "",
            metadata: JSON.stringify(cleanMetadata(i)),
            orderId: (orderId && insertedOrderIds.has(orderId)) ? orderId : null,
        });

        insertedInvoiceIds.add(invoiceId);

        const accDoc = get(i, "accountingDocument", "AccountingDocument");
        if (accDoc) {
            journalData.push({
                id: accDoc,
                invoiceId: invoiceId,
                amount: Number(get(i, "totalNetAmount", "TotalNetAmount") || 0),
                createdAt: get(i, "creationDate", "CreationDate") || "",
                metadata: JSON.stringify(cleanMetadata(i)),
            });
        }

        if (invoiceData.length >= 1000) break;
    }

    await prisma.invoice.createMany({ data: invoiceData, skipDuplicates: true });
    await prisma.journalEntry.createMany({ data: journalData, skipDuplicates: true });
    console.log("Invoices inserted:", invoiceData.length);

    // ------------------ PAYMENTS ------------------
    const paymentData = [];
    for (const p of payments) {
        const paymentId = get(p, "accountingDocument", "AccountingDocument");
        const customerId = get(p, "customer", "Customer");

        if (!paymentId || !customerId) continue;

        paymentData.push({
            id: paymentId,
            customerId,
            amount: Number(get(p, "amountInCompanyCodeCurrency", "AmountInCompanyCodeCurrency") || 0),
            createdAt: get(p, "postingDate", "PostingDate") || "",
            metadata: JSON.stringify(cleanMetadata(p)),
        });

        if (paymentData.length >= 200) break;
    }
    await prisma.payment.createMany({ data: paymentData, skipDuplicates: true });
    console.log("Payments inserted:", paymentData.length);

    // ------------------ DELIVERIES ------------------
    const deliveryData = [];
    const insertedDeliveryIds = new Set<string>();

    for (const d of deliveries) {
        const deliveryId = get(d, "deliveryDocument", "DeliveryDocument");
        const orderId = deliveryToOrderMap.get(deliveryId);

        if (!deliveryId || !orderId || !insertedOrderIds.has(orderId)) continue;

        deliveryData.push({
            id: deliveryId,
            orderId: orderId,
            createdAt: get(d, "creationDate", "CreationDate") || "",
            status: get(d, "overallGoodsMovementStatus", "OverallGoodsMovementStatus") || "UNKNOWN",
            metadata: JSON.stringify(cleanMetadata(d)),
        });

        insertedDeliveryIds.add(deliveryId);
        if (deliveryData.length >= 1000) break;
    }

    await prisma.delivery.createMany({ data: deliveryData, skipDuplicates: true });
    console.log("Deliveries inserted:", deliveryData.length);

    // ------------------ DELIVERY ITEMS ------------------
    const delItemData = [];
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

        delItemData.push({
            id: `${deliveryId}-${itemId}`,
            deliveryId,
            productId,
            quantity: Number(get(item, "actualDeliveryQuantity", "ActualDeliveryQuantity") || 0),
        });

        if (delItemData.length >= 500) break;
    }
    await prisma.deliveryItem.createMany({ data: delItemData, skipDuplicates: true });
    console.log("Delivery Items inserted:", delItemData.length);

    // ------------------ INVOICE ITEMS ------------------
    const invItemData = [];
    for (const item of invoiceItems) {
        const invoiceId = get(item, "billingDocument", "BillingDocument");
        const orderId = get(item, "referenceSdDocument", "ReferenceSdDocument");
        const productId = get(item, "material", "Material");
        const itemId = get(item, "billingDocumentItem", "BillingDocumentItem");

        if (!invoiceId || !orderId || !productId || !insertedInvoiceIds.has(invoiceId) || !insertedOrderIds.has(orderId) || !seenProducts.has(productId)) continue;

        invItemData.push({
            id: `${invoiceId}-${itemId}`,
            invoiceId,
            orderId,
            productId,
            quantity: Number(get(item, "billingQuantity", "BillingQuantity") || 0),
            netAmount: Number(get(item, "netAmount", "NetAmount") || 0),
        });

        if (invItemData.length >= 500) break;
    }
    await prisma.invoiceItem.createMany({ data: invItemData, skipDuplicates: true });
    console.log("Invoice Items inserted:", invItemData.length);

    const journalBatchData = [];
    for (const j of journalEntries) {
        const journalId = get(j, "accountingDocument", "AccountingDocument");
        const invoiceId = get(j, "referenceDocument", "ReferenceDocument");

        if (!journalId || !invoiceId || !insertedInvoiceIds.has(invoiceId)) continue;

        journalBatchData.push({
            id: journalId,
            invoiceId: invoiceId,
            amount: Number(get(j, "amountInTransactionCurrency", "AmountInTransactionCurrency") || 0),
            createdAt: get(j, "postingDate", "PostingDate") || "",
            metadata: JSON.stringify(cleanMetadata(j)),
        });

        if (journalBatchData.length >= 200) break;
    }
    await prisma.journalEntry.createMany({ data: journalBatchData, skipDuplicates: true });
    console.log("Journal Entries inserted:", journalBatchData.length);

    console.log("🔥 FULL GRAPH DATA SEEDED");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });