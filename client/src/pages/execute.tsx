import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowDownLeft, ArrowUpRight, Loader2, OctagonAlert } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ExecuteAdvisorChat } from "@/components/ExecuteAdvisorChat";

type OrderSide = "buy" | "sell";

function useDebouncedValue(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type SuggestRow = { symbol: string; name: string };

export default function ExecutePage() {
  const { mode, killSwitchActive } = useTradingMode();
  const { toast } = useToast();
  const [symbol, setSymbol] = useState("");
  const [qtyStr, setQtyStr] = useState("1");
  const [side, setSide] = useState<OrderSide>("buy");
  const [submitting, setSubmitting] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSym = useDebouncedValue(symbol, 220);

  const qty = Math.floor(Number.parseFloat(qtyStr) || 0);

  const { data: suggestions = [], isFetching: suggestLoading } = useQuery<SuggestRow[]>({
    queryKey: ["symbol-suggest", debouncedSym.trim()],
    enabled: debouncedSym.trim().length >= 1 && !killSwitchActive,
    queryFn: async ({ queryKey }) => {
      const q = String(queryKey[1] ?? "");
      const r = await fetch(`/api/symbols/suggest?q=${encodeURIComponent(q)}&limit=15`);
      if (r.status === 400) return [];
      if (!r.ok) throw new Error("Symbol lookup failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const pickSymbol = (sym: string) => {
    setSymbol(sym);
    setSuggestOpen(false);
  };

  const submit = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.-]+$/.test(sym)) {
      toast({ title: "Invalid symbol", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast({ title: "Quantity must be at least 1", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/orders/equity", { symbol: sym, qty, side });
      const data = (await res.json()) as {
        success: boolean;
        orderId?: string | null;
        tradingMode?: string;
      };
      if (data.success) {
        toast({
          title: "Order submitted",
          description: `${side.toUpperCase()} ${qty} ${sym} (${data.tradingMode ?? mode}) — broker id ${data.orderId ?? ""}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/trades", mode] });
        queryClient.invalidateQueries({ queryKey: ["/api/positions", mode] });
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio", mode] });
      } else {
        toast({
          title: "Order rejected",
          description: "Broker did not accept the order. Check Trade Log.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/trades", mode] });
      }
    } catch (e) {
      toast({
        title: "Order failed",
        description: e instanceof Error ? e.message : "Request error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl" data-testid="page-execute">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Execute trade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Market equity orders via Alpaca using the mode selected in{" "}
          <Link href="/settings" className="text-primary underline">
            Settings
          </Link>
          . This is separate from the automated engine (START in the sidebar).
        </p>
      </div>

      {killSwitchActive && (
        <Alert variant="destructive">
          <OctagonAlert className="h-4 w-4" />
          <AlertTitle>Kill switch active</AlertTitle>
          <AlertDescription>Manual orders are blocked until you resume trading.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card className="border-card-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Market order</CardTitle>
          <CardDescription>
            Day market order. Type a ticker for Alpaca-backed suggestions (tradable US equities), then confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase",
                mode === "paper" ? "border-primary/50 text-primary" : "border-vice-orange/50 text-vice-orange",
              )}
            >
              {mode === "paper" ? "Paper" : "Live"} account
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={side === "buy" ? "default" : "outline"}
              className={side === "buy" ? "bg-vice-success hover:bg-vice-success/90" : ""}
              onClick={() => setSide("buy")}
              disabled={killSwitchActive}
            >
              <ArrowDownLeft className="w-4 h-4 mr-1" />
              Buy
            </Button>
            <Button
              type="button"
              variant={side === "sell" ? "destructive" : "outline"}
              onClick={() => setSide("sell")}
              disabled={killSwitchActive}
            >
              <ArrowUpRight className="w-4 h-4 mr-1" />
              Sell
            </Button>
          </div>

          <div className="space-y-2 relative">
            <Label htmlFor="sym">Symbol</Label>
            <div className="relative">
              <Input
                id="sym"
                placeholder="e.g. AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                onFocus={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  setSuggestOpen(true);
                }}
                onBlur={() => {
                  blurTimer.current = setTimeout(() => setSuggestOpen(false), 180);
                }}
                disabled={killSwitchActive}
                autoCapitalize="characters"
                autoComplete="off"
                data-testid="input-order-symbol"
              />
              {suggestOpen && !killSwitchActive && symbol.trim().length >= 1 && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto"
                  data-testid="symbol-suggest-dropdown"
                >
                  {suggestLoading && (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading matches…
                    </div>
                  )}
                  {!suggestLoading && suggestions.length === 0 && (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">
                      No matches. Check API keys in Settings or try another prefix.
                    </p>
                  )}
                  {!suggestLoading &&
                    suggestions.map((row) => (
                      <button
                        key={row.symbol}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted/80 border-b border-border/40 last:border-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSymbol(row.symbol);
                        }}
                      >
                        <span className="text-sm font-semibold tracking-wide">{row.symbol}</span>
                        <span className="block text-[11px] text-muted-foreground line-clamp-1">{row.name}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qty">Whole shares</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              step={1}
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              disabled={killSwitchActive}
              data-testid="input-order-qty"
            />
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full"
                disabled={killSwitchActive || submitting}
                data-testid="button-submit-order"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  `Review & ${side === "buy" ? "buy" : "sell"}`
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {side === "buy" ? "Buy" : "Sell"} {qty} {symbol.trim().toUpperCase() || "—"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This sends a day market order to Alpaca on your {mode === "paper" ? "paper" : "live"} account.
                  {mode === "live" && " Live orders use real money."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void submit()}>
                  Confirm {side === "buy" ? "buy" : "sell"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <ExecuteAdvisorChat draft={{ symbol, qty, side }} killSwitchActive={killSwitchActive} />
      </div>
    </div>
  );
}
