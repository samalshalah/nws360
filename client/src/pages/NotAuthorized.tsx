import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function NotAuthorized() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <ShieldX className="w-16 h-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-semibold text-foreground" data-testid="text-not-authorized">
        Access Denied
      </h1>
      <p className="text-muted-foreground max-w-md" data-testid="text-not-authorized-desc">
        You don't have permission to view this page. Contact your administrator if you believe this is an error.
      </p>
      <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-home">
        Go to Home
      </Button>
    </div>
  );
}
