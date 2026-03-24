import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Brain,
  Layers,
  ShieldAlert,
  ScrollText,
  Settings,
  Zap,
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
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/strategies", label: "Strategies", icon: Brain },
  { path: "/options", label: "Options", icon: Layers },
  { path: "/risk", label: "Risk Mgmt", icon: ShieldAlert },
  { path: "/trades", label: "Trade Log", icon: ScrollText },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function AppSidebar() {
  const [location] = useLocation();
  const { mode, killSwitchActive, setKillSwitchActive, isTrading, setIsTrading } = useTradingMode();
  const { toast } = useToast();

  const handleKillSwitch = async () => {
    try {
      const action = killSwitchActive ? "deactivate" : "activate";
      const body: Record<string, string> = { action };
      if (action === "deactivate") body.confirmation = "RESUME TRADING";
      await apiRequest("POST", "/api/kill-switch", body);
      setKillSwitchActive(!killSwitchActive);
      setIsTrading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/risk"] });
      toast({
        title: killSwitchActive ? "Trading Resumed" : "KILL SWITCH ACTIVATED",
        description: killSwitchActive ? "Trading operations resumed." : "All trading halted. Orders cancelled.",
      });
    } catch {
      toast({ title: "Error", description: "Kill switch operation failed.", variant: "destructive" });
    }
  };

  const handleStartStop = () => {
    if (killSwitchActive) return;
    setIsTrading(!isTrading);
    toast({
      title: isTrading ? "Trading Stopped" : "Trading Started",
      description: isTrading ? "Autonomous trading loop paused." : `Autonomous trading loop running (${mode}).`,
    });
  };

  return (
    <aside className="w-[220px] h-screen flex flex-col bg-sidebar border-r border-sidebar-border shrink-0" data-testid="sidebar">
      {/* Logo */}
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
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Autonomous AI</p>
          </div>
        </div>
      </div>

      {/* Mode Badge */}
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

      {/* Navigation */}
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

      {/* Controls */}
      <div className="p-3 space-y-2 border-t border-sidebar-border">
        {/* Start / Stop */}
        <Button
          size="sm"
          className={cn(
            "w-full text-xs font-bold tracking-wide",
            isTrading
              ? "bg-vice-orange hover:bg-vice-orange/80 text-white"
              : "bg-primary hover:bg-primary/80 text-primary-foreground"
          )}
          onClick={handleStartStop}
          disabled={killSwitchActive}
          data-testid="button-start-stop"
        >
          {isTrading ? <Square className="w-3.5 h-3.5 mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          {isTrading ? "STOP" : "START"}
        </Button>

        {/* Kill Switch */}
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
                  : "This will immediately halt all trading, cancel pending orders, and prevent new trades. Use this for emergency situations only."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleKillSwitch}
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

      {/* Footer */}
      <div className="px-4 py-2 border-t border-sidebar-border">
        <a
          href="https://www.perplexity.ai/computer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Created with Perplexity Computer
        </a>
      </div>
    </aside>
  );
}
