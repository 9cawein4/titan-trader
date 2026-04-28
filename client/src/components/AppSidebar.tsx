import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShieldAlert,
  ScrollText,
  Settings,
  Activity,
  OctagonX,
  Play,
  Square,
} from "lucide-react";
import { useTradingMode } from "@/lib/tradingContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/risk", label: "Risk Mgmt", icon: ShieldAlert },
  { path: "/trades", label: "Trade Log", icon: ScrollText },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function AppSidebar() {
  const [location] = useLocation();
  const { mode, killSwitchActive, setKillSwitchActive, isTrading, setIsTrading, engineLastError } = useTradingMode();
  const { toast } = useToast();

  const handleKillSwitch = async () => {
    try {
      const action = killSwitchActive ? "deactivate" : "activate";
      const body: Record<string, string> = { action };
      if (action === "deactivate") body.confirmation = "RESUME TRADING";
      await apiRequest("POST", "/api/kill-switch", body);
      setKillSwitchActive(!killSwitchActive);
      if (action === "activate") setIsTrading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/risk"] });
      queryClient.invalidateQueries({ queryKey: ["/api/risk/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine"] });
      toast({
        title: killSwitchActive ? "Trading Resumed" : "KILL SWITCH ACTIVATED",
        description: killSwitchActive ? "Trading operations resumed." : "All trading halted. Paper orders cancelled on Alpaca.",
      });
    } catch (e) {
      toast({
        title: "Kill switch failed",
        description: e instanceof Error ? e.message : "Request failed.",
        variant: "destructive",
      });
    }
  };

  const handleStartStop = async () => {
    if (killSwitchActive) return;
    try {
      const next = isTrading ? "stop" : "start";
      await apiRequest("POST", "/api/engine/control", { action: next });
      await queryClient.invalidateQueries({ queryKey: ["/api/engine"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/system/status"] });
      toast({
        title: isTrading ? "Engine Stopped" : "Engine Started",
        description: isTrading
          ? "Autonomous loop stopped. Positions still at broker."
          : "Syncing with Alpaca and Ollama on each cycle. Paper or live per Settings.",
      });
    } catch (e) {
      toast({
        title: "Engine error",
        description: e instanceof Error ? e.message : "Request failed. Add API keys in Settings.",
        variant: "destructive",
      });
    }
  };

  return (
    <aside className="w-[220px] h-screen flex flex-col bg-sidebar border-r border-sidebar-border shrink-0" data-testid="sidebar">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Titan Trader Logo">
            <rect x="2" y="2" width="28" height="28" rx="6" stroke="hsl(187 100% 45%)" strokeWidth="2" />
            <path d="M8 22 L16 8 L24 22" stroke="hsl(330 100% 55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <line x1="11" y1="17" x2="21" y2="17" stroke="hsl(187 100% 45%)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="16" cy="12" r="2" fill="hsl(187 100% 45%)" />
          </svg>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-foreground">TITAN TRADER</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Local use only</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <Badge
          variant="outline"
          className={cn(
            "w-full justify-center py-1 text-[10px] font-bold tracking-widest uppercase border",
            mode === "paper"
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-vice-orange/40 text-vice-orange bg-vice-orange/10"
          )}
          data-testid="badge-trading-mode"
        >
          <Activity className="w-3 h-3 mr-1.5" />
          {mode === "paper" ? "Paper Trading" : "Live Trading"}
        </Badge>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path || (path !== "/" && location.startsWith(path));
          return (
            <Link key={path} href={path}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 space-y-2 border-t border-sidebar-border">
        <Button
          size="sm"
          className={cn(
            "w-full text-xs font-bold tracking-wide",
            isTrading
              ? "bg-vice-orange hover:bg-vice-orange/80 text-white"
              : "bg-primary hover:bg-primary/80 text-primary-foreground"
          )}
          onClick={() => void handleStartStop()}
          disabled={killSwitchActive}
          data-testid="button-start-stop"
        >
          {isTrading ? <Square className="w-3.5 h-3.5 mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          {isTrading ? "STOP" : "START"}
        </Button>

        {engineLastError && (
          <p
            className="text-[10px] text-destructive leading-tight rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5"
            title={engineLastError}
          >
            {engineLastError}
          </p>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              className={cn(
                "w-full text-xs font-bold tracking-wide",
                killSwitchActive && "animate-pulse-glow bg-destructive"
              )}
              data-testid="button-kill-switch"
            >
              <OctagonX className="w-3.5 h-3.5 mr-1.5" />
              {killSwitchActive ? "KILL ACTIVE" : "KILL SWITCH"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <OctagonX className="w-5 h-5" />
                {killSwitchActive ? "Resume Trading?" : "Activate Kill Switch?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {killSwitchActive
                  ? "This will resume autonomous trading operations. Ensure all risk checks are passing before proceeding."
                  : "This will immediately halt all trading, cancel pending Alpaca orders, and stop the engine loop."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleKillSwitch()}
                className={cn(
                  killSwitchActive ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
                )}
              >
                {killSwitchActive ? "Resume Trading" : "ACTIVATE KILL SWITCH"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="px-4 py-2 border-t border-sidebar-border">
        <p className="text-[10px] text-muted-foreground">Alpaca + Ollama � localhost</p>
      </div>
    </aside>
  );
}
