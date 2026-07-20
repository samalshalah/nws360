import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Badge } from "@/components/ui/badge";

const TYPE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const SENTIMENT_COLORS: Record<string, string> = { positive: '#22c55e', neutral: '#64748b', negative: '#ef4444' };

export default function SourceBehavior() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data, isLoading } = useQuery<{
    sources: {
      sourceId: number;
      sourceName: string;
      sourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
      dominantSentiment: string;
      uniqueKeywords: number;
    }[];
    publishers?: {
      publisherName: string;
      collectorSourceName: string;
      collectorSourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
    }[];
    diversity: { sourceType: string; count: number }[];
  }>({
    queryKey: [`/api/analytics/source-behavior?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const topPublishers = (data?.publishers && data.publishers.length > 0
    ? data.publishers
    : (data?.sources || [])
        .filter(s => s.articleCount > 0)
        .map(s => ({
          publisherName: s.sourceName,
          collectorSourceName: s.sourceName,
          collectorSourceType: s.sourceType,
          articleCount: s.articleCount,
          avgArticlesPerDay: s.avgArticlesPerDay,
        }))
  ).filter(p => p.articleCount > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-source-behavior-title">
          {t("analyticsPages.sourceBehavior.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.sourceBehavior.subtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sourceBehavior.sourcePerformance")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.source")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.type")}</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.articles")}</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.avgPerDay")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.sentiment")}</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">{t("analyticsPages.sourceBehavior.keywords")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.sources.filter(s => s.articleCount > 0).map((source, i) => (
                      <tr key={source.sourceId} className="border-b border-border/50" data-testid={`source-row-${i}`}>
                        <td className="p-3 font-medium">{source.sourceName}</td>
                        <td className="p-3">
                          <Badge variant="secondary">{source.sourceType}</Badge>
                        </td>
                        <td className="p-3 text-right font-mono">{source.articleCount}</td>
                        <td className="p-3 text-right font-mono">{source.avgArticlesPerDay}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SENTIMENT_COLORS[source.dominantSentiment] || '#64748b' }} />
                            <span className="capitalize text-xs">{source.dominantSentiment}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">{source.uniqueKeywords}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!data?.sources || data.sources.filter(s => s.articleCount > 0).length === 0) && (
                  <p className="text-muted-foreground text-sm text-center py-8">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sourceBehavior.sourceDiversity")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.diversity} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" nameKey="sourceType">
                      {data?.diversity.map((_, i) => (
                        <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sourceBehavior.topPublishers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPublishers.slice(0, 10).map((publisher, i) => {
                  const maxCount = topPublishers[0]?.articleCount || 1;
                  const pct = Math.round((publisher.articleCount / maxCount) * 100);
                  return (
                    <div key={`${publisher.publisherName}-${publisher.collectorSourceName}`} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="w-28 shrink-0">
                        <p className="truncate text-sm font-medium">{publisher.publisherName}</p>
                        {publisher.publisherName !== publisher.collectorSourceName ? (
                          <p className="truncate text-[10px] text-muted-foreground">
                            {t("common.via")} {publisher.collectorSourceName}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary rounded-sm transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{publisher.avgArticlesPerDay}/day</span>
                    </div>
                  );
                })}
                {topPublishers.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
