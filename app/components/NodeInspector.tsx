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

    return (
        <div
            className="fixed z-50 bg-white/95 backdrop-blur-md shadow-xl rounded-2xl border border-gray-200 p-4 text-xs"
            style={{
                top: position.y + 10,
                left: position.x + 10,
                width: 260,
                pointerEvents: "none",
            }}
        >
            {/* HEADER */}
            <div className="text-sm font-semibold text-gray-800 mb-2 capitalize">
                {type}
            </div>

            <div className="text-gray-500 mb-3 break-all">
                ID: {raw.id}
            </div>

            {/* MAIN DATA */}
            <div className="space-y-1 text-gray-700">
                {type === "order" && (
                    <>
                        <div>Amount: {raw.totalAmount}</div>
                        <div>Status: {raw.deliveryStatus}</div>
                    </>
                )}

                {type === "invoice" && (
                    <>
                        <div>Amount: {raw.totalAmount}</div>
                        <div>Doc: {raw.accountingDocument}</div>
                    </>
                )}

                {type === "delivery" && (
                    <div>Status: {raw.status}</div>
                )}

                {type === "payment" && (
                    <div>Amount: {raw.amount}</div>
                )}

                {type === "journal" && (
                    <div>Amount: {raw.amount}</div>
                )}
            </div>

            {/* METADATA */}
            {raw.metadata && (
                <div className="mt-3 bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600 max-h-28 overflow-y-auto">
                    {Object.entries(JSON.parse(raw.metadata)).map(([k, v]) => (
                        <div key={k}>
                            <span className="font-medium">{k}:</span>{" "}
                            {typeof v === "object"
                                ? JSON.stringify(v).slice(0, 60)
                                : String(v)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}