import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TradingProvider } from "@/lib/tradingContext";
import DashboardLayout from "@/components/DashboardLayout";
import Dashboard from "@/pages/dashboard";
import Strategies from "@/pages/strategies";
import Options from "@/pages/options";
import Risk from "@/pages/risk";
import Trades from "@/pages/trades";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/options" component={Options} />
        <Route path="/risk" component={Risk} />
        <Route path="/trades" component={Trades} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TradingProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TradingProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
