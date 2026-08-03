import { useRoute } from "wouter";
import WorkspaceRelevance from "@/pages/WorkspaceRelevance";

export default function AdminWorkspaceRelevance() {
  const [, params] = useRoute("/admin/clients/:clientId/workspaces/:workspaceId/relevance");
  const clientId = Number(params?.clientId);
  const workspaceId = Number(params?.workspaceId);

  return (
    <WorkspaceRelevance
      adminClientId={clientId}
      adminWorkspaceId={workspaceId}
      backHref={Number.isInteger(clientId) && clientId > 0 ? `/admin/clients/${clientId}/setup` : "/admin"}
    />
  );
}
