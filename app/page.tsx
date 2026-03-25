"use client";
import { useState, useRef, useEffect } from "react";
import Graph from "./components/Graph";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [seedIds, setSeedIds] = useState<string[]>([]);
  const [highlightMode, setHighlightMode] = useState<"nodes_only" | "flow">("nodes_only");
  const [chatVisible, setChatVisible] = useState(true);
  const [showInspector, setShowInspector] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [status, setStatus] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user" as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setStatus("Thinking...");
    setLastQuery(input);
    setHighlightedIds([]);
    setSeedIds([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: input,
          history: messages 
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextEncoder();
      let assistantMessage = "";
      
      // Add initial empty assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const processChunk = (chunk: string) => {
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "status") {
              setStatus(data.content);
            } else if (data.type === "answer_chunk") {
              assistantMessage += data.content;
              setStatus(""); // Clear status once we start getting the answer
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = assistantMessage;
                return newMessages;
              });
            } else if (data.type === "metadata") {
              if (Array.isArray(data.highlightedIds)) {
                setHighlightedIds(data.highlightedIds);
                setSeedIds(data.seedIds || []);
                setHighlightMode(data.highlightMode || "nodes_only");
              }
            } else if (data.type === "error") {
               setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = data.content;
                return newMessages;
              });
            }
          } catch (e) {
            console.error("Error parsing chunk", e);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        processChunk(chunk);
      }

    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong" },
      ]);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fb]">
      {/* ── Header ── */}
      <header className="h-12 flex items-center px-5 border-b border-gray-200 bg-white gap-3">
        <div className="w-6 h-6 rounded bg-gray-900 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" rx="1" fill="white" />
            <rect x="7" y="1" width="4" height="4" rx="1" fill="white" />
            <rect x="1" y="7" width="4" height="4" rx="1" fill="white" />
            <rect x="7" y="7" width="4" height="4" rx="1" fill="white" opacity="0.4" />
          </svg>
        </div>
        <nav className="text-sm text-gray-500 flex items-center gap-1.5">
          <span className="text-gray-400">Mapping</span>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-gray-800">Order to Cash</span>
        </nav>
      </header>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph Panel */}
        <div className="flex-1 relative bg-[#f8f9fb]">
          {/* Overlay Buttons */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button 
              onClick={() => setChatVisible(!chatVisible)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white rounded-lg border border-gray-200 text-gray-600 shadow-sm hover:shadow transition-shadow"
            >
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5"
                className={`transition-transform duration-300 ${!chatVisible ? 'rotate-180' : ''}`}
              >
                <path d="M2 8L6 4L10 8" />
              </svg>
              {chatVisible ? "Minimize Chat" : "Show Chat"}
            </button>
            <button 
              onClick={() => setShowInspector(!showInspector)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg shadow-sm transition-colors ${
                showInspector ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
              </svg>
              {showInspector ? "Hide Inspector" : "Show Inspector"}
            </button>
          </div>

          <div className="h-full w-full">
            <Graph 
                query={lastQuery} 
                highlightedIds={highlightedIds} 
                seedIds={seedIds} 
                highlightMode={highlightMode} 
                showInspector={showInspector}
            />
          </div>
        </div>

        {/* ── Chat Panel ── */}
        {chatVisible && (
          <div className="w-[420px] flex flex-col bg-white border-l border-gray-200">
            {/* Chat Header */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">Chat with Graph</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Order to Cash</p>

              <div className="mt-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center shadow-sm">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                    <circle cx="8" cy="5" r="3" />
                    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" fill="white" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Dodge AI</p>
                  <p className="text-[11px] text-gray-400">Graph Agent</p>
                </div>
              </div>

              <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
                Hi! I can help you analyze the <span className="font-semibold text-gray-700">Order to Cash</span> process.
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 px-4 py-3 overflow-y-auto space-y-3">
              {messages.length === 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[11px] text-gray-400">Dodge AI is awaiting instructions</p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-[13px] leading-relaxed px-3.5 py-2.5 rounded-xl ${
                    msg.role === "user"
                      ? "bg-gray-900 text-white ml-auto rounded-br-md w-fit max-w-[85%] whitespace-pre-wrap"
                      : "bg-gray-50 text-gray-700 border border-gray-100 rounded-bl-md max-w-[90%] markdown-content"
                  }`}
                >
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex flex-col gap-2 max-w-[90%]">
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-100 w-fit">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                  {status && (
                    <p className="text-[11px] text-gray-400 ml-1 animate-pulse italic">{status}</p>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-200 transition-all">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-grow
                    const ta = textareaRef.current;
                    if (ta) {
                      ta.style.height = "auto";
                      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Analyze anything"
                  className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-gray-400 resize-none focus:outline-none leading-snug"
                  style={{ minHeight: 22, maxHeight: 120 }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="px-3 py-1.5 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}