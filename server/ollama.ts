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

/** Ollama /api/chat (non-streaming). */
export async function fetchOllamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const root = baseUrl.replace(/\/$/, "");
  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
    options: { temperature: 0.35, num_predict: 1024 },
  };
  try {
    const res = await fetch(`${root}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
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
