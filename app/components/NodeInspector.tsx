"use client";

export default function NodeInspector({
    node,
    position,
}: {
    node: any;
    position: { x: number; y: number };
}) {
    if (!node) return null;

    const raw = node.data.raw;
    const type = node.data.type;
    const connections = node.data.connections || 0;

    // Map types to user-friendly titles
    const titles: Record<string, string> = {
        customer: "Customer",
        order: "Sales Order",
        delivery: "Delivery",
        invoice: "Invoice",
        journal: "Journal Entry",
        payment: "Payment"
    };

    const title = titles[type] || type;

    // Collect all fields to display
    const fieldsToDisplay: { key: string; value: React.ReactNode }[] = [];
    
    fieldsToDisplay.push({ key: "Entity", value: title });
    if (raw.id) fieldsToDisplay.push({ key: "ID", value: raw.id });
    if (raw.totalAmount !== undefined) fieldsToDisplay.push({ key: "Total Amount", value: raw.totalAmount });
    if (raw.amount !== undefined) fieldsToDisplay.push({ key: "Amount", value: raw.amount });
    if (raw.deliveryStatus) fieldsToDisplay.push({ key: "Status", value: raw.deliveryStatus });
    if (raw.status) fieldsToDisplay.push({ key: "Status", value: raw.status });

    // Try parsing metadata
    let metaFields: {k: string; v: string}[] = [];
    if (raw.metadata) {
        try {
            const parsed = JSON.parse(raw.metadata);
            // Capitalize first letter of keys and display them
            for (const [k, v] of Object.entries(parsed)) {
                // skip if it matches id, amount, null, or is an object
                if (k.toLowerCase() === "id" || v === null || v === "" || typeof v === "object") continue;
                
                const formattedKey = k.charAt(0).toUpperCase() + k.slice(1);
                metaFields.push({ k: formattedKey, v: String(v) });
            }
        } catch(e) {}
    }

    // append meta fields (up to a limit)
    const MAX_FIELDS = 18;
    let hiddenFields = false;

    // Filter out duplicates (like ID vs id)
    const existingKeys = new Set(fieldsToDisplay.map(f => f.key.toLowerCase()));
    // Custom mapping for duplicate values matching `amount` etc.
    if (raw.amount !== undefined) existingKeys.add("amount");
    if (raw.totalAmount !== undefined) existingKeys.add("total amount");
    
    for (const mf of metaFields) {
        if (!existingKeys.has(mf.k.toLowerCase())) {
            if (fieldsToDisplay.length < MAX_FIELDS) {
                fieldsToDisplay.push({ key: mf.k, value: mf.v });
                existingKeys.add(mf.k.toLowerCase());
            } else {
                hiddenFields = true;
            }
        }
    }

    return (
        <div
            className="fixed z-50 bg-white/95 backdrop-blur-md shadow-xl rounded-2xl border border-gray-200 p-4 text-[11px]"
            style={{
                top: position.y + 10,
                left: position.x + 10,
                width: 280,
                pointerEvents: "none",
            }}
        >
            <div className="text-sm font-semibold text-gray-900 mb-3">
                {title}
            </div>

            <div className="flex flex-col gap-1.5 text-gray-700">
                {fieldsToDisplay.map((f, i) => (
                    <div key={i} className="leading-snug break-words">
                        <span className="text-gray-500 font-medium">{f.key}:</span>{" "}
                        <span className="text-gray-800">{String(f.value)}</span>
                    </div>
                ))}
                
                {hiddenFields && (
                    <div className="text-[10px] text-gray-400 italic mt-1 pb-1">
                        Additional fields hidden for readability
                    </div>
                )}
                
                <div className="leading-snug break-words mt-1">
                    <span className="text-gray-500 font-medium">Connections:</span>{" "}
                    <span className="text-gray-800 font-semibold">{connections}</span>
                </div>
            </div>
        </div>
    );
}