"use client";
import { useState } from "react";
import Graph from "./components/Graph";

export default function Home() {

  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });


  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user" as const, content: input };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setLastQuery(input);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: input }),
      });

      const data = await res.json();

      const botMessage = {
        role: "assistant" as const,
        content: data.answer,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b bg-white text-sm font-medium text-gray-700">
        Mapping / Order to Cash
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">

        {/* Graph Panel */}
        <div className="w-3/4 relative bg-white border-r">
          <div className="absolute top-3 left-3 flex gap-2">
            <button className="px-3 py-1 text-xs bg-gray-100 rounded border">
              Minimize
            </button>
            <button className="px-3 py-1 text-xs bg-black text-white rounded">
              Hide Ground Overlay
            </button>
          </div>

          <div className="h-full flex items-center justify-center text-gray-400">
            <Graph query={lastQuery} setSelectedNode={setSelectedNode} setPanelPosition={setPanelPosition} />
          </div>
        </div>

        {/* Chat Panel */}
        <div className="w-1/4 flex flex-col bg-white">

          {/* Chat Header */}
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold">Chat with Graph</h2>
            <p className="text-xs text-gray-500">Order to Cash</p>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs">
                D
              </div>
              <div>
                <p className="text-sm font-medium">Dodge AI</p>
                <p className="text-xs text-gray-500">
                  Chat Agent
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Hi! I can help you analyze the Order to Cash process.
            </p>
          </div>


          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto text-sm space-y-3">
            {messages.length === 0 && (
              <p className="text-gray-400">No messages yet</p>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-2 rounded ${msg.role === "user"
                  ? "bg-black text-white ml-auto max-w-[80%]"
                  : "bg-gray-100 text-gray-800 max-w-[80%]"
                  }`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <p className="text-gray-400 text-xs">Thinking...</p>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Analyze anything"
                className="flex-1 border rounded px-3 py-2 text-sm bg-white text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
              />
              <button
                onClick={handleSend}
                className="px-3 py-2 text-sm bg-black text-white rounded"
              >
                Send
              </button>
            </div>
          </div>
        </div>
        {selectedNode && (
          <div
            style={{
              position: "fixed",
              top: panelPosition.y + 10,
              left: panelPosition.x + 10,
              zIndex: 1000,
            }}
            className="bg-white text-black p-4 rounded-xl shadow-xl border w-72"
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-lg">Node Details</h2>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-black"
              >
                ✖
              </button>
            </div>

            {/* BASIC */}
            <p className="text-sm">
              <span className="font-medium">ID:</span> {selectedNode.data?.raw?.id}
            </p>

            <p className="text-sm mb-2">
              <span className="font-medium">Type:</span>{" "}
              {selectedNode.data?.label}
            </p>

            {/* EXTRA FIELDS */}
            {selectedNode.data?.raw?.totalAmount && (
              <p className="text-sm">
                <span className="font-medium">Amount:</span>{" "}
                {selectedNode.data.raw.totalAmount}
              </p>
            )}

            {selectedNode.data?.raw?.deliveryStatus && (
              <p className="text-sm">
                <span className="font-medium">Status:</span>{" "}
                {selectedNode.data.raw.deliveryStatus}
              </p>
            )}

            {/* METADATA */}
            {selectedNode.data?.raw?.metadata && (
              <div className="mt-3">
                <p className="font-medium text-sm mb-1">Metadata:</p>

                {(() => {
                  try {
                    const meta = JSON.parse(selectedNode.data.raw.metadata);

                    return (
                      <div className="text-xs space-y-1 bg-gray-50 p-2 rounded">
                        {Object.entries(meta).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span>{" "}
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                          </div>
                        ))}
                      </div>
                    );
                  } catch {
                    return <p className="text-xs text-red-500">Invalid metadata</p>;
                  }
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}