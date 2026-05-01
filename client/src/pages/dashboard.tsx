import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  BarChart3,
  Zap,
  Minus,
  CircleDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PortfolioSnapshot, Position, SentimentEntry, Strategy } from "@shared/schema";
import { StrategiesOnDashboard, OptionsAutomationHint } from "@/components/StrategyDashboardPanels";
import { TaxSummaryCard } from "@/components/TaxSummaryCard";

function KpiCard({
  title,
  value,
  delta,
  deltaPct,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string;
  delta?: string;
  deltaPct?: string;
  icon: any;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const colors = {
    default: "text-primary",
    success: "text-vice-success",
    danger: "text-destructive",
    warning: "text-vice-orange",
  };
  return (
    <Card className="bg-card border-card-border relative overflow-hidden" data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="absolute inset-0 vice-gradient opacity-30" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          <Icon className={cn("w-4 h-4", colors[variant])} />
        </div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {delta && (
          <div className="flex items-center gap-1 mt-1">
            {parseFloat(delta) >= 0 ? (
              <TrendingUp className="w-3 h-3 text-vice-success" />
            ) : (
              <TrendingDown className="w-3 h-3 text-destructive" />
            )}
            <span className={cn("text-xs font-medium", parseFloat(delta) >= 0 ? "text-vice-success" : "text-destructive")}>
              {delta} {deltaPct && `(${deltaPct})`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquityChart({ data }: { data: PortfolioSnapshot[] }) {
  const chartData = [...data].reverse().map((s) => ({
    date: new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: s.equity,
    cash: s.cash,
  }));

  return (
    <Card className="bg-card border-card-border col-span-full lg:col-span-2" data-testid="chart-equity">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Portfolio Equity
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2 pt-0">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(187 100% 45%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(187 100% 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(330 100% 55%)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(330 100% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 30% 18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(220 15% 55%)" }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(220 15% 55%)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                domain={[(dataMin: number) => Math.floor(dataMin * 0.9 / 5000) * 5000, (dataMax: number) => Math.ceil(dataMax * 1.05 / 5000) * 5000]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(230 50% 10%)",
                  border: "1px solid hsl(187 100% 45% / 0.3)",
                  borderRadius: "8px",
                  fontSize: 12,
                  color: "hsl(200 20% 95%)",
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
              />
              <Area type="monotone" dataKey="equity" stroke="hsl(187 100% 45%)" fill="url(#equityGrad)" strokeWidth={2} name="Equity" />
              <Area type="monotone" dataKey="cash" stroke="hsl(330 100% 55%)" fill="url(#cashGrad)" strokeWidth={1.5} name="Cash" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <Card className="bg-card border-card-border" data-testid="table-positions">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          Open Positions
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Symbol</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Entry</th>
                <th className="text-right py-2 px-2 font-medium">Current</th>
                <th className="text-right py-2 px-2 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-2 font-semibold text-foreground">{p.symbol}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground">{p.qty}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground">${p.avgEntryPrice?.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right">${p.currentPrice?.toFixed(2)}</td>
                  <td className={cn("py-2 px-2 text-right font-medium", (p.unrealizedPnl ?? 0) >= 0 ? "text-vice-success" : "text-destructive")}>
                    {(p.unrealizedPnl ?? 0) >= 0 ? "+" : ""}${p.unrealizedPnl?.toFixed(2)}
                    <span className="text-muted-foreground ml-1">
                      ({(p.unrealizedPnlPct ?? 0) >= 0 ? "+" : ""}{p.unrealizedPnlPct?.toFixed(2)}%)
                    </span>
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No open positions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const signalLabels: Record<string, string> = {
  STRONG_BUY: "Strong Buy",
  BUY: "Buy",
  HOLD: "Hold",
  SELL: "Sell",
  STRONG_SELL: "Strong Sell",
};

const signalColor: Record<string, string> = {
  STRONG_BUY: "bg-vice-success/20 text-vice-success border-vice-success/30",
  BUY: "bg-vice-success/10 text-vice-success border-vice-success/20",
  HOLD: "bg-muted text-muted-foreground border-border",
  SELL: "bg-destructive/10 text-destructive border-destructive/20",
  STRONG_SELL: "bg-destructive/20 text-destructive border-destructive/30",
};

function SignalsPanel({ strategies }: { strategies: Strategy[] }) {

  return (
    <Card className="bg-card border-card-border" data-testid="panel-signals">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-vice-gold" />
          Live Signals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {strategies.map((s) => (
          <div key={s.id} className="flex items-center justify-between py-1.5">
            <div>
              <span className="text-xs font-medium">{s.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">
                conf: {((s.confidence ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            <Badge variant="outline" className={cn("text-[10px] font-bold", signalColor[s.lastSignal ?? "HOLD"])}>
              {signalLabels[s.lastSignal ?? "HOLD"] ?? s.lastSignal}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SentimentFeed({ entries }: { entries: SentimentEntry[] }) {
  const sentimentIcon: Record<string, any> = {
    bullish: TrendingUp,
    bearish: TrendingDown,
    neutral: Minus,
  };
  const sentimentColor: Record<string, string> = {
    bullish: "text-vice-success",
    bearish: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <Card className="bg-card border-card-border" data-testid="panel-sentiment">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(270 80% 55%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Ollama Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {entries.slice(0, 5).map((e) => {
          const Icon = sentimentIcon[e.sentiment] || Minus;
          return (
            <div key={e.id} className="flex items-start gap-2 py-1">
              <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", sentimentColor[e.sentiment])} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{e.symbol}</span>
                  <span className={cn("text-[10px] font-bold uppercase", sentimentColor[e.sentiment])}>
                    {e.sentiment} ({(Math.abs(e.score) * 100).toFixed(0)}%)
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{e.summary}</p>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No sentiment data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { mode } = useTradingMode();

  const { data: snapshot, isLoading: loadingSnap } = useQuery<PortfolioSnapshot>({
    queryKey: ["/api/portfolio", mode],
    refetchInterval: 10000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery<PortfolioSnapshot[]>({
    queryKey: ["/api/portfolio", mode, "history"],
    refetchInterval: 30000,
  });

  const { data: positions = [], isLoading: loadingPos } = useQuery<Position[]>({
    queryKey: ["/api/positions", mode],
    refetchInterval: 10000,
  });

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    refetchInterval: 15000,
  });

  const { data: sentiment = [] } = useQuery<SentimentEntry[]>({
    queryKey: ["/api/sentiment"],
    refetchInterval: 30000,
  });

  if (loadingSnap) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  const equity = snapshot?.equity ?? 100000;
  const cash = snapshot?.cash ?? 42000;
  const dayPnl = snapshot?.dayPnl ?? 0;
  const totalPnl = snapshot?.totalPnl ?? 0;
  const drawdown = snapshot?.drawdown ?? 0;

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-dashboard">
      <Link href="/execute">
        <div
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm hover:bg-primary/10 transition-colors cursor-pointer"
          data-testid="page-dashboard-execute-hint"
        >
          <CircleDollarSign className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-foreground">Execute a trade</p>
            <p className="text-xs text-muted-foreground">
              Place market equity orders on Alpaca (manual). Use START in the sidebar for automated cycles.
            </p>
          </div>
        </div>
      </Link>
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Portfolio Equity"
          value={`$${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          delta={`$${totalPnl.toFixed(2)}`}
          deltaPct={`${((totalPnl / (equity - totalPnl)) * 100).toFixed(2)}%`}
          icon={DollarSign}
          variant={totalPnl >= 0 ? "success" : "danger"}
        />
        <KpiCard
          title="Cash Available"
          value={`$${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={Wallet}
        />
        <KpiCard
          title="Day P&L"
          value={`${dayPnl >= 0 ? "+" : ""}$${dayPnl.toFixed(2)}`}
          icon={dayPnl >= 0 ? TrendingUp : TrendingDown}
          variant={dayPnl >= 0 ? "success" : "danger"}
        />
        <KpiCard
          title="Drawdown"
          value={`${(drawdown * 100).toFixed(2)}%`}
          icon={AlertTriangle}
          variant={drawdown > 0.10 ? "danger" : drawdown > 0.05 ? "warning" : "default"}
        />
      </div>

      <TaxSummaryCard mode={mode} />

      {/* Chart + Signals Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <EquityChart data={history ?? []} />
        <div className="space-y-3">
          <SignalsPanel strategies={strategies} />
          <SentimentFeed entries={sentiment} />
        </div>
      </div>

      {/* Positions */}
      <PositionsTable positions={positions} />
    </div>
  );
}
