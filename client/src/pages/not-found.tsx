import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md mx-4 bg-card border-card-border">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h1 className="text-lg font-bold mb-2">404 — Not Found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This page doesn't exist.
          </p>
          <Link href="/">
            <Button size="sm" className="bg-primary text-primary-foreground">
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
