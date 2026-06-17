import { getOllamChatApiUrl, getPublicApiHeaders } from "@/lib/backendEndpoints";
import { readAnyPublicEnv } from "@/lib/publicEnv";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = getOllamChatApiUrl();

function isOllamaNativeChatUrl(url: string) {
  return /\/api\/chat\/?$/.test(url);
}

async function getChatHeaders(url: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getPublicApiHeaders(),
  };

  return headers;
}

export async function streamOllam({
  messages,
  thinking,
  onDelta,
  onDone,
  signal,
}: {
  messages: Msg[];
  thinking?: boolean;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}) {
  if (!CHAT_URL) {
    throw new Error(
      "Ollama chat URL not configured. Set VITE_OLLAMA_HOST (e.g. http://localhost:11434) or VITE_API_OLLAM_CHAT_URL."
    );
  }

  const isNative = isOllamaNativeChatUrl(CHAT_URL);
  const model = readAnyPublicEnv("NEXT_PUBLIC_OLLAMA_MODEL", "VITE_OLLAMA_MODEL") || "";

  const body = isNative
    ? {
        model,
        messages,
        stream: true,
      }
    : {
        messages,
        thinking,
      };

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: await getChatHeaders(CHAT_URL),
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `Ollam responded ${resp.status}`);
  }

  if (!resp.body) throw new Error("No stream body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;

      if (isNative) {
        try {
          const parsed = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          const content = parsed.message?.content;
          if (content) onDelta(content);
          if (parsed.done) {
            streamDone = true;
            break;
          }
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      } else {
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }
  }

  if (buf.trim()) {
    for (let raw of buf.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.trim()) continue;

      if (isNative) {
        try {
          const parsed = JSON.parse(raw) as { message?: { content?: string } };
          const content = parsed.message?.content;
          if (content) onDelta(content);
        } catch {
          // ignore partial frame
        }
      } else {
        if (!raw.startsWith("data: ")) continue;
        const json = raw.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          // ignore partial frame
        }
      }
    }
  }

  onDone();
}

export function extractToolCalls(
  text: string
): Array<{ tool: string; args: Record<string, unknown> }> {
  const results: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const regex = /```tool\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool) {
        results.push(parsed);
      }
    } catch {
      // skip malformed block
    }
  }
  return results;
}
