import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Webhook,
  MessageSquare,
  Code,
  Download,
  Upload,
  Key,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";

interface MonitoringData {
  webhooks: { total: number; active: number };
  deliveries: { total: number; successful: number; failed: number; recentFailures: number };
  communication: { total: number; active: number; platforms: Record<string, number> };
  embeds: { total: number; active: number };
  exports: { total: number; recent: number };
  importConnectors: { total: number; active: number };
  apiKeys: { total: number; active: number };
  recentDeliveries: any[];
}

function StatCard({ title, value, subtitle, icon: Icon, status }: { title: string; value: number; subtitle?: string; icon: any; status?: "healthy" | "warning" | "error" }) {
  return (
    <Card data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold" data-testid={`text-stat-value-${title.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${status === "error" ? "bg-destructive/10" : status === "warning" ? "bg-orange-500/10 dark:bg-orange-400/10" : "bg-muted"}`}>
            <Icon className={`w-5 h-5 ${status === "error" ? "text-destructive" : status === "warning" ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntegrationMonitoring() {
  const { data, isLoading } = useQuery<MonitoringData>({
    queryKey: ["/api/admin/integration-monitoring"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="page-integration-monitoring">
        <h1 className="text-2xl font-bold tracking-tight">Integration Monitoring</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-muted-foreground">No monitoring data available</div>;

  const deliveryHealth = data.deliveries.recentFailures > 5 ? "error" : data.deliveries.recentFailures > 0 ? "warning" : "healthy";

  return (
    <div className="space-y-6" data-testid="page-integration-monitoring">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-monitoring-title">Integration Monitoring</h1>
        <p className="text-muted-foreground mt-1">System-wide view of all external integrations and their health</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Webhooks" value={data.webhooks.active} subtitle={`${data.webhooks.total} total`} icon={Webhook} />
        <StatCard title="Deliveries" value={data.deliveries.successful} subtitle={`${data.deliveries.failed} failed`} icon={Check} status={deliveryHealth} />
        <StatCard title="Channels" value={data.communication.active} subtitle={`${data.communication.total} configured`} icon={MessageSquare} />
        <StatCard title="Embed Widgets" value={data.embeds.active} subtitle={`${data.embeds.total} total`} icon={Code} />
        <StatCard title="Exports (7d)" value={data.exports.recent} subtitle={`${data.exports.total} all time`} icon={Download} />
        <StatCard title="Importers" value={data.importConnectors.active} subtitle={`${data.importConnectors.total} total`} icon={Upload} />
        <StatCard title="API Keys" value={data.apiKeys.active} subtitle={`${data.apiKeys.total} total`} icon={Key} />
        <StatCard title="Recent Failures" value={data.deliveries.recentFailures} subtitle="Last 24h" icon={AlertTriangle} status={deliveryHealth} />
      </div>

      {data.communication.platforms && Object.keys(data.communication.platforms).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Communication Platforms</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(data.communication.platforms).map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-2" data-testid={`text-platform-${platform}`}>
                  <Badge variant="outline" className="capitalize">{platform}</Badge>
                  <span className="text-sm text-muted-foreground">{count} channel{count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Webhook Deliveries</CardTitle></CardHeader>
        <CardContent>
          {data.recentDeliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deliveries recorded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentDeliveries.map((d: any) => (
                  <TableRow key={d.id} data-testid={`row-delivery-${d.id}`}>
                    <TableCell data-testid={`text-delivery-event-${d.id}`}>
                      <Badge variant="outline" className="text-xs">{d.eventType?.replace(/_/g, " ") || "—"}</Badge>
                    </TableCell>
                    <TableCell data-testid={`text-delivery-status-${d.id}`}>
                      {d.success ? (
                        <Badge variant="default" className="gap-1"><Check className="w-3 h-3" />Success</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1"><X className="w-3 h-3" />Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-delivery-code-${d.id}`}>{d.statusCode || "—"}</TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-delivery-attempts-${d.id}`}>{d.attempts || 1}</TableCell>
                    <TableCell className="text-muted-foreground text-xs" data-testid={`text-delivery-time-${d.id}`}>
                      {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
