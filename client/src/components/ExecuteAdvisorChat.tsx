import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, OctagonAlert, Send, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/queryClient";
import { messageFromResponse } from "@/lib/parseApiError";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";

export type AdvisorChatMessage = { role: "user" | "assistant"; content: string };

async function consumeAdvisorNdjsonStream(res: Response, onDelta: (chunk: string) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let j: { d?: string; done?: boolean; error?: string };
      try {
        j = JSON.parse(t);
      } catch {
        continue;
      }
      if (typeof j.error === "string") throw new Error(j.error);
      if (typeof j.d === "string" && j.d.length > 0) onDelta(j.d);
      if (j.done === true) return;
    }
  }
  const tail = buf.trim();
  if (!tail) return;
  try {
    const j = JSON.parse(tail) as { d?: string; done?: boolean; error?: string };
    if (typeof j.error === "string") throw new Error(j.error);
    if (typeof j.d === "string" && j.d.length > 0) onDelta(j.d);
  } catch {
    /* ignore trailing garbage */
  }
}


type Props = {
  draft: {
    symbol: string;
    qty: number;
    side: "buy" | "sell";
  };
  killSwitchActive: boolean;
};

export function ExecuteAdvisorChat({ draft, killSwitchActive }: Props) {
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = async () => {
    const text = input.trim().slice(0, 8000);
    if (!text || loading || killSwitchActive) return;
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const generation = ++sendGenerationRef.current;

    const userMsg: AdvisorChatMessage = { role: "user", content: text };
    const nextUserTurn = [...messages, userMsg];
    setMessages([...nextUserTurn, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    try {
      const sym = draft.symbol.trim();
      const body: {
        messages: AdvisorChatMessage[];
        draft?: { symbol?: string; qty?: number; side?: "buy" | "sell" };
      } = { messages: nextUserTurn };
      if (sym.length >= 1 && Number.isFinite(draft.qty) && draft.qty >= 1) {
        body.draft = {
          symbol: sym.toUpperCase(),
          qty: draft.qty,
          side: draft.side,
        };
      }
      const res = await fetch(`${API_BASE}/api/execute/advisor/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(await messageFromResponse(res));
      if (generation !== sendGenerationRef.current) return;

      await consumeAdvisorNdjsonStream(res, (delta) => {
        if (generation !== sendGenerationRef.current) return;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { role: "assistant", content: last.content + delta };
          }
          return copy;
        });
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (generation !== sendGenerationRef.current) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") return prev.slice(0, -1);
        return prev;
      });
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (generation === sendGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput("");
  };

  return (
    <Card className="border-card-border bg-card flex flex-col min-h-[28rem] lg:min-h-[32rem]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Execution advisor
        </CardTitle>
        <CardDescription>
          Describe what you want to accomplish. The advisor suggests steps using Titan approved workflows (manual Execute,
          engine START loop, Settings, Risk, Dashboard strategies). This is guidance only; it does not place orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3 min-h-0">
        {killSwitchActive && (
          <Alert variant="destructive" className="py-2">
            <OctagonAlert className="h-4 w-4" />
            <AlertTitle className="text-sm">Advisor paused</AlertTitle>
            <AlertDescription className="text-xs">
              Chat is disabled while the kill switch is active. Resume trading from the{" "}
              <Link href="/risk" className="underline font-medium text-foreground">
                Risk
              </Link>{" "}
              page to use the advisor again.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex-1 rounded-md border border-border/80 bg-muted/20 min-h-[200px] max-h-[42vh] lg:max-h-[min(28rem,50vh)] overflow-y-auto overscroll-contain">
          <div className="p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Example: &quot;I want income from options but stay within risk limits&quot; or &quot;Should I use manual Execute or
                start the engine for AAPL?&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn(
                  "text-sm rounded-lg px-3 py-2 max-w-[95%]",
                  m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted",
                )}
              >
                <span className="text-[10px] uppercase tracking-wide opacity-70 block mb-0.5">
                  {m.role === "user" ? "You" : "Advisor"}
                </span>
                <p className="whitespace-pre-wrap break-words">
                  {m.role === "assistant" && !m.content && loading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin inline-block mr-2 align-middle text-muted-foreground" />
                  )}
                  {m.content}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={killSwitchActive ? "Unavailable while kill switch is active..." : "Ask how to achieve your goal within Titan tools..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || killSwitchActive}
            rows={3}
            className="resize-none min-h-[4.5rem]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-col gap-2 shrink-0">
            <Button type="button" size="icon" onClick={() => void send()} disabled={killSwitchActive || loading || !input.trim()} aria-label="Send">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={clear}
              disabled={messages.length === 0 && !input.trim()}
              aria-label="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
