import { useQuery } from "@tanstack/react-query";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, CircleDollarSign, Shield, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptionsPosition } from "@shared/schema";

function GreeksBadge({ label, value }: { label: string; value?: number | null }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-xs font-mono font-bold", value >= 0 ? "text-primary" : "text-destructive")}>
        {value >= 0 ? "+" : ""}{value.toFixed(3)}
      </p>
    </div>
  );
}

function OptionRow({ option }: { option: OptionsPosition }) {
  const pnl = option.premium && option.currentValue
    ? (option.premium - option.currentValue) * (option.contracts ?? 1) * 100
    : 0;
  const pnlPct = option.premium ? ((option.premium - (option.currentValue ?? 0)) / option.premium) * 100 : 0;

  return (
    <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2" data-testid={`option-${option.symbol}-${option.strike}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{option.symbol}</span>
          <Badge variant="outline" className={cn("text-[10px]", option.optionType === "call" ? "border-vice-success/40 text-vice-success" : "border-destructive/40 text-destructive")}>
            {option.optionType?.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">${option.strike} exp {option.expiration}</span>
        </div>
        <Badge variant="outline" className="text-[10px] border-border">
          {option.contracts} contract{option.contracts > 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground">Premium</p>
            <p className="text-xs font-mono font-semibold">${option.premium?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Current</p>
            <p className="text-xs font-mono font-semibold">${option.currentValue?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">P&L</p>
            <p className={cn("text-xs font-mono font-bold", pnl >= 0 ? "text-vice-success" : "text-destructive")}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)} ({pnlPct.toFixed(1)}%)
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <GreeksBadge label="Δ" value={option.delta} />
          <GreeksBadge label="Γ" value={option.gamma} />
          <GreeksBadge label="Θ" value={option.theta} />
          <GreeksBadge label="V" value={option.vega} />
        </div>
      </div>
    </div>
  );
}

export default function Options() {
  const { mode } = useTradingMode();

  const { data: options = [] } = useQuery<OptionsPosition[]>({
    queryKey: ["/api/options", mode],
    refetchInterval: 15000,
  });

  const wheelPositions = options.filter((o) => o.strategy === "wheel_csp" || o.strategy === "wheel_cc");
  const condorPositions = options.filter((o) => o.strategy === "iron_condor");

  const totalPremium = options.reduce((sum, o) => sum + ((o.premium ?? 0) * (o.contracts ?? 1) * 100), 0);
  const totalCurrentValue = options.reduce((sum, o) => sum + ((o.currentValue ?? 0) * (o.contracts ?? 1) * 100), 0);
  const netPnl = totalPremium - totalCurrentValue;

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-options">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Positions</p>
            <p className="text-xl font-bold">{options.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Premium Collected</p>
            <p className="text-xl font-bold text-primary">${totalPremium.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Value</p>
            <p className="text-xl font-bold">${totalCurrentValue.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net P&L</p>
            <p className={cn("text-xl font-bold", netPnl >= 0 ? "text-vice-success" : "text-destructive")}>
              {netPnl >= 0 ? "+" : ""}${netPnl.toFixed(0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="wheel" className="w-full">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="wheel" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-wheel">
            <CircleDollarSign className="w-3.5 h-3.5 mr-1.5" />
            Wheel Strategy
          </TabsTrigger>
          <TabsTrigger value="condor" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-condor">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
            Iron Condors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wheel" className="space-y-2 mt-3">
          <Card className="bg-card border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 text-vice-gold" />
                Wheel (CSP + Covered Calls)
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {wheelPositions.length} positions
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              {wheelPositions.map((o) => <OptionRow key={o.id} option={o} />)}
              {wheelPositions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No wheel positions</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="condor" className="space-y-2 mt-3">
          <Card className="bg-card border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-vice-purple" />
                Iron Condor Positions
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {condorPositions.length} legs
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              {condorPositions.map((o) => <OptionRow key={o.id} option={o} />)}
              {condorPositions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No iron condor positions</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
