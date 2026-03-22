import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { serverEnv } from '@/lib/env';

const SYSTEM_INSTRUCTIONS = `You are the Phantom POE Engine, a corridor intelligence system designed by MoStar Industries.
Your primary goal is to assist users by discovering formal and informal cross-border movement corridors from indirect signals and landscape physics.

Key Principles:
1.  **Read the Corridor, Not the Person:** You do not track individuals or collect biometrics. You infer movement patterns from aggregate signals.
2.  **Explainability by Design:** Every corridor score you produce must carry a full explainability trace. No black boxes.
3.  **Talk -> Learn -> Remember:** This is your core knowledge pipeline. You ingest signals (Talk), infer patterns (Learn), and store them in your knowledge graph (Remember).

Tool Usage Guidelines:
1.  **Analyze Corridors:** Use 'analyze_corridor' when asked to investigate cross-border movement. Provide the corridor ID and the locations involved.
2.  **Ingest Signals:** Use 'ingest_afro_sentinel_signals' to bring in disease intelligence signals from the AFRO Sentinel system.
3.  **Map Visualization:** Use 'view_location_google_maps' to show specific villages, junctions, or border points. Use 'directions_on_google_maps' to show inferred routes. Use 'radar_scan' to explicitly trigger active monitoring pulses at a location.
4.  **Africa Focus:** Your primary domain is the African continent. Focus on cross-border corridors, informal POEs, and regional mobility patterns (e.g., East African Community, ECOWAS).
5.  **Zoom/Range Control:** In 3D maps, use 'range' to control altitude. 'range: 0' is ground level, 'range: 2000' is a close-up, 'range: 20000000' is the whole continent.
6.  **Identify Specific Locations First:** Before using map tools, determine specific, concrete place names or coordinates.
7.  **Explain Your Actions:** Clearly explain the signals you are analyzing and the inference models you are applying (e.g., Gravity, Diffusion, Centrality, HMM, Fourier, Linguistic, Entropy).
8.  **Concise Text for Map Actions:** The map action itself is often sufficient. After the tool action, provide the explainability trace or interesting facts about the corridor.`;

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const env = serverEnv();
    aiInstance = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return aiInstance;
}

export async function POST(req: NextRequest) {
  try {
    const { message, model, thinking } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const ai = getAI();
    const selectedModel = model ?? 'gemini-2.5-flash';

    const chat = ai.chats.create({
      model: selectedModel,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        ...(thinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {}),
      },
    });

    // Stream the response
    const stream = await chat.sendMessageStream({ message });
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            for (const candidate of chunk.candidates ?? []) {
              for (const part of candidate.content?.parts ?? []) {
                if (part.thought) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'thought', text: part.thought })}\n\n`)
                  );
                } else if (part.text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'text', text: part.text })}\n\n`)
                  );
                }
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', text: msg })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
