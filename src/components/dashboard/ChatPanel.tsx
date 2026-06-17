import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, Loader2, X } from "lucide-react";
import type { MapParams } from "@/types/phantom";
import { ChatState as CS } from "@/types/phantom";
import { callMcpTool } from "@/lib/mcp-client";
import { streamOllam, extractToolCalls } from "@/lib/ollam-stream";

const EXAMPLE_PROMPTS = [
  "Fly to the corridor between Lwanda KE and Bunda TZ.",
  "Analyze CORRIDOR-KE-TZ-047 — start at -0.60,34.10 end at -2.45,33.80.",
  "What corridors are active near Lake Victoria?",
  "Run diagnostics on all connections.",
  "Explain the soul scoring model for corridor risk.",
  "What is a phantom POE and how is it detected?",
  "Trigger radar scan on CORRIDOR-UG-CD-018.",
];

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatPanelProps {
  onMapQuery?: (params: MapParams) => void;
}

const ChatPanel = ({ onMapQuery }: ChatPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatState, setChatState] = useState(CS.IDLE);
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [placeholder] = useState(
    () => EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const executeToolCalls = useCallback(
    async (toolCalls: Array<{ tool: string; args: Record<string, unknown> }>) => {
      for (const tc of toolCalls) {
        try {
          const result = await callMcpTool(tc.tool, tc.args);
          if (result.mapParams && onMapQuery) {
            onMapQuery(result.mapParams);
          }
        } catch (err) {
          console.error("Tool execution error:", err);
        }
      }
    },
    [onMapQuery]
  );

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || chatState !== CS.IDLE) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setChatState(isThinkingMode ? CS.THINKING : CS.GENERATING);

    const ac = new AbortController();
    abortRef.current = ac;

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      await streamOllam({
        messages: history,
        thinking: isThinkingMode,
        onDelta: upsertAssistant,
        onDone: () => {},
        signal: ac.signal,
      });

      const toolCalls = extractToolCalls(assistantSoFar);
      if (toolCalls.length > 0) {
        setChatState(CS.EXECUTING);
        await executeToolCalls(toolCalls);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `◉ Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      }
    } finally {
      setChatState(CS.IDLE);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const stateLabel = {
    [CS.GENERATING]: "Phantom AI responding…",
    [CS.THINKING]: "Deep analysis…",
    [CS.EXECUTING]: "Executing tool…",
    [CS.IDLE]: "",
  };

  return (
    <>
      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="absolute bottom-20 right-4 z-30 w-[380px] max-h-[70vh] flex flex-col rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl shadow-black/20 animate-fade-in-up overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-2">
              <span className="text-phantom-green font-mono text-sm font-semibold tracking-wider">
                Phantom AI
              </span>
              <span className="w-2 h-2 rounded-full bg-phantom-green/60 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              {isThinkingMode && (
                <span className="text-xs font-mono text-phantom-amber px-2 py-1 rounded bg-phantom-amber/10 border border-phantom-amber/20">
                  DEEP
                </span>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-h-[50vh]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <span className="text-phantom-green/30 font-mono text-3xl select-none">
                  ◉⟁⬡
                </span>
                <p className="text-sm text-muted-foreground text-center max-w-[260px] leading-relaxed">
                  Phantom AI is online. Ask about corridors, signals, threat analysis, or give direct commands.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px] mt-2">
                  {EXAMPLE_PROMPTS.slice(0, 3).map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(p)}
                      className="text-xs font-mono text-muted-foreground/70 px-2.5 py-1.5 rounded border border-border hover:border-phantom-green/30 hover:text-foreground transition-colors active:scale-95 text-left"
                    >
                      {p.slice(0, 35)}…
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`animate-fade-in-up ${msg.role === "user" ? "ml-6" : "mr-6"}`}
                style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
              >
                <div
                  className={`rounded-lg px-3 py-2.5 text-sm leading-relaxed overflow-wrap-break-word ${
                    msg.role === "user"
                      ? "bg-secondary text-foreground"
                      : "bg-phantom-surface border border-border text-foreground font-mono"
                  }`}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/50 mt-1 block px-1">
                  {msg.role === "user" ? "you" : "phantom"}
                </span>
              </div>
            ))}

            {/* Status */}
            {chatState !== CS.IDLE && (
              <div className="flex items-center gap-2 px-2 py-1.5 animate-fade-in-up">
                <Loader2 className="w-4 h-4 text-phantom-green animate-spin" />
                <span className="text-xs font-mono text-phantom-green">
                  {stateLabel[chatState]}
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 space-y-2 bg-card/50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={chatState !== CS.IDLE}
                className="flex-1 h-9 bg-secondary border border-border rounded-md px-3 text-sm text-foreground placeholder:text-muted-foreground/50 font-mono focus:outline-none focus:ring-1 focus:ring-phantom-green/40 transition-shadow disabled:opacity-50"
                autoComplete="off"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatState !== CS.IDLE}
                className="flex items-center justify-center h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                  aria-label="Voice input"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isThinkingMode}
                    onChange={(e) => setIsThinkingMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="w-3.5 h-3.5 rounded-sm border border-muted-foreground/40 peer-checked:bg-phantom-green peer-checked:border-phantom-green transition-colors" />
                  <span className="text-xs font-mono text-muted-foreground">
                    Deep Think
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Glyph Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`absolute bottom-4 right-4 z-40 flex items-center justify-center rounded-full transition-all duration-300 ${
          isOpen ? "w-12 h-12 bg-destructive/90 hover:bg-destructive" : "w-14 h-14 bg-card/90 hover:bg-card border border-border shadow-lg shadow-black/20"
        }`}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        style={{
          animation: isOpen ? "none" : "float 3s ease-in-out infinite",
        }}
      >
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <span
            className="font-mono text-lg text-phantom-green select-none"
            style={{
              animation: "revolve 4s linear infinite",
              display: "inline-block",
            }}
          >
            ◉⟁⬡
          </span>
        )}
      </button>

      {/* Animation styles */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes revolve {
          0% { transform: rotateY(0deg); }
          25% { transform: rotateY(90deg); }
          50% { transform: rotateY(180deg); }
          75% { transform: rotateY(270deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
    </>
  );
};

export { ChatPanel };
