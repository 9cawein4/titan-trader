import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTradingMode } from "@/lib/tradingContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
import {
  Settings as SettingsIcon,
  Key,
  Shield,
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  Eye,
  EyeOff,
  Cpu,
  Database,
  Server,
  Radio,
  Landmark,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TradingConfig, SystemStatus } from "@shared/schema";
import { STATE_RESIDENCY_LIST, getResidencyStateInfo } from "@shared/stateTax";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function SystemStatusCard({ statuses }: { statuses: SystemStatus[] }) {
  const statusIcon: Record<string, any> = {
    broker: Wifi,
    ollama: Cpu,
    database: Database,
    orchestrator: Server,
  };
  const statusColor: Record<string, string> = {
    healthy: "text-vice-success",
    degraded: "text-vice-orange",
    down: "text-destructive",
  };

  return (
    <Card className="bg-card border-card-border" data-testid="card-system-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {statuses.map((s) => {
          const Icon = statusIcon[s.component] || Server;
          return (
            <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20" data-testid={`status-${s.component}`}>
              <div className="flex items-center gap-2.5">
                <Icon className={cn("w-4 h-4", statusColor[s.status] || "text-muted-foreground")} />
                <div>
                  <p className="text-xs font-semibold capitalize">{s.component}</p>
                  <p className="text-[10px] text-muted-foreground">{s.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.responseTimeMs != null && (
                  <span className="text-[10px] text-muted-foreground font-mono">{s.responseTimeMs}ms</span>
                )}
                <Badge variant="outline" className={cn("text-[10px]", s.status === "healthy" ? "border-vice-success/30 text-vice-success" : s.status === "degraded" ? "border-vice-orange/30 text-vice-orange" : "border-destructive/30 text-destructive")}>
                  {s.status === "healthy" ? <CheckCircle className="w-3 h-3 mr-1" /> : s.status === "degraded" ? <AlertTriangle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                  {s.status?.toUpperCase()}
                </Badge>
              </div>
            </div>
          );
        })}
        {statuses.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No system data</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { mode, setMode } = useTradingMode();
  const { toast } = useToast();
  const [showPaperKey, setShowPaperKey] = useState(false);
  const [showLiveKey, setShowLiveKey] = useState(false);
  const [paperKey, setPaperKey] = useState("");
  const [paperSecret, setPaperSecret] = useState("");
  const [liveKey, setLiveKey] = useState("");
  const [liveSecret, setLiveSecret] = useState("");
  const [liveConfirmation, setLiveConfirmation] = useState("");
  const [paperTradingUrl, setPaperTradingUrl] = useState("");
  const [liveTradingUrl, setLiveTradingUrl] = useState("");

  const { data: config } = useQuery<TradingConfig>({
    queryKey: ["/api/config"],
  });

  const [wl, setWl] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [taxFedPct, setTaxFedPct] = useState(22);
  const [taxStatePct, setTaxStatePct] = useState(5);
  const [taxStateLtPct, setTaxStateLtPct] = useState(5);
  const [taxLtPct, setTaxLtPct] = useState(15);
  const [taxStateCode, setTaxStateCode] = useState("");

  useEffect(() => {
    if (config) {
      setWl(config.watchlist ?? "");
      setOllamaUrl(config.ollamaUrl ?? "http://localhost:11434");
      setOllamaModel(config.ollamaModel ?? "llama3.2");
      setTaxFedPct(Math.round((config.taxFederalMarginalRate ?? 0.22) * 100));
      setTaxStatePct(Math.round((config.taxStateRate ?? 0.05) * 100));
      setTaxStateLtPct(
        Math.round(((config.taxStateLongTermRate ?? config.taxStateRate) ?? 0.05) * 100),
      );
      setTaxLtPct(Math.round((config.taxLongTermFedRate ?? 0.15) * 100));
      setTaxStateCode((config.taxResidencyState ?? "").trim().toUpperCase());
      setPaperTradingUrl(config.paperTradingApiBaseUrl ?? "");
      setLiveTradingUrl(config.liveTradingApiBaseUrl ?? "");
    }
  }, [config]);

  const configExtraMutation = useMutation({
    mutationFn: async (body: { watchlist: string; ollamaUrl: string; ollamaModel: string }) => {
      await apiRequest("PATCH", "/api/config", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Saved", description: "Watchlist and Ollama updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const taxRatesMutation = useMutation({
    mutationFn: async (body: {
      taxFederalMarginalRate: number;
      taxStateRate: number;
      taxStateLongTermRate: number;
      taxLongTermFedRate: number;
      taxResidencyState: string;
    }) => {
      await apiRequest("PATCH", "/api/config", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax/summary"] });
      toast({ title: "Saved", description: "Tax rate assumptions updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const sortedStates = useMemo(
    () => [...STATE_RESIDENCY_LIST].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const residencyHint = taxStateCode ? getResidencyStateInfo(taxStateCode)?.basis : null;

  const { data: statuses = [] } = useQuery<SystemStatus[]>({
    queryKey: ["/api/system/status"],
    refetchInterval: 15000,
  });

  const saveTradingEndpointsMutation = useMutation({
    mutationFn: async (patch: { paperTradingApiBaseUrl?: string; liveTradingApiBaseUrl?: string }) => {
      await apiRequest("PATCH", "/api/config", patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Saved", description: "Trading API base URL updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const saveKeysMutation = useMutation({
    mutationFn: async ({
      tradingMode,
      apiKey,
      apiSecret,
      tradingApiBaseUrl,
    }: {
      tradingMode: string;
      apiKey: string;
      apiSecret: string;
      tradingApiBaseUrl?: string;
    }) => {
      await apiRequest("POST", "/api/config/api-keys", {
        tradingMode,
        apiKey,
        apiSecret,
        ...(tradingApiBaseUrl !== undefined ? { tradingApiBaseUrl } : {}),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "API Keys Saved", description: `${variables.tradingMode} credentials encrypted and stored.` });
      if (variables.tradingMode === "paper") { setPaperKey(""); setPaperSecret(""); }
      else { setLiveKey(""); setLiveSecret(""); }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save API keys.", variant: "destructive" });
    },
  });

  const switchModeMutation = useMutation({
    mutationFn: async ({ targetMode, confirmation }: { targetMode: string; confirmation?: string }) => {
      await apiRequest("POST", "/api/config/trading-mode", { mode: targetMode, confirmation });
    },
    onSuccess: (_, variables) => {
      setMode(variables.targetMode as "paper" | "live");
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Trading Mode Changed", description: `Switched to ${variables.targetMode} trading.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="page-settings">
      {/* System Status */}
      <SystemStatusCard statuses={statuses} />

      {/* Trading Mode */}
      <Card className="bg-card border-card-border" data-testid="card-trading-mode">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Trading Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <Tabs value={mode} className="w-full">
            <TabsList className="bg-muted border border-border w-full">
              <TabsTrigger
                value="paper"
                className="flex-1 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                onClick={() => switchModeMutation.mutate({ targetMode: "paper" })}
                data-testid="tab-paper-mode"
              >
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Paper Trading
              </TabsTrigger>
              <TabsTrigger value="live" className="flex-1 text-xs data-[state=active]:bg-vice-orange/20 data-[state=active]:text-vice-orange" data-testid="tab-live-mode" asChild>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="flex items-center justify-center gap-1.5 w-full h-full px-3 text-xs font-medium" disabled={mode === "live"}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Live Trading
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Switch to Live Trading?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>This will use real money with your live Alpaca API keys. Ensure you understand the risks.</p>
                        <p className="font-semibold">Type "CONFIRM LIVE TRADING" to proceed:</p>
                        <Input
                          value={liveConfirmation}
                          onChange={(e) => setLiveConfirmation(e.target.value)}
                          placeholder="CONFIRM LIVE TRADING"
                          className="bg-muted border-border font-mono"
                          data-testid="input-live-confirmation"
                        />
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setLiveConfirmation("")}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={liveConfirmation !== "CONFIRM LIVE TRADING"}
                        onClick={() => {
                          switchModeMutation.mutate({ targetMode: "live", confirmation: liveConfirmation });
                          setLiveConfirmation("");
                        }}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Switch to Live
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-2">
              {mode === "paper" ? (
                <Shield className="w-4 h-4 text-primary" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-vice-orange" />
              )}
              <p className="text-xs">
                {mode === "paper"
                  ? "Paper trading mode â€” no real money at risk. Practice freely."
                  : "LIVE TRADING â€” Real money is at risk. Monitor closely."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="bg-card border-card-border" data-testid="card-api-keys">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-vice-gold" />
            Alpaca API Keys
            <Badge variant="outline" className="text-[10px] ml-auto">
              <Lock className="w-3 h-3 mr-1" />
              AES-256 Encrypted
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {/* Paper Keys */}
          <div className="space-y-3 p-3 rounded-lg border border-border/50">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Paper Trading Keys
              </h4>
              <Badge variant="outline" className={cn("text-[10px]", config?.paperApiKey === "***SET***" ? "text-vice-success border-vice-success/30" : "text-muted-foreground")}>
                {config?.paperApiKey === "***SET***" ? "Configured" : "Not Set"}
              </Badge>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Trading API base URL
                </Label>
                <Input
                  value={paperTradingUrl}
                  onChange={(e) => setPaperTradingUrl(e.target.value)}
                  placeholder="https://paper-api.alpaca.markets/v2"
                  className="bg-muted border-border text-xs font-mono h-8 mt-1"
                  data-testid="input-paper-trading-url"
                />
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Same endpoint Alpaca shows for paper trading. Host only or full URL with /v2 both work.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs mt-2"
                  disabled={saveTradingEndpointsMutation.isPending}
                  onClick={() =>
                    saveTradingEndpointsMutation.mutate({ paperTradingApiBaseUrl: paperTradingUrl.trim() })
                  }
                  data-testid="button-save-paper-trading-url"
                >
                  Save paper endpoint
                </Button>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">API Key</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type={showPaperKey ? "text" : "password"}
                    value={paperKey}
                    onChange={(e) => setPaperKey(e.target.value)}
                    placeholder="PKXXXXXXXXXXXXXXXXXX"
                    className="bg-muted border-border text-xs font-mono h-8"
                    data-testid="input-paper-key"
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowPaperKey(!showPaperKey)}>
                    {showPaperKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">API Secret</Label>
                <Input
                  type="password"
                  value={paperSecret}
                  onChange={(e) => setPaperSecret(e.target.value)}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  className="bg-muted border-border text-xs font-mono h-8 mt-1"
                  data-testid="input-paper-secret"
                />
              </div>
              <Button
                size="sm"
                className="text-xs bg-primary text-primary-foreground"
                disabled={!paperKey || !paperSecret || paperKey.length < 10 || saveKeysMutation.isPending}
                onClick={() =>
                  saveKeysMutation.mutate({
                    tradingMode: "paper",
                    apiKey: paperKey,
                    apiSecret: paperSecret,
                    tradingApiBaseUrl: paperTradingUrl.trim(),
                  })
                }
                data-testid="button-save-paper-keys"
              >
                <Lock className="w-3 h-3 mr-1.5" />
                Save Paper Keys (Encrypted)
              </Button>
            </div>
          </div>

          {/* Live Keys */}
          <div className="space-y-3 p-3 rounded-lg border border-destructive/20">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-vice-orange" />
                Live Trading Keys
              </h4>
              <Badge variant="outline" className={cn("text-[10px]", config?.liveApiKey === "***SET***" ? "text-vice-success border-vice-success/30" : "text-muted-foreground")}>
                {config?.liveApiKey === "***SET***" ? "Configured" : "Not Set"}
              </Badge>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Trading API base URL
                </Label>
                <Input
                  value={liveTradingUrl}
                  onChange={(e) => setLiveTradingUrl(e.target.value)}
                  placeholder="https://api.alpaca.markets/v2"
                  className="bg-muted border-border text-xs font-mono h-8 mt-1"
                  data-testid="input-live-trading-url"
                />
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Live trading endpoint from your Alpaca dashboard.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs mt-2"
                  disabled={saveTradingEndpointsMutation.isPending}
                  onClick={() =>
                    saveTradingEndpointsMutation.mutate({ liveTradingApiBaseUrl: liveTradingUrl.trim() })
                  }
                  data-testid="button-save-live-trading-url"
                >
                  Save live endpoint
                </Button>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">API Key</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type={showLiveKey ? "text" : "password"}
                    value={liveKey}
                    onChange={(e) => setLiveKey(e.target.value)}
                    placeholder="AKXXXXXXXXXXXXXXXXXX"
                    className="bg-muted border-border text-xs font-mono h-8"
                    data-testid="input-live-key"
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowLiveKey(!showLiveKey)}>
                    {showLiveKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">API Secret</Label>
                <Input
                  type="password"
                  value={liveSecret}
                  onChange={(e) => setLiveSecret(e.target.value)}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  className="bg-muted border-border text-xs font-mono h-8 mt-1"
                  data-testid="input-live-secret"
                />
              </div>
              <Button
                size="sm"
                className="text-xs bg-vice-orange text-white hover:bg-vice-orange/80"
                disabled={!liveKey || !liveSecret || liveKey.length < 10 || saveKeysMutation.isPending}
                onClick={() =>
                  saveKeysMutation.mutate({
                    tradingMode: "live",
                    apiKey: liveKey,
                    apiSecret: liveSecret,
                    tradingApiBaseUrl: liveTradingUrl.trim(),
                  })
                }
                data-testid="button-save-live-keys"
              >
                <Lock className="w-3 h-3 mr-1.5" />
                Save Live Keys (Encrypted)
              </Button>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 p-2.5 rounded border border-border/50 bg-muted/10">
            <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="text-[10px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Security Measures</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>API keys encrypted with AES-256-CBC at rest</li>
                <li>Keys never logged or exposed in API responses</li>
                <li>HMAC-signed audit trail for all configuration changes</li>
                <li>Rate limiting on all API endpoints (100 req/min)</li>
                <li>Input validation with hard safety caps on risk limits</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Tax reporting assumptions — clearer defaults + context */}
      <Card className="bg-card border-card-border" data-testid="card-tax-rates">
        <CardHeader className="pb-2 space-y-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Tax reporting assumptions
          </CardTitle>
          <p className="text-[10px] text-muted-foreground font-normal leading-relaxed">
            These percentages only affect the <span className="text-foreground/90">dashboard tax estimate</span>. They do not change orders or risk.
            Use rough <span className="text-foreground/90">marginal</span> rates for this year (often from last year&apos;s brackets or your CPA)—not your overall effective rate.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <details className="rounded-md border border-border/50 bg-muted/15 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted/25 rounded-md">
              How Titan uses these numbers (tap to expand)
            </summary>
            <div className="space-y-2 px-3 pb-3 pt-0 border-t border-border/30">
              <ul className="text-[10px] text-muted-foreground leading-relaxed space-y-1.5 list-disc list-inside pt-2 marker:text-primary/80">
                <li><span className="text-foreground/90">Gains only:</span> Each slider multiplies <span className="text-foreground/90">positive</span> realized gains in that bucket; net losses are not taxed here.</li>
                <li><span className="text-foreground/90">ST vs LT:</span> Short-term covers lots held <span className="text-foreground/90">one year or less</span>; long-term covers lots held more than one year (FIFO on logged equity trades).</li>
                <li><span className="text-foreground/90">Federal vs state:</span> Four independent sliders. Federal uses ordinary vs preferential LT rates; state sliders follow how your residency usually treats ST/LT (defaults load from the table).</li>
                <li><span className="text-foreground/90">Excluded:</span> Wash sales, NIIT, AMT, loss limits, options/crypto rules, multi-state or city tax—tune sliders manually if relevant.</li>
              </ul>
            </div>
          </details>

          <div className="space-y-2 rounded-lg border border-border/40 bg-muted/10 p-3">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">State of residency</Label>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Where you file state income tax. Picking a state loads <span className="text-foreground/90">recommended</span> state ST/LT rates; you can override each slider.
            </p>
            <Select
              value={taxStateCode || "__NONE__"}
              onValueChange={(v) => {
                const code = v === "__NONE__" ? "" : v;
                setTaxStateCode(code);
                const info = getResidencyStateInfo(code);
                if (info) {
                  setTaxStatePct(Math.round(info.defaultShortTermRate * 100));
                  setTaxStateLtPct(Math.round(info.defaultLongTermRate * 100));
                }
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-muted border-border">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(280px,50vh)]">
                <SelectItem value="__NONE__" className="text-xs">
                  Not set (generic defaults only)
                </SelectItem>
                {sortedStates.map((st) => (
                  <SelectItem key={st.code} value={st.code} className="text-xs">
                    {st.name} ({st.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {residencyHint && (
              <p className="text-[10px] text-muted-foreground leading-snug border border-border/40 rounded-md p-2 bg-background/50">
                <span className="font-medium text-foreground/90">Reference note for this state: </span>
                {residencyHint}
              </p>
            )}
            <Button type="button" variant="outline" size="sm" className="text-xs h-8" disabled={!taxStateCode}
              onClick={() => {
                const info = getResidencyStateInfo(taxStateCode);
                if (!info) return;
                setTaxStatePct(Math.round(info.defaultShortTermRate * 100));
                setTaxStateLtPct(Math.round(info.defaultLongTermRate * 100));
              }}
            >
              Apply table defaults for this state
            </Button>
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Federal (IRS portion)</p>
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
            <div className="flex justify-between gap-3 items-start">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs text-foreground">Short-term gains rate</Label>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Federal tax on profits from sales held <span className="text-foreground/90">one year or less</span> (ordinary-income treatment).
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">{taxFedPct}%</span>
            </div>
            <Slider value={[taxFedPct]} min={0} max={37} step={1} onValueChange={(v) => setTaxFedPct(v[0])} className="py-1" />
          </div>
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
            <div className="flex justify-between gap-3 items-start">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs text-foreground">Long-term capital gains rate</Label>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Preferential federal rate on gains from stock held <span className="text-foreground/90">more than one year</span>.
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">{taxLtPct}%</span>
            </div>
            <Slider value={[taxLtPct]} min={0} max={24} step={1} onValueChange={(v) => setTaxLtPct(v[0])} className="py-1" />
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">State (residency portion)</p>
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
            <div className="flex justify-between gap-3 items-start">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs text-foreground">Short-term gains (state)</Label>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  State tax on short-term profits—often tracks ordinary state rates.
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">{taxStatePct}%</span>
            </div>
            <Slider value={[taxStatePct]} min={0} max={15} step={1} onValueChange={(v) => setTaxStatePct(v[0])} className="py-1" />
          </div>
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
            <div className="flex justify-between gap-3 items-start">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs text-foreground">Long-term gains (state)</Label>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Often matches short-term where both are taxed as ordinary income; set separately if your state differs.
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">{taxStateLtPct}%</span>
            </div>
            <Slider value={[taxStateLtPct]} min={0} max={15} step={1} onValueChange={(v) => setTaxStateLtPct(v[0])} className="py-1" />
          </div>

          <div className="rounded-md border border-dashed border-border/60 bg-muted/5 px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
            Saving updates your Titan config and the dashboard tax card. Cross-check with broker Form <span className="text-foreground/90">8949 / Schedule D</span> figures—not tax advice.
          </div>

          <Button
            size="sm"
            disabled={taxRatesMutation.isPending}
            onClick={() =>
              taxRatesMutation.mutate({
                taxFederalMarginalRate: taxFedPct / 100,
                taxStateRate: taxStatePct / 100,
                taxStateLongTermRate: taxStateLtPct / 100,
                taxLongTermFedRate: taxLtPct / 100,
                taxResidencyState: taxStateCode.length === 2 ? taxStateCode : "",
              })
            }
          >
            Save tax assumptions
          </Button>
        </CardContent>
      </Card>

      {/* Watchlist + Ollama */}
      <Card className="bg-card border-card-border" data-testid="card-watchlist">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-vice-purple" />
            Watchlist and Ollama
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {(config?.watchlist ?? "").split(",").filter(Boolean).map((sym) => (
              <Badge key={sym} variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5 py-1 px-2.5">
                {sym.trim()}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Symbols (comma-separated)</Label>
            <Textarea
              value={wl}
              onChange={(e) => setWl(e.target.value)}
              className="bg-muted border-border text-xs font-mono min-h-[72px]"
              placeholder="AAPL,MSFT,..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Ollama URL</Label>
              <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} className="bg-muted border-border text-xs mt-1" />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Model name</Label>
              <Input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className="bg-muted border-border text-xs mt-1" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={configExtraMutation.isPending}
            onClick={() =>
              configExtraMutation.mutate({
                watchlist: wl.replace(/[<>"']/g, "").slice(0, 2000),
                ollamaUrl: ollamaUrl.trim().slice(0, 256),
                ollamaModel: ollamaModel.trim().slice(0, 128),
              })
            }
          >
            Save watchlist and Ollama
          </Button>
          <p className="text-[10px] text-muted-foreground">
            The engine pulls 15m bars and asks Ollama for sentiment each cycle (rotating symbols).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
