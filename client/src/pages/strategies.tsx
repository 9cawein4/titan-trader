import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, Target, BarChart3, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Strategy } from "@shared/schema";

const signalColor: Record<string, string> = {
  STRONG_BUY: "bg-vice-success/20 text-vice-success border-vice-success/30",
  BUY: "bg-vice-success/10 text-vice-success border-vice-success/20",
  HOLD: "bg-muted text-muted-foreground border-border",
  SELL: "bg-destructive/10 text-destructive border-destructive/20",
  STRONG_SELL: "bg-destructive/20 text-destructive border-destructive/30",
};

function StrategyCard({ strategy }: { strategy: Strategy }) {
  return (
    <Card className="bg-card border-card-border relative overflow-hidden" data-testid={`strategy-${strategy.name.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="absolute inset-0 vice-gradient opacity-20" />
      <CardContent className="p-4 relative">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold">{strategy.name}</h3>
            <Badge variant="outline" className="text-[10px] mt-1 border-border text-muted-foreground">
              {strategy.type === "mean_reversion" ? "Mean Reversion" : "Trend Following"}
            </Badge>
          </div>
          <Switch checked={!!strategy.enabled} className="data-[state=checked]:bg-primary" data-testid={`switch-${strategy.name}`} />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sharpe</p>
            <p className="text-lg font-bold text-primary">{strategy.sharpeRatio?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
            <p className="text-lg font-bold">{((strategy.winRate ?? 0) * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trades</p>
            <p className="text-sm font-semibold text-muted-foreground">{strategy.totalTrades}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Factor</p>
            <p className="text-sm font-semibold text-muted-foreground">{strategy.profitFactor?.toFixed(2)}</p>
          </div>
        </div>

        {/* Weight bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</span>
            <span className="text-xs font-bold text-primary">{((strategy.weight ?? 0) * 100).toFixed(0)}%</span>
          </div>
          <Progress value={(strategy.weight ?? 0) * 100} className="h-1.5" />
        </div>

        {/* Signal */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Current Signal</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold", signalColor[strategy.lastSignal ?? "HOLD"])}>
            {strategy.lastSignal ?? "HOLD"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Strategies() {
  const { data: strategies = [], isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    refetchInterval: 15000,
  });

  // Ensemble vote calculation
  const totalWeight = strategies.reduce((sum, s) => sum + (s.enabled ? (s.weight ?? 0) : 0), 0);
  const buySignals = strategies.filter((s) => s.enabled && (s.lastSignal === "BUY" || s.lastSignal === "STRONG_BUY"));
  const buyWeight = buySignals.reduce((sum, s) => sum + (s.weight ?? 0), 0);
  const agreement = strategies.filter((s) => s.enabled).length > 0
    ? (buySignals.length / strategies.filter((s) => s.enabled).length) * 100
    : 0;
  const ensembleScore = totalWeight > 0 ? buyWeight / totalWeight : 0;

  const avgConfidence = strategies.length > 0
    ? strategies.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / strategies.length
    : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-strategies">
      {/* Ensemble Summary */}
      <Card className="bg-card border-card-border overflow-hidden" data-testid="card-ensemble-summary">
        <div className="absolute inset-0 vice-gradient opacity-10" />
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Scale className="w-4 h-4 text-vice-purple" />
            Ensemble Voting Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Ensemble Signal</p>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold py-1 px-3",
                  ensembleScore >= 0.6 ? signalColor["BUY"] : ensembleScore <= -0.3 ? signalColor["SELL"] : signalColor["HOLD"]
                )}
              >
                {ensembleScore >= 0.6 ? "BUY" : ensembleScore <= -0.3 ? "SELL" : "HOLD"}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
              <p className="text-xl font-bold text-primary">{(ensembleScore * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Agreement</p>
              <p className="text-xl font-bold">{agreement.toFixed(0)}%</p>
              <p className="text-[10px] text-muted-foreground">{buySignals.length}/{strategies.filter((s) => s.enabled).length} bullish</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg Confidence</p>
              <p className="text-xl font-bold">{(avgConfidence * 100).toFixed(0)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {strategies.map((s) => (
          <StrategyCard key={s.id} strategy={s} />
        ))}
      </div>
    </div>
  );
}
