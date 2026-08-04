import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Search, Users, Activity, ListChecks, RadioTower, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Client = {
  id: number;
  name: string;
  organizationType?: string | null;
  lifecycleStatus?: string | null;
  active?: boolean | null;
  createdAt?: string | null;
};

type Workspace = {
  id: number;
  name: string;
  active?: boolean | null;
  status?: string | null;
};

type Readiness = {
  technicalReady?: boolean;
  lifecycleReady?: boolean;
  monitoringReady?: boolean;
  sourceAssignmentsConfigured?: number;
  sourceAssignmentsBlocked?: number;
  sourceAssignmentTestsPassed?: number;
  sourceAssignmentTestsStale?: number;
};

type Assignment = {
  id: number;
  enabled?: boolean;
  status?: string | null;
};

type ClientSummary = {
  client: Client;
  workspaces: Workspace[];
  tenantUserCount: number | null;
  readiness: Readiness | null;
  sourceAssignmentCount: number | null;
  enabledSourceCount: number | null;
  primaryWorkspace: Workspace | null;
  warning?: string;
};

export function buildClientManagementLinks(client: Pick<Client, "id">, primaryWorkspace?: Pick<Workspace, "id"> | null) {
  return {
    openClient: `/admin/clients/${client.id}/setup`,
    manageUsers: `/admin/users?clientId=${client.id}`,
    manageSources: primaryWorkspace
      ? `/admin/clients/${client.id}/workspaces/${primaryWorkspace.id}/sources`
      : `/admin/clients/${client.id}/setup`,
  };
}

function formatCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function formatDate(value?: string | null) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "n/a" : parsed.toLocaleDateString();
}

function lifecycleVariant(status?: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "suspended" || status === "archived") return "destructive";
  if (status === "setup" || status === "draft") return "secondary";
  return "outline";
}

function readinessLabel(summary: ClientSummary) {
  if (summary.readiness?.monitoringReady === true) return "Ready";
  if (summary.readiness?.monitoringReady === false) return "Needs setup";
  if ((summary.readiness?.sourceAssignmentsBlocked ?? 0) > 0) return "Blocked";
  if ((summary.sourceAssignmentCount ?? 0) > 0) return "Configured";
  return "Not configured";
}

