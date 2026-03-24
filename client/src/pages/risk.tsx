import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, AlertTriangle, OctagonX, ShieldCheck, Gauge, Lock, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskEvent, TradingConfig, PortfolioSnapshot } from "@shared/schema";

function RiskMeter({
  label,
  value,
  max,
  icon: Icon,
  unit = "%",
}: {
  label: string;
  value: number;
  max: number;
  icon: any;
  unit?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const severity = pct > 80 ? "danger" : pct > 50 ? "warning" : "safe";
  const barColor = {
    safe: "bg-vice-success",
    warning: "bg-vice-orange",
    danger: "bg-destructive",
  }[severity];

  return (
    <div className="space-y-2" data-testid={`risk-meter-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", severity === "danger" ? "text-destructive" : severity === "warning" ? "text-vice-orange" : "text-vice-success")} />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className={cn("text-xs font-mono font-bold", severity === "danger" ? "text-destructive" : severity === "warning" ? "text-vice-orange" : "text-vice-success")}>
          {(value * 100).toFixed(2)}{unit} / {(max * 100).toFixed(0)}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RiskLayer({
  layer,
  label,
  description,
  limit,
  status,
}: {
  layer: number;
  label: string;
  description: string;
  limit: string;
  status: "active" | "triggered" | "breached";
}) {
  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-lg border", status === "breached" ? "border-destructive/40 bg-destructive/10" : status === "triggered" ? "border-vice-orange/40 bg-vice-orange/10" : "border-border/50 bg-muted/20")}>
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0", status === "breached" ? "bg-destructive text-white" : status === "triggered" ? "bg-vice-orange text-white" : "bg-primary/20 text-primary")}>
        {layer}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-mono font-bold">{limit}</p>
        <Badge variant="outline" className={cn("text-[10px]", status === "breached" ? "border-destructive/40 text-destructive" : status === "triggered" ? "border-vice-orange/40 text-vice-orange" : "border-vice-success/40 text-vice-success")}>
          {status === "breached" ? "BREACHED" : status === "triggered" ? "WARNING" : "OK"}
        </Badge>
      </div>
    </div>
  );
}

export default function Risk() {
  const { mode, killSwitchActive } = useTradingMode();

  const { data: config } = useQuery<TradingConfig>({
    queryKey: ["/api/config"],
  });

  const { data: events = [] } = useQuery<RiskEvent[]>({
    queryKey: ["/api/risk/events"],
    refetchInterval: 10000,
  });

  const { data: activeEvents = [] } = useQuery<RiskEvent[]>({
    queryKey: ["/api/risk/active"],
    refetchInterval: 10000,
  });

  const { data: snapshot } = useQuery<PortfolioSnapshot>({
    queryKey: ["/api/portfolio", mode],
    refetchInterval: 10000,
  });

  const drawdown = snapshot?.drawdown ?? 0;
  const dailyLoss = Math.abs(snapshot?.dayPnl ?? 0) / (snapshot?.equity ?? 100000);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-risk">
      {/* Kill Switch Status */}
      {killSwitchActive && (
        <Card className="bg-destructive/20 border-destructive/40 glow-pink" data-testid="card-kill-switch-active">
          <CardContent className="p-4 flex items-center gap-3">
            <OctagonX className="w-6 h-6 text-destructive animate-pulse-glow" />
            <div>
              <p className="text-sm font-bold text-destructive">KILL SWITCH ACTIVE</p>
              <p className="text-xs text-destructive/70">All trading halted. Pending orders cancelled. Use sidebar to deactivate.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Meters */}
      <Card className="bg-card border-card-border" data-testid="card-risk-meters">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Live Risk Meters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <RiskMeter label="Daily Loss" value={dailyLoss} max={config?.dailyLossLimit ?? 0.03} icon={ArrowDown} />
          <RiskMeter label="Drawdown" value={drawdown} max={config?.maxDrawdown ?? 0.15} icon={AlertTriangle} />
          <RiskMeter label="Portfolio Exposure" value={0.58} max={config?.maxPortfolioExposure ?? 0.60} icon={ShieldAlert} />
          <RiskMeter label="Options Allocation" value={0.22} max={config?.maxOptionsAllocation ?? 0.40} icon={Lock} />
        </CardContent>
      </Card>

      {/* 8-Layer Risk Architecture */}
      <Card className="bg-card border-card-border" data-testid="card-risk-layers">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-vice-success" />
            Multi-Layer Risk Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          <RiskLayer layer={1} label="Per-Trade Risk" description="Max 2% of portfolio per trade" limit={`${((config?.maxRiskPerTrade ?? 0.02) * 100).toFixed(0)}%`} status="active" />
          <RiskLayer layer={2} label="Position Sizing" description="Max 10% in any single position" limit="10%" status={activeEvents.some((e) => e.eventType === "position_limit") ? "triggered" : "active"} />
          <RiskLayer layer={3} label="Portfolio Exposure" description="Max total exposure" limit={`${((config?.maxPortfolioExposure ?? 0.60) * 100).toFixed(0)}%`} status="active" />
          <RiskLayer layer={4} label="Options Allocation" description="Max in options" limit={`${((config?.maxOptionsAllocation ?? 0.40) * 100).toFixed(0)}%`} status="active" />
          <RiskLayer layer={5} label="Daily Loss Breaker" description="Halt at daily loss" limit={`${((config?.dailyLossLimit ?? 0.03) * 100).toFixed(0)}%`} status={dailyLoss > (config?.dailyLossLimit ?? 0.03) ? "breached" : "active"} />
          <RiskLayer layer={6} label="Weekly Loss Breaker" description="Suspend at weekly loss" limit={`${((config?.weeklyLossLimit ?? 0.07) * 100).toFixed(0)}%`} status="active" />
          <RiskLayer layer={7} label="Max Drawdown Kill" description="Full shutdown at drawdown" limit={`${((config?.maxDrawdown ?? 0.15) * 100).toFixed(0)}%`} status={drawdown > (config?.maxDrawdown ?? 0.15) ? "breached" : "active"} />
          <RiskLayer layer={8} label="Emergency Kill Switch" description="Manual override — liquidates everything" limit="Manual" status={killSwitchActive ? "breached" : "active"} />
        </CardContent>
      </Card>

      {/* Recent Risk Events */}
      <Card className="bg-card border-card-border" data-testid="card-risk-events">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-vice-orange" />
            Recent Risk Events
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-2">
            {events.slice(0, 10).map((e) => (
              <div key={e.id} className={cn("flex items-start gap-2 p-2 rounded border", e.severity === "halt" ? "border-destructive/30 bg-destructive/5" : e.severity === "critical" ? "border-vice-orange/30 bg-vice-orange/5" : "border-border/50 bg-muted/10")}>
                <Badge variant="outline" className={cn("text-[10px] shrink-0 mt-0.5", e.severity === "halt" ? "text-destructive border-destructive/30" : e.severity === "critical" ? "text-vice-orange border-vice-orange/30" : "text-muted-foreground")}>
                  {e.severity?.toUpperCase()}
                </Badge>
                <div className="min-w-0">
                  <p className="text-xs">{e.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(e.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No risk events</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
