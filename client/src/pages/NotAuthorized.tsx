import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, ShieldX } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

export default function NotAuthorized() {
  const [, setLocation] = useLocation();
  const { capabilities, isAdmin } = usePermissions();
  const isPlatformContext = isAdmin && capabilities?.userScope === "platform" && !capabilities?.tenantId;
  const homeRoute = isPlatformContext ? "/admin" : "/feed";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <ShieldX className="w-16 h-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-semibold text-foreground" data-testid="text-not-authorized">
        Access Denied
      </h1>
      <p className="text-muted-foreground max-w-md" data-testid="text-not-authorized-desc">
        This page is outside your current workspace. Use the workspace selector to switch context, or return to your allowed home page.
      </p>
      <Button onClick={() => setLocation(homeRoute)} data-testid="button-go-home">
        <Home className="w-4 h-4 mr-2" />
        {isPlatformContext ? "Go to Control Center" : "Go to Feed"}
      </Button>
    </div>
  );
}
