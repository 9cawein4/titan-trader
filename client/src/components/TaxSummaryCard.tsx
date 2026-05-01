import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

export type TaxSummaryResponse = {
  taxYear: number;
  tradingMode: string;
  shortTermNet: number;
  longTermNet: number;
  netRealized: number;
  estimatedFederal: number;
  estimatedState: number;
  estimatedTotalTax: number;
  federalOnShortTerm?: number;
  federalOnLongTerm?: number;
  stateOnShortTerm?: number;
  stateOnLongTerm?: number;
  equityTradeRowsYtd: number;
  fifoSellMatches: number;
  residencyStateCode?: string | null;
  residencyStateName?: string | null;
  residencyBasisNote?: string | null;
  methodology?: string;
  reportingHints?: string[];
  rates?: {
    federalMarginal?: number;
    federalLongTerm?: number;
    stateShortTerm?: number;
    stateLongTerm?: number;
  };
  disclaimer: string;
};

export function TaxSummaryCard({ mode }: { mode: string }) {
  const { data: tax, isLoading, isError, error } = useQuery<TaxSummaryResponse>({
    queryKey: ["/api/tax/summary", mode],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-card-border col-span-full" data-testid="card-tax-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Taxable gains & estimates (YTD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !tax) {
    return (
      <Card className="bg-card border-card-border col-span-full" data-testid="card-tax-error">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Tax summary unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-destructive">{error instanceof Error ? error.message : "Configure Settings and ensure trades exist."}</p>
        </CardContent>
      </Card>
    );
  }

  const fmt = (n: number) =>
    `${n >= 0 ? "" : "-"}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const pct = (r: number | undefined) =>
    r == null ? "—" : `${Math.round(r * 100)}%`;

  const residencyLabel =
    tax.residencyStateName && tax.residencyStateCode
      ? `${tax.residencyStateName} (${tax.residencyStateCode})`
      : "State residency not set";

  return (
    <Card className="bg-card border-card-border col-span-full" data-testid="card-tax-summary">
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          Taxable gains & estimates ({tax.taxYear}, {tax.tradingMode})
        </CardTitle>
        <p className="text-[10px] text-muted-foreground font-normal leading-snug">
          Residency: <span className="text-foreground font-medium">{residencyLabel}</span>
          {tax.residencyBasisNote ? (
            <span className="block mt-1 opacity-90">{tax.residencyBasisNote}</span>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Net realized</p>
            <p className={cn("font-semibold tabular-nums", tax.netRealized >= 0 ? "text-vice-success" : "text-destructive")}>{fmt(tax.netRealized)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">ST {fmt(tax.shortTermNet)} · LT {fmt(tax.longTermNet)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Est. federal</p>
            <p className="font-semibold tabular-nums text-foreground">{fmt(tax.estimatedFederal)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              ST {fmt(tax.federalOnShortTerm ?? 0)} · LT {fmt(tax.federalOnLongTerm ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Est. state</p>
            <p className="font-semibold tabular-nums text-foreground">{fmt(tax.estimatedState)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              ST {fmt(tax.stateOnShortTerm ?? 0)} · LT {fmt(tax.stateOnLongTerm ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Est. total tax</p>
            <p className="font-semibold tabular-nums text-vice-orange">{fmt(tax.estimatedTotalTax)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{tax.equityTradeRowsYtd} equity rows · FIFO sells {tax.fifoSellMatches}</p>
          </div>
        </div>

        {tax.rates && (
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground space-y-1">
            <p className="uppercase tracking-wide text-[9px] font-semibold text-foreground/80">Rates in effect</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 tabular-nums">
              <span>Fed ST {pct(tax.rates.federalMarginal)}</span>
              <span>Fed LT {pct(tax.rates.federalLongTerm)}</span>
              <span>State ST {pct(tax.rates.stateShortTerm)}</span>
              <span>State LT {pct(tax.rates.stateLongTerm)}</span>
            </div>
          </div>
        )}

        {tax.methodology ? (
          <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">{tax.methodology}</p>
        ) : null}

        {tax.reportingHints && tax.reportingHints.length > 0 ? (
          <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-0.5">
            {tax.reportingHints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        ) : null}

        <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">{tax.disclaimer}</p>
        <p className="text-[10px] text-muted-foreground">
          Set residency and brackets in{" "}
          <Link href="/settings" className="text-primary underline font-medium">
            Settings
          </Link>
          . FIFO applies to logged equity trades only.
        </p>
      </CardContent>
    </Card>
  );
}
