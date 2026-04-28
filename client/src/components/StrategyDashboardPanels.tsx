import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Brain } from "lucide-react";
import type { Strategy } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function StrategiesOnDashboard() {
  const { toast } = useToast();
  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    refetchInterval: 15000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/strategies/${id}`, { enabled });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({ title: "Strategy updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  return (
    <Card className="bg-card border-card-border" data-testid="dashboard-strategies">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Ensemble strategies
        </CardTitle>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Signals feed the equity ensemble. Rolling Sharpe/win rate derive from executed trades when available.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3">
        {strategies.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border border-border/60 bg-muted/15 px-3 py-2"
          >
            <span className="text-xs font-medium truncate pr-2">{s.name}</span>
            <Switch
              checked={!!s.enabled}
              onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, enabled: v })}
              className="data-[state=checked]:bg-primary shrink-0"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function OptionsAutomationHint() {
  return (
    <Card className="bg-card border-card-border border-dashed" data-testid="dashboard-options-hint">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Options · Wheel · Iron Condor</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 text-[11px] text-muted-foreground leading-relaxed space-y-2">
        <p>
          Option legs are synced from Alpaca into <strong className="text-foreground font-normal">Options positions</strong>{" "}
          when symbols match OCC format. Multi-leg opens use <code className="text-xs">submitMultilegOrder</code> once your
          account supports options trading.
        </p>
        <p>Automated CSP/CC wheel and iron-condor entry rules extend in server/strategies/.</p>
      </CardContent>
    </Card>
  );
}

