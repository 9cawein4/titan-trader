import type { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { PerplexityAttribution } from "./PerplexityAttribution";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="dashboard-layout">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        <div className="scanline pointer-events-none fixed inset-0 z-50 opacity-30" />
        {children}
      </main>
    </div>
  );
}
