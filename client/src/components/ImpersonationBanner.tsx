import { usePermissions } from "@/hooks/use-permissions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";

export function ImpersonationBanner() {
  const { impersonation, organization } = usePermissions();
  const queryClient = useQueryClient();

  const exitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/impersonate/exit");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      window.location.reload();
    },
  });

  if (!impersonation?.isImpersonating) return null;

  return (
    <div
      data-testid="banner-impersonation"
      className="sticky top-0 z-[9999] flex items-center justify-between gap-2 px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium"
    >
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span>
          Impersonating{organization ? `: ${organization.name}` : ""}
          {impersonation.activeUserId ? ` (User #${impersonation.activeUserId})` : ""}
        </span>
      </div>
      <Button
        data-testid="button-exit-impersonation"
        size="sm"
        variant="ghost"
        className="h-7 text-amber-950 no-default-hover-elevate"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
      >
        <X className="h-3 w-3 mr-1" />
        Exit
      </Button>
    </div>
  );
}
