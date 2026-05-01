export async function fetchOllamaSentiment(
  baseUrl: string,
  model: string,
  symbol: string,
): Promise<{ score: number; summary: string }> {
  const root = baseUrl.replace(/\/$/, "");
  const prompt =
    `Stock ticker ${symbol}. Reply with ONLY compact JSON: {"sentiment_score": number from -1 bearish to 1 bullish, "summary": string max 100 chars}`;
  const body = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0.3 },
  };
  try {
    const res = await fetch(`${root}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return { score: 0, summary: `ollama HTTP ${res.status}` };
    const j = (await res.json()) as { response?: string };
    const text = j.response ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return { score: 0, summary: text.slice(0, 120) };
    let parsed: { sentiment_score?: number; summary?: string };
    try {
      parsed = JSON.parse(text.slice(start, end + 1)) as { sentiment_score?: number; summary?: string };
    } catch {
      return { score: 0, summary: text.slice(0, 120) };
    }
    const score = Math.max(-1, Math.min(1, Number(parsed.sentiment_score) || 0));
    return { score, summary: String(parsed.summary ?? "").slice(0, 500) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ollama error";
    return { score: 0, summary: msg.slice(0, 200) };
  }
}

export type OllamaChatOptions = {
  temperature?: number;
  numPredict?: number;
  signal?: AbortSignal;
};

/** Ollama /api/chat (non-streaming). */
export async function fetchOllamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  chatOptions?: OllamaChatOptions,
): Promise<string> {
  const root = baseUrl.replace(/\/$/, "");
  const temperature = chatOptions?.temperature ?? 0.35;
  const numPredict = chatOptions?.numPredict ?? 1024;
  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
    options: { temperature, num_predict: numPredict },
  };
  try {
    const res = await fetch(`${root}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: chatOptions?.signal ?? AbortSignal.timeout(120_000),
    });
    if (!res.ok) return `[Ollama chat HTTP ${res.status}]`;
    const j = (await res.json()) as { message?: { content?: string } };
    const text = j.message?.content ?? "";
    return text.trim() || "(empty response)";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ollama chat error";
    return msg.slice(0, 500);
  }
}
/**
 * Streams assistant token deltas from Ollama /api/chat (stream: true).
 * Each yielded string is a delta to append (Ollama sends incremental message.content chunks).
 */
export async function* streamOllamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  chatOptions?: OllamaChatOptions,
): AsyncGenerator<string, void, unknown> {
  const root = baseUrl.replace(/\/$/, "");
  const temperature = chatOptions?.temperature ?? 0.35;
  const numPredict = chatOptions?.numPredict ?? 1024;
  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
    options: { temperature, num_predict: numPredict },
  };
  const signal = chatOptions?.signal ?? AbortSignal.timeout(120_000);
  const res = await fetch(`${root}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ollama chat HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  if (!res.body) throw new Error("ollama chat: empty body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let j;
        try {
          j = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const delta = j.message?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        const j = JSON.parse(tail);
        const delta = j.message?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      } catch {
        /* ignore trailing garbage */
      }
    }
  } finally {
    reader.releaseLock();
  }
}
