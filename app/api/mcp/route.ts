import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';

interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

interface MCPRequest {
    message: string;
    history?: ChatTurn[];
    context?: {
        corridorId?: string;
        runId?: string;
        tab?: string;
    };
}

const SYSTEM_PROMPT = `You are the Phantom POE Intelligence Assistant — built by MoStar Industries for WHO AFRO.

You help analysts understand corridor intelligence data for cross-border disease surveillance in Africa.

You have access to:
- Detected informal corridor paths between countries
- Signal evidence chains (disease, displacement, conflict, entropy)
- 7-soul corridor scoring system (Gravity, Diffusion, Centrality, HMM, Seasonal, Linguistic, Entropy + Terrain)
- Gap zone analysis between formal Points of Entry
- Neo4j graph data tagged workspace: phantom-poe

Core principles:
- You do not identify individuals. Corridor-level inference only.
- Every claim you make must reference a soul score, signal source, or provenance.
- If data is unavailable, say so. Never fabricate a corridor or signal.
- Ubuntu: the system exists to protect communities, not surveil them.

When asked about a corridor, structure your answer as:
1. What the corridor is (path, countries, distance)
2. What evidence supports it (signal chain, sources)
3. How confident the engine is (score, activation status)
4. What action is recommended

Seal: ◉⟁⬡ mo-border-phantom-001`;

export async function POST(req: NextRequest) {
    try {
        const env = serverEnv();
        const body = await req.json() as MCPRequest;

        const { message, history = [], context } = body;

        if (!message?.trim()) {
            return NextResponse.json({ error: 'Empty message' }, { status: 400 });
        }

        // Build context injection if corridor/run is active
        let contextBlock = '';
        if (context?.corridorId) {
            contextBlock = `\n\nActive corridor in view: ${context.corridorId}`;
        }
        if (context?.runId) {
            contextBlock += `\nCurrent run: ${context.runId}`;
        }
        if (context?.tab) {
            contextBlock += `\nAnalyst is viewing: ${context.tab} tab`;
        }

        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

        // Build conversation contents
        const contents = [
            ...history.map(turn => ({
                role: turn.role === 'user' ? 'user' : 'model' as const,
                parts: [{ text: turn.content }],
            })),
            {
                role: 'user' as const,
                parts: [{ text: `${message}${contextBlock}` }],
            },
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.3,  // low — intelligence assistant, not creative
                maxOutputTokens: 1024,
            },
        });

        const text = response.text ?? 'No response generated.';

        return NextResponse.json({
            response: text,
            model: 'gemini-2.0-flash',
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}