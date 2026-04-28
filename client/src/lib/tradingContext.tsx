import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RiskEvent } from "@shared/schema";

type TradingMode = "paper" | "live";

/** Mirrors server trading-engine getEngineState() */
export type EnginePayload = {
  running: boolean;
  lastCycleAt: string | null;
  lastCycleMs: number;
  lastError: string | null;
  cyclesCompleted: number;
  peakEquity: number;
};

interface TradingContextType {
  mode: TradingMode;
  setMode: (mode: TradingMode) => void;
  killSwitchActive: boolean;
  setKillSwitchActive: (active: boolean) => void;
  isTrading: boolean;
  setIsTrading: (trading: boolean) => void;
  engineLastError: string | null;
}

const TradingContext = createContext<TradingContextType | null>(null);

export function TradingProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TradingMode>("paper");
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [isTrading, setIsTrading] = useState(false);

  const { data: activeRisk = [] } = useQuery<RiskEvent[]>({
    queryKey: ["/api/risk/active"],
    refetchInterval: 8000,
  });

  useEffect(() => {
    const ks = activeRisk.some((e) => e.eventType === "kill_switch" && e.severity === "halt");
    setKillSwitchActive(ks);
    if (ks) setIsTrading(false);
  }, [activeRisk]);

  const { data: engineState } = useQuery<EnginePayload>({
    queryKey: ["/api/engine"],
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (engineState && typeof engineState.running === "boolean") {
      setIsTrading(engineState.running);
    }
  }, [engineState]);

  const engineLastError = engineState?.lastError ?? null;

  return (
    <TradingContext.Provider
      value={{
        mode,
        setMode,
        killSwitchActive,
        setKillSwitchActive,
        isTrading,
        setIsTrading,
        engineLastError,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
}

export function useTradingMode() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTradingMode must be used within TradingProvider");
  return ctx;
}
