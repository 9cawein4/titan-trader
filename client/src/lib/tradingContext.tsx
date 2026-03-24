import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type TradingMode = "paper" | "live";

interface TradingContextType {
  mode: TradingMode;
  setMode: (mode: TradingMode) => void;
  killSwitchActive: boolean;
  setKillSwitchActive: (active: boolean) => void;
  isTrading: boolean;
  setIsTrading: (trading: boolean) => void;
}

const TradingContext = createContext<TradingContextType | null>(null);

export function TradingProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TradingMode>("paper");
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [isTrading, setIsTrading] = useState(false);

  return (
    <TradingContext.Provider
      value={{ mode, setMode, killSwitchActive, setKillSwitchActive, isTrading, setIsTrading }}
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
