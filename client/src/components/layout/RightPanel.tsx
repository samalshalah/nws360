import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAnalytics } from "@/hooks/use-analytics";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Newspaper, Rss } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { UpdatedAt } from "@/components/UpdatedAt";

export function RightPanel() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: analytics, isLoading, dataUpdatedAt } = useAnalytics();

  const { data: sentimentTrend } = useQuery<{ date: string; positive: number; negative: number; neutral: number }[]>({
    queryKey: ["/api/analytics/sentiment-trend"],
  });

  const trendingTopics = (analytics?.trendingKeywords || []).slice(0, 5);

  const volumeData = sentimentTrend
    ? sentimentTrend.slice(-24).map((d) => ({
        date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        total: d.positive + d.negative + d.neutral,
      }))
    : [];

  const topSources = (analytics as any)?.topSources?.slice(0, 3) || [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-6">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="right-panel-header">
          {t("rightPanel.insights")}
        </h2>
        <UpdatedAt timestamp={dataUpdatedAt ? new Date(dataUpdatedAt) : null} className="text-[10px]" prefix="" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <TrendingUp className="w-3.5 h-3.5" />
          {t("rightPanel.trendingTopics")}
        </div>
        {trendingTopics.length > 0 ? (
          <div className="space-y-0.5">
            {trendingTopics.map((topic: { text: string; value: number }, index: number) => (
              <button
                key={topic.text}
                data-testid={`right-panel-trending-${index}`}
                onClick={() => setLocation(`/feed?search=${encodeURIComponent(topic.text)}`)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md hover-elevate transition-colors text-left"
              >
                <span className="truncate text-foreground">{topic.text}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {topic.value}
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("analytics.noData")}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Newspaper className="w-3.5 h-3.5" />
            {t("rightPanel.newsVolume")}
          </div>
          <span className="text-[10px] text-muted-foreground">{t("rightPanel.last24h")}</span>
        </div>
        {volumeData.length > 0 ? (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  fill="url(#volumeGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("analytics.noData")}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Rss className="w-3.5 h-3.5" />
          {t("rightPanel.topSources")}
        </div>
        {topSources.length > 0 ? (
          <div className="space-y-0.5">
            {topSources.map((source: { name: string; count: number }, index: number) => (
              <button
                key={source.name}
                data-testid={`right-panel-source-${index}`}
                onClick={() => setLocation(`/feed?search=${encodeURIComponent(source.name)}`)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md hover-elevate transition-colors text-left"
              >
                <span className="truncate text-foreground">{source.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {source.count} {t("rightPanel.articles")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("analytics.noData")}</p>
        )}
      </div>
    </div>
  );
}
