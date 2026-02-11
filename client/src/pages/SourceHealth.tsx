import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface SourceHealthData {
  sourceId: number;
  sourceName: string;
  lastStatus: string;
  lastError: string | null;
  successRate: number;
  totalFetches: number;
  lastFetchedAt: string | null;
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  if (status === "success") {
    return (
      <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400" data-testid="badge-status-success">
        <Activity className="w-3 h-3 mr-1" />
        {t("sourceHealth.healthy")}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="secondary" className="bg-red-500/15 text-red-600 dark:text-red-400" data-testid="badge-status-error">
        <AlertTriangle className="w-3 h-3 mr-1" />
        {t("sourceHealth.error")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground" data-testid="badge-status-unknown">
      <Clock className="w-3 h-3 mr-1" />
      {t("sourceHealth.unknown")}
    </Badge>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />;
  }
  if (status === "error") {
    return <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />;
  }
  return <Clock className="w-5 h-5 text-muted-foreground" />;
}

function ErrorMessage({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = message.length > 80;

  if (!truncated) {
    return <p className="text-xs text-red-600 dark:text-red-400 mt-1">{message}</p>;
  }

  if (expanded) {
    return (
      <button
        onClick={() => setExpanded(false)}
        className="text-xs text-red-600 dark:text-red-400 mt-1 text-left cursor-pointer"
        data-testid="button-collapse-error"
      >
        {message}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-red-600 dark:text-red-400 mt-1 text-left truncate max-w-full block cursor-pointer"
          data-testid="button-expand-error"
        >
          {message.slice(0, 80)}...
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <p className="text-xs">{message}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-wrap">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function SourceHealth() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<SourceHealthData[]>({
    queryKey: ["/api/source-health"],
  });

  const healthy = data?.filter((s) => s.lastStatus === "success").length ?? 0;
  const errors = data?.filter((s) => s.lastStatus === "error").length ?? 0;
  const unknown = data?.filter((s) => s.lastStatus !== "success" && s.lastStatus !== "error").length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-source-health-title">
          {t("sourceHealth.title")}
        </h1>
        <p className="text-muted-foreground">{t("sourceHealth.subtitle")}</p>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="flex gap-3 flex-wrap">
            <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400" data-testid="badge-summary-healthy">
              <Activity className="w-3 h-3 mr-1" />
              {healthy} {t("sourceHealth.healthy")}
            </Badge>
            <Badge variant="secondary" className="bg-red-500/15 text-red-600 dark:text-red-400" data-testid="badge-summary-error">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {errors} {t("sourceHealth.error")}
            </Badge>
            <Badge variant="secondary" className="bg-muted text-muted-foreground" data-testid="badge-summary-unknown">
              <Clock className="w-3 h-3 mr-1" />
              {unknown} {t("sourceHealth.unknown")}
            </Badge>
          </div>

          {(!data || data.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("sourceHealth.noLogs")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map((source) => (
                <Card key={source.sourceId} className="overflow-visible" data-testid={`card-source-health-${source.sourceId}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon status={source.lastStatus} />
                      <CardTitle className="text-base truncate">{source.sourceName}</CardTitle>
                    </div>
                    <StatusBadge status={source.lastStatus} t={t} />
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("sourceHealth.successRate")}</span>
                        <span className="font-medium" data-testid={`text-success-rate-${source.sourceId}`}>
                          {Math.round(source.successRate)}%
                        </span>
                      </div>
                      <Progress value={source.successRate} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("sourceHealth.totalFetches")}</span>
                      <span className="font-medium" data-testid={`text-total-fetches-${source.sourceId}`}>
                        {source.totalFetches}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("admin.lastFetched")}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-last-fetched-${source.sourceId}`}>
                        {source.lastFetchedAt
                          ? formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true })
                          : t("common.never")}
                      </span>
                    </div>

                    {source.lastError && (
                      <div>
                        <span className="text-xs text-muted-foreground">{t("sourceHealth.lastError")}</span>
                        <ErrorMessage message={source.lastError} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
