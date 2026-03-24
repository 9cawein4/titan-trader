import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Filter, ArrowUpDown, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trade } from "@shared/schema";

const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  executed: { icon: CheckCircle, color: "text-vice-success", bg: "bg-vice-success/10 border-vice-success/20" },
  rejected: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
  cancelled: { icon: AlertCircle, color: "text-vice-orange", bg: "bg-vice-orange/10 border-vice-orange/20" },
  pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
};

export default function Trades() {
  const { mode } = useTradingMode();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const queryStatus = statusFilter === "all" ? undefined : statusFilter;
  const { data: trades = [], isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", mode, { status: queryStatus }],
    refetchInterval: 10000,
  });

  const filtered = trades.filter((t) => {
    if (typeFilter !== "all" && t.tradeType !== typeFilter) return false;
    return true;
  });

  const totalExecuted = trades.filter((t) => t.status === "executed").length;
  const totalRejected = trades.filter((t) => t.status === "rejected").length;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-trades">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Executed</p>
            <p className="text-xl font-bold text-vice-success">{totalExecuted}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rejected</p>
            <p className="text-xl font-bold text-destructive">{totalRejected}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net P&L</p>
            <p className={cn("text-xl font-bold", totalPnl >= 0 ? "text-vice-success" : "text-destructive")}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-card-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary" />
              Trade History
              <Badge variant="outline" className="text-[10px] ml-1">{filtered.length} trades</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border" data-testid="filter-status">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border" data-testid="filter-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="option">Options</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">Time</th>
                  <th className="text-left py-2 px-2 font-medium">Symbol</th>
                  <th className="text-left py-2 px-2 font-medium">Side</th>
                  <th className="text-left py-2 px-2 font-medium">Type</th>
                  <th className="text-right py-2 px-2 font-medium">Qty</th>
                  <th className="text-right py-2 px-2 font-medium">Price</th>
                  <th className="text-left py-2 px-2 font-medium">Strategy</th>
                  <th className="text-right py-2 px-2 font-medium">P&L</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const sc = statusConfig[t.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={t.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`trade-row-${t.id}`}>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                        {new Date(t.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 px-2 font-semibold">{t.symbol}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={cn("text-[10px]", t.side === "buy" ? "border-vice-success/30 text-vice-success" : "border-destructive/30 text-destructive")}>
                          {t.side?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{t.orderType}</td>
                      <td className="py-2 px-2 text-right font-mono">{t.qty}</td>
                      <td className="py-2 px-2 text-right font-mono">${t.price?.toFixed(2)}</td>
                      <td className="py-2 px-2 text-muted-foreground">{t.strategy}</td>
                      <td className={cn("py-2 px-2 text-right font-mono font-medium", (t.pnl ?? 0) >= 0 ? "text-vice-success" : "text-destructive")}>
                        {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={cn("text-[10px] gap-1", sc.bg)}>
                          <StatusIcon className={cn("w-3 h-3", sc.color)} />
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No trades found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Audit note */}
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            All trades are HMAC-signed for audit trail integrity
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
