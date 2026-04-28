import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Titan Trader UI]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
          <div className="space-y-2 max-w-md">
            <h2 className="text-lg font-semibold">Something broke in this view</h2>
            <p className="text-sm text-muted-foreground">
              Reload the page or check the browser console and the terminal running{" "}
              <code className="text-xs">npm run dev</code>.
            </p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
