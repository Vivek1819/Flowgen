export default function Home() {
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
            Graph Visualization Area
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
          <div className="flex-1 p-4 overflow-y-auto text-sm text-gray-400">
            No messages yet
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Analyze anything"
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <button className="px-3 py-2 text-sm bg-gray-200 rounded">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}