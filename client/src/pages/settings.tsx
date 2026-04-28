import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TradingConfig, SystemStatus } from "@shared/schema";

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

  const { data: config } = useQuery<TradingConfig>({
    queryKey: ["/api/config"],
  });

  const [wl, setWl] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");

  useEffect(() => {
    if (config) {
      setWl(config.watchlist ?? "");
      setOllamaUrl(config.ollamaUrl ?? "http://localhost:11434");
      setOllamaModel(config.ollamaModel ?? "llama3.2");
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

  const { data: statuses = [] } = useQuery<SystemStatus[]>({
    queryKey: ["/api/system/status"],
    refetchInterval: 15000,
  });

  const saveKeysMutation = useMutation({
    mutationFn: async ({ tradingMode, apiKey, apiSecret }: { tradingMode: string; apiKey: string; apiSecret: string }) => {
      await apiRequest("POST", "/api/config/api-keys", { tradingMode, apiKey, apiSecret });
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
                onClick={() => saveKeysMutation.mutate({ tradingMode: "paper", apiKey: paperKey, apiSecret: paperSecret })}
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
                onClick={() => saveKeysMutation.mutate({ tradingMode: "live", apiKey: liveKey, apiSecret: liveSecret })}
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
