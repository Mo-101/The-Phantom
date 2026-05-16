'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { ChatHistoryService, FirebaseUserService } from '@/src/services/firebase.service';

interface ChatMessage {
    role: 'user' | 'assistant' | 'error';
    content: string;
    thinking?: string;
    timestamp: Date;
}

interface Toast { id: number; text: string; type: 'info' | 'success' | 'error'; }

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = 'dcx:0';

const EXAMPLE_PROMPTS = [
    "Analyze the corridor between Village Lwanda (KE) and Village Bunda (TZ).",
    "Ingest disease intelligence signals from Kenya.",
    "Show me the forest junction near the border of Kenya and Tanzania.",
    "What is the explainability trace for CORRIDOR-KE-TZ-047?",
    "Analyze cross-border mobility patterns in the Goma-Gisenyi region.",
];

export default function ChatSidebar() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState(
        EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)] ?? ''
    );
    const [loading, setLoading] = useState(false);
    const [isThinkingMode, setIsThinkingMode] = useState(false);
    const [useOllama, setUseOllama] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastCounterRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const addToast = useCallback((text: string, type: Toast['type'] = 'info') => {
        const id = ++toastCounterRef.current;
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    }, []);

    // Subscribe to Firebase auth state and load chat history on sign-in
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            setFirebaseUser(user);
            if (user && !historyLoaded) {
                try {
                    // Ensure user profile exists
                    await FirebaseUserService.createOrUpdateProfile(user);
                    // Load most recent 30 turns
                    const turns = await ChatHistoryService.getChatHistory(user.uid, 30);
                    const loaded: ChatMessage[] = turns.map(t => ({
                        role: t.role === 'model' ? 'assistant' : t.role as 'user' | 'error',
                        content: t.message,
                        timestamp: t.timestamp?.toDate?.() ?? new Date(),
                        thinking: t.isThinking ? t.message : undefined,
                    }));
                    if (loaded.length > 0) setMessages(loaded);
                    setHistoryLoaded(true);
                } catch (err) {
                    console.error('Firebase history load failed:', err);
                }
            }
        });
        return unsub;
    }, [historyLoaded]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = useCallback(async (e?: FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || loading) return;

        const userContent = input.trim();
        const userMsg: ChatMessage = { role: 'user', content: userContent, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        if (firebaseUser) {
            ChatHistoryService.saveChatTurn(firebaseUser.uid, 'user', userContent).catch(() => {});
            FirebaseUserService.updateLastActive(firebaseUser.uid).catch(() => {});
        }

        if (useOllama) {
            // ---- Ollama streaming path ----
            const assistantIdx = { current: -1 };
            try {
                const res = await fetch(OLLAMA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: OLLAMA_MODEL,
                        stream: true,
                        messages: [
                            ...messages.filter(m => m.role !== 'error').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
                            { role: 'user', content: userContent },
                        ],
                    }),
                });
                if (!res.ok || !res.body) throw new Error(`Ollama error: ${res.status}`);

                addToast(`${OLLAMA_MODEL} · generating…`, 'info');

                // Insert placeholder message
                setMessages(prev => {
                    assistantIdx.current = prev.length;
                    return [...prev, { role: 'assistant', content: '', timestamp: new Date() }];
                });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let full = '';
                let firstToken = true;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
                    for (const line of lines) {
                        try {
                            const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
                            const token = chunk.message?.content ?? '';
                            if (token) {
                                if (firstToken) { addToast(`${OLLAMA_MODEL} · first token`, 'success'); firstToken = false; }
                                full += token;
                                setMessages(prev => prev.map((m, i) =>
                                    i === assistantIdx.current ? { ...m, content: full } : m
                                ));
                            }
                            if (chunk.done) break;
                        } catch { /* partial JSON line */ }
                    }
                }

                addToast(`${OLLAMA_MODEL} · done`, 'success');
                if (firebaseUser) ChatHistoryService.saveChatTurn(firebaseUser.uid, 'model', full, false, { modelUsed: OLLAMA_MODEL }).catch(() => {});

            } catch (err) {
                const errMsg = `⚠️ Ollama: ${err instanceof Error ? err.message : 'Unknown error'}`;
                addToast(errMsg, 'error');
                if (assistantIdx.current >= 0) {
                    setMessages(prev => prev.map((m, i) => i === assistantIdx.current ? { ...m, role: 'error' as const, content: errMsg } : m));
                } else {
                    setMessages(prev => [...prev, { role: 'error', content: errMsg, timestamp: new Date() }]);
                }
            } finally {
                setLoading(false);
                setInput(EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)] ?? '');
            }
            return;
        }

        // ---- Gemini / server path ----
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userContent,
                    history: messages.filter(m => m.role !== 'error').map(m => ({
                        role: m.role === 'assistant' ? 'model' : m.role,
                        content: m.content,
                    })),
                    thinkingMode: isThinkingMode,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `Server error: ${res.status}`);

            setMessages(prev => [...prev, { role: 'assistant', content: data.response, thinking: data.thinking, timestamp: new Date() }]);

            if (firebaseUser) {
                ChatHistoryService.saveChatTurn(firebaseUser.uid, 'model', data.response, isThinkingMode, { modelUsed: isThinkingMode ? 'gemini-pro-thinking' : 'gemini-flash' }).catch(() => {});
            }
        } catch (err) {
            const errMsg = `⚠️ ${err instanceof Error ? err.message : 'Unknown error'}`;
            setMessages(prev => [...prev, { role: 'error', content: errMsg, timestamp: new Date() }]);
            if (firebaseUser) ChatHistoryService.saveChatTurn(firebaseUser.uid, 'error', errMsg).catch(() => {});
        } finally {
            setLoading(false);
            setInput(EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)] ?? '');
        }
    }, [input, loading, messages, isThinkingMode, useOllama, firebaseUser, addToast]);

    return (
        <aside
            className={`flex flex-col bg-black border-r border-gray-800 transition-all duration-300 relative ${collapsed ? 'w-16 min-w-0' : 'w-[35%] min-w-[300px] max-w-[450px]'
                }`}
        >
            {/* Toast container */}
            <div className="absolute top-14 right-2 z-50 flex flex-col gap-1.5 pointer-events-none" style={{ maxWidth: 260 }}>
                {toasts.map(t => (
                    <div key={t.id} className="px-3 py-2 rounded text-xs font-mono shadow-lg animate-fade-in"
                        style={{
                            background: t.type === 'error' ? '#1a0000' : t.type === 'success' ? '#001a09' : '#0a0f1a',
                            border: `1px solid ${t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#22c55e' : '#3b82f6'}55`,
                            color: t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#22c55e' : '#60a5fa',
                        }}>
                        {t.text}
                    </div>
                ))}
            </div>

            {/* Scan line effect */}
            <div
                className="absolute left-0 w-full h-full pointer-events-none z-10"
                style={{
                    background: 'linear-gradient(to bottom, transparent, rgba(0, 255, 0, 0.05), transparent)',
                    animation: 'scan 4s linear infinite',
                }}
            />

            {/* Tab header */}
            <div className="flex items-center border-b border-gray-800 px-4 py-3 flex-shrink-0">
                {!collapsed && (
                    <span className="font-bold text-green-400 font-mono text-sm tracking-wider">
                        Phantom POE
                    </span>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="ml-auto text-green-400 hover:text-green-300 transition p-1"
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                        {collapsed ? (
                            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
                        ) : (
                            <path d="m296-345-56-56 240-240 240 240-56 56-184-184-184 184Z" />
                        )}
                    </svg>
                </button>
            </div>

            {!collapsed && (
                <>
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-4 scroll-smooth pt-6">
                        {messages.length === 0 && (
                            <p className="text-gray-600 text-sm italic px-4">
                                Ask about corridors, signals, or locations…
                            </p>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`turn role-${msg.role}`}>
                                {msg.thinking && (
                                    <details className="thinking">
                                        <summary className="cursor-pointer text-xs text-gray-500">Thinking process</summary>
                                        <div className="text-xs mt-2 whitespace-pre-wrap">{msg.thinking}</div>
                                    </details>
                                )}
                                <div className="text whitespace-pre-wrap text-sm">{msg.content}</div>
                            </div>
                        ))}
                        {loading && (
                            <div className="turn role-assistant">
                                <div className="text flex items-center gap-2 text-sm text-gray-400">
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
                                        <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z" />
                                    </svg>
                                    {useOllama ? `${OLLAMA_MODEL} · streaming…` : isThinkingMode ? 'Thinking…' : 'Generating…'}
                                </div>
                            </div>
                        )}
                        <div id="anchor" className="h-px pt-11" />
                    </div>

                    {/* Footer / Input */}
                    <div className="flex-shrink-0 border-t border-gray-800">
                        {/* Input controls */}
                        <div className="flex items-center gap-4 px-3 py-2 bg-black/50 border-b border-gray-800/50 flex-wrap">
                            <label className="flex items-center gap-2 text-green-400 text-xs cursor-pointer font-mono">
                                <input
                                    type="checkbox"
                                    checked={isThinkingMode}
                                    onChange={e => setIsThinkingMode(e.target.checked)}
                                    disabled={useOllama}
                                    className="accent-green-400"
                                />
                                Thinking
                            </label>
                            <label className="flex items-center gap-2 text-xs cursor-pointer font-mono ml-auto" style={{ color: useOllama ? '#f59e0b' : '#4b5563' }}>
                                <input
                                    type="checkbox"
                                    checked={useOllama}
                                    onChange={e => setUseOllama(e.target.checked)}
                                    className="accent-yellow-400"
                                />
                                <span title={`Local Ollama · ${OLLAMA_MODEL}`}>⚡ {OLLAMA_MODEL}</span>
                            </label>
                        </div>

                        {/* Message input */}
                        <form onSubmit={handleSubmit} className="flex items-center p-3 gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit();
                                    }
                                }}
                                placeholder="Type your message..."
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 font-sans"
                                disabled={loading}
                                autoComplete="off"
                            />
                            <button
                                type="submit"
                                disabled={loading || !input.trim()}
                                className="w-10 h-10 flex items-center justify-center bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black rounded-full transition flex-shrink-0"
                                aria-label="Send message"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                                    <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
                                </svg>
                            </button>
                        </form>
                    </div>
                </>
            )}
        </aside>
    );
}
