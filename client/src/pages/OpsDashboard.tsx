import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Shield, BarChart3, Database, FileText,
  RefreshCw, Plus, Trash2, Server, Clock,
  AlertTriangle, CheckCircle, XCircle, Info
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function TabInfo({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid="button-tab-info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="text-sm max-w-sm">
        {description}
      </PopoverContent>
    </Popover>
  );
}

interface StatusResponse {
  status: string;
  uptime: number;
  environment: string;
  components: Record<string, string>;
}

interface DatabaseStatus {
  status: string;
  latencyMs: number;
  tables: Record<string, number>;
}

interface QueueStatus {
  status: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

interface FeatureFlag {
  id: number;
  key: string;
  enabled: boolean;
  description: string | null;
}

interface UsageSummary {
  dailyActiveUsers: number;
  totalEvents: number;
  topEvents: { event: string; count: number }[];
  topEndpoints: { endpoint: string; count: number }[];
}

interface WorkersStatus {
  status: string;
  feedWorker: {
    lastRun: string | null;
    avgProcessingTimeMs: number | null;
    failedSources: number;
  };
  uptime: number;
}

interface DocSection {
  title?: string;
  [key: string]: any;
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "healthy" || s === "ok" || s === "connected") {
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20" data-testid={`badge-status-${s}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  }
  if (s === "degraded" || s === "warning") {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" data-testid={`badge-status-${s}`}>
        <AlertTriangle className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" data-testid={`badge-status-${s}`}>
      <XCircle className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function SystemHealthTab() {
  const { t } = useTranslation();

  const { data: status, isLoading: statusLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const { data: dbStatus, isLoading: dbLoading } = useQuery<DatabaseStatus>({
    queryKey: ["/api/status/database"],
    refetchInterval: 30000,
  });

  const { data: queueStatus, isLoading: queueLoading } = useQuery<QueueStatus>({
    queryKey: ["/api/status/queue"],
    refetchInterval: 30000,
  });

  if (statusLoading || dbLoading || queueLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Monitor the health of all platform components — database, API server, job queues, and feed workers. View uptime, latency, and component status at a glance." />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overall Status</p>
              <StatusBadge status={status?.status || "unknown"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="text-lg font-bold" data-testid="text-uptime">
                {status?.uptime ? formatUptime(status.uptime) : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Server className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Environment</p>
              <p className="text-lg font-bold" data-testid="text-environment">
                {status?.environment || "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.components && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Component Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(status.components).map(([name, value]) => (
                <div key={name} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0">
                  <span className="font-medium capitalize" data-testid={`text-component-${name}`}>{name}</span>
                  <StatusBadge status={typeof value === "string" ? value : (value as any)?.status || "unknown"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dbStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <StatusBadge status={dbStatus.status} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Latency</span>
                  <span className="font-mono text-sm" data-testid="text-db-latency">{dbStatus.latencyMs}ms</span>
                </div>
                {dbStatus.tables && (
                  <div className="space-y-1 pt-2 border-t">
                    <p className="text-sm font-medium mb-2">Table Counts</p>
                    {Object.entries(dbStatus.tables).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{table}</span>
                        <span className="font-mono" data-testid={`text-table-count-${table}`}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No database info available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queueStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Pending</span>
                  <Badge variant="secondary" data-testid="text-queue-pending">{queueStatus.pending}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Running</span>
                  <Badge variant="secondary" data-testid="text-queue-running">{queueStatus.running}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20" data-testid="text-queue-completed">{queueStatus.completed}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Failed</span>
                  <Badge variant="destructive" data-testid="text-queue-failed">{queueStatus.failed}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No queue info available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureFlagsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEnabled, setNewEnabled] = useState(false);

  const { data: flags, isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ["/api/admin/feature-flags"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (flag: FeatureFlag) => {
      await apiRequest("POST", "/api/admin/feature-flags", {
        key: flag.key,
        enabled: !flag.enabled,
        description: flag.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      toast({ title: "Flag updated" });
    },
    onError: (err: any) => {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/feature-flags", {
        key: newKey,
        enabled: newEnabled,
        description: newDesc || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      toast({ title: "Flag created" });
      setNewKey("");
      setNewDesc("");
      setNewEnabled(false);
    },
    onError: (err: any) => {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/feature-flags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      toast({ title: "Flag deleted" });
    },
    onError: (err: any) => {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Toggle platform features on and off without redeployment. Use feature flags to gradually roll out new capabilities or disable problematic features instantly." />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Feature Flag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
            <div className="space-y-1 flex-1 min-w-[150px]">
              <Label htmlFor="flag-key">Key</Label>
              <Input
                id="flag-key"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="feature_name"
                data-testid="input-flag-key"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[150px]">
              <Label htmlFor="flag-desc">Description</Label>
              <Input
                id="flag-desc"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional description"
                data-testid="input-flag-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newEnabled}
                onCheckedChange={setNewEnabled}
                data-testid="switch-flag-enabled"
              />
              <Label>Enabled</Label>
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newKey.trim() || createMutation.isPending}
              data-testid="button-create-flag"
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("Create")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {flags?.map(flag => (
          <Card key={flag.id} data-testid={`card-flag-${flag.id}`}>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <p className="font-medium font-mono text-sm" data-testid={`text-flag-key-${flag.id}`}>{flag.key}</p>
                {flag.description && (
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => toggleMutation.mutate(flag)}
                  disabled={toggleMutation.isPending}
                  data-testid={`switch-toggle-flag-${flag.id}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(flag.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-flag-${flag.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {flags?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No feature flags configured</p>
        )}
      </div>
    </div>
  );
}

function UsageMetricsTab() {
  const { data: usage, isLoading } = useQuery<UsageSummary>({
    queryKey: ["/api/admin/usage-summary?days=7"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  const maxEventCount = usage?.topEvents?.[0]?.count || 1;
  const maxEndpointCount = usage?.topEndpoints?.[0]?.count || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Track platform usage — daily active users, API calls, top endpoints, and event volumes. Understand how your team interacts with the platform." />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-daily-active-users">{usage?.dailyActiveUsers ?? 0}</p>
              <p className="text-sm text-muted-foreground">Daily Active Users (7d avg)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <BarChart3 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-events">{usage?.totalEvents ?? 0}</p>
              <p className="text-sm text-muted-foreground">Total Events (7d)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Events</CardTitle>
          </CardHeader>
          <CardContent>
            {usage?.topEvents && usage.topEvents.length > 0 ? (
              <div className="space-y-2">
                {usage.topEvents.map((evt, i) => (
                  <div key={evt.event} className="space-y-1" data-testid={`row-event-${i}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{evt.event}</span>
                      <span className="text-muted-foreground font-mono shrink-0">{evt.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-sm"
                        style={{ width: `${Math.round((evt.count / maxEventCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No events recorded</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {usage?.topEndpoints && usage.topEndpoints.length > 0 ? (
              <div className="space-y-2">
                {usage.topEndpoints.map((ep, i) => (
                  <div key={ep.endpoint} className="space-y-1" data-testid={`row-endpoint-${i}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-mono">{ep.endpoint}</span>
                      <span className="text-muted-foreground font-mono shrink-0">{ep.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-sm"
                        style={{ width: `${Math.round((ep.count / maxEndpointCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No endpoint data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecoveryBackupTab() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: workers } = useQuery<WorkersStatus>({
    queryKey: ["/api/status/workers"],
  });

  const retentionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/run-retention");
    },
    onSuccess: () => {
      toast({ title: "Data retention job triggered" });
    },
    onError: (err: any) => {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    },
  });

  const analyticsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/compute-analytics");
    },
    onSuccess: () => {
      toast({ title: "Analytics recomputation triggered" });
    },
    onError: (err: any) => {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Manage data backups and recovery procedures. Export system state, create restoration points, and recover from issues with minimal data loss." />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" />
              Neon PostgreSQL Backups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Automatic point-in-time recovery enabled by Neon</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Branching support for safe schema migrations</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>WAL-based continuous backup with configurable retention</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" />
              Replit Checkpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Automatic code snapshots on every deployment</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>One-click rollback to any previous checkpoint</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Git-based version history for all file changes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Auto-Pause Behavior
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm space-y-2">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Sources are automatically paused after 5 consecutive fetch failures</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Paused sources can be manually reactivated from the Admin Dashboard</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Failed source errors are logged for review in System Errors</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-sm text-muted-foreground">Currently failed sources:</span>
              <Badge variant="destructive" data-testid="text-failed-sources">
                {workers?.feedWorker?.failedSources ?? 0}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Manual Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Button
              onClick={() => retentionMutation.mutate()}
              disabled={retentionMutation.isPending}
              data-testid="button-run-retention"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${retentionMutation.isPending ? "animate-spin" : ""}`} />
              Run Data Retention
            </Button>
            <Button
              onClick={() => analyticsMutation.mutate()}
              disabled={analyticsMutation.isPending}
              variant="outline"
              data-testid="button-compute-analytics"
            >
              <BarChart3 className={`w-4 h-4 mr-1 ${analyticsMutation.isPending ? "animate-spin" : ""}`} />
              Recompute Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentationTab() {
  const { data: docs, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/admin/docs"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  if (!docs) {
    return <p className="text-sm text-muted-foreground">No documentation available</p>;
  }

  function renderValue(value: any, depth: number = 0): JSX.Element {
    if (typeof value === "string") {
      return <p className="text-sm">{value}</p>;
    }
    if (Array.isArray(value)) {
      return (
        <ul className="list-disc list-inside space-y-1 text-sm">
          {value.map((item, i) => (
            <li key={i}>
              {typeof item === "object" ? renderValue(item, depth + 1) : String(item)}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object" && value !== null) {
      return (
        <div className={`space-y-3 ${depth > 0 ? "pl-4 border-l-2 border-border" : ""}`}>
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <p className="font-medium text-sm capitalize">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</p>
              {renderValue(val, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    return <p className="text-sm">{String(value)}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Access system documentation including API references, configuration guides, and architecture overviews. Keep your team aligned on how the platform works." />
      </div>
      {Object.entries(docs).map(([section, content]) => (
        <Card key={section} data-testid={`card-doc-${section}`}>
          <CardHeader>
            <CardTitle className="text-base capitalize">
              {section.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderValue(content)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function OpsDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("health");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-ops-dashboard-title">
          Ops Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">System operations and monitoring center</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-ops-dashboard">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="health" data-testid="tab-health">
            <Activity className="w-4 h-4 mr-1" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="flags" data-testid="tab-flags">
            <Shield className="w-4 h-4 mr-1" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">
            <BarChart3 className="w-4 h-4 mr-1" />
            Usage Metrics
          </TabsTrigger>
          <TabsTrigger value="recovery" data-testid="tab-recovery">
            <Database className="w-4 h-4 mr-1" />
            Recovery & Backup
          </TabsTrigger>
          <TabsTrigger value="docs" data-testid="tab-docs">
            <FileText className="w-4 h-4 mr-1" />
            Documentation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <SystemHealthTab />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FeatureFlagsTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <UsageMetricsTab />
        </TabsContent>
        <TabsContent value="recovery" className="mt-4">
          <RecoveryBackupTab />
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <DocumentationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}