function readinessVariant(summary: ClientSummary): "default" | "secondary" | "outline" | "destructive" {
  const label = readinessLabel(summary);
  if (label === "Ready" || label === "Configured") return "default";
  if (label === "Blocked") return "destructive";
  if (label === "Needs setup") return "secondary";
  return "outline";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const message = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${message}`);
  }
  return res.json();
}

async function optionalJson<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

async function loadClientSummaries(): Promise<ClientSummary[]> {
  const clients = await fetchJson<Client[]>("/api/admin/clients");
  return Promise.all(clients.map(async (client) => {
    const [workspacePayload, users, readiness] = await Promise.all([
      optionalJson<{ items?: Workspace[]; total?: number }>(`/api/admin/clients/${client.id}/workspaces`),
      optionalJson<any[]>(`/api/admin/users?clientId=${client.id}`),
      optionalJson<Readiness>(`/api/admin/clients/${client.id}/readiness`),
    ]);
    const workspaces = workspacePayload?.items ?? [];
    const assignmentPayloads = await Promise.all(workspaces.map((workspace) =>
      optionalJson<{ assignments?: Assignment[] }>(`/api/admin/clients/${client.id}/workspaces/${workspace.id}/source-assignments`)
    ));
    const assignments = assignmentPayloads.flatMap((payload) => payload?.assignments ?? []);
    const primaryWorkspace = workspaces.find((workspace) => workspace.active || workspace.status === "active") ?? workspaces[0] ?? null;
    return {
      client,
      workspaces,
      tenantUserCount: Array.isArray(users) ? users.length : null,
      readiness,
      sourceAssignmentCount: assignments.length > 0 ? assignments.length : (readiness?.sourceAssignmentsConfigured ?? null),
      enabledSourceCount: assignments.length > 0 ? assignments.filter((assignment) => assignment.enabled === true).length : null,
      primaryWorkspace,
      warning: workspaces.length > 0 && assignmentPayloads.some((payload) => payload === null)
        ? "Some source assignment counts are unavailable."
        : undefined,
    };
  }));
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function AdminClients() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const { data, isLoading, error, refetch } = useQuery<ClientSummary[]>({
    queryKey: ["/api/admin/client-summaries"],
    queryFn: loadClientSummaries,
  });

  const lifecycleOptions = useMemo(() => {
    const values = new Set((data ?? []).map((summary) => summary.client.lifecycleStatus || "unknown"));
    return ["all", ...Array.from(values).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((summary) => {
      const matchesSearch = !term || [
        summary.client.name,
        summary.client.organizationType,
        summary.client.lifecycleStatus,
      ].some((value) => String(value || "").toLowerCase().includes(term));
      const matchesLifecycle = lifecycleFilter === "all" || (summary.client.lifecycleStatus || "unknown") === lifecycleFilter;
      return matchesSearch && matchesLifecycle;
    });
  }, [data, lifecycleFilter, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-clients-title">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform client accounts, workspaces, assigned users, and monitoring readiness.
          </p>
        </div>
        <Button onClick={() => setLocation("/admin/clients/new")} data-testid="button-enroll-new-client">
          <Plus className="mr-2 h-4 w-4" />
          Enroll New Client
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Search clients"
            data-testid="input-admin-clients-search"
          />
        </div>
        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-full md:w-56" data-testid="select-admin-clients-lifecycle">
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            {lifecycleOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All lifecycle states" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3" data-testid="admin-clients-loading">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full" />)}
        </div>
      ) : error ? (
        <Card className="border-destructive/40" data-testid="admin-clients-error">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Building2 className="h-10 w-10 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">Clients could not be loaded.</h2>
              <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="border-dashed border-border/70 bg-muted/20" data-testid="admin-clients-empty">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">No clients have been enrolled yet.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Enroll the first client to create its workspace, user access, and source assignments.
            </p>
            <Button className="mt-5" onClick={() => setLocation("/admin/clients/new")} data-testid="button-create-first-client">
              <Plus className="mr-2 h-4 w-4" />
              Enroll New Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border border-border/60 md:block" data-testid="admin-clients-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead className="text-right">Workspaces</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Assignments</TableHead>
                  <TableHead className="text-right">Enabled Sources</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((summary) => {
                  const links = buildClientManagementLinks(summary.client, summary.primaryWorkspace);
                  return (
                    <TableRow key={summary.client.id} data-testid={`row-admin-client-${summary.client.id}`}>
                      <TableCell>
                        <div className="font-medium">{summary.client.name}</div>
                        <div className="text-xs text-muted-foreground">{summary.client.organizationType || "n/a"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={lifecycleVariant(summary.client.lifecycleStatus)}>{summary.client.lifecycleStatus || "unknown"}</Badge>
                          <span className="text-xs text-muted-foreground">{summary.client.active ? "Active" : "Inactive"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(summary.workspaces.length)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(summary.tenantUserCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(summary.sourceAssignmentCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(summary.enabledSourceCount)}</TableCell>
                      <TableCell><Badge variant={readinessVariant(summary)}>{readinessLabel(summary)}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(summary.client.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setLocation(links.openClient)} data-testid={`button-open-client-${summary.client.id}`}>
                            Open Client
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLocation(links.manageUsers)} data-testid={`button-manage-client-users-${summary.client.id}`}>
                            Users
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLocation(links.manageSources)} data-testid={`button-manage-client-sources-${summary.client.id}`}>
                            Sources
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 gap-4 md:hidden" data-testid="admin-clients-mobile-list">
            {filtered.map((summary) => {
              const links = buildClientManagementLinks(summary.client, summary.primaryWorkspace);
              return (
                <Card key={summary.client.id} data-testid={`card-admin-client-${summary.client.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{summary.client.name}</CardTitle>
                        <CardDescription>{summary.client.organizationType || "n/a"}</CardDescription>
                      </div>
                      <Badge variant={lifecycleVariant(summary.client.lifecycleStatus)}>{summary.client.lifecycleStatus || "unknown"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <SummaryMetric label="Workspaces" value={formatCount(summary.workspaces.length)} icon={Building2} />
                      <SummaryMetric label="Users" value={formatCount(summary.tenantUserCount)} icon={Users} />
                      <SummaryMetric label="Assignments" value={formatCount(summary.sourceAssignmentCount)} icon={ListChecks} />
                      <SummaryMetric label="Enabled" value={formatCount(summary.enabledSourceCount)} icon={RadioTower} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Monitoring readiness</span>
                      <Badge variant={readinessVariant(summary)}>{readinessLabel(summary)}</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" onClick={() => setLocation(links.openClient)} data-testid={`button-open-client-mobile-${summary.client.id}`}>
                        Open Client
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="ghost" onClick={() => setLocation(links.manageUsers)} data-testid={`button-manage-client-users-mobile-${summary.client.id}`}>
                          <Users className="mr-2 h-4 w-4" />
                          Users
                        </Button>
                        <Button variant="ghost" onClick={() => setLocation(links.manageSources)} data-testid={`button-manage-client-sources-mobile-${summary.client.id}`}>
                          <Activity className="mr-2 h-4 w-4" />
                          Sources
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <Card className="border-dashed border-border/70" data-testid="admin-clients-no-filter-results">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No clients match the current filters.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
