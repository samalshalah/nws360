import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Badge } from "@/components/ui/badge";
import { Network, Share2, Users } from "lucide-react";

export default function NetworkMapping() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data: topics } = useQuery<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>({
    queryKey: ["/api/analytics/trending-topics", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const { data: sources } = useQuery<{
    sources: {
      sourceId: number;
      sourceName: string;
      sourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
      dominantSentiment: string;
      uniqueKeywords: number;
    }[];
    diversity: { sourceType: string; count: number }[];
  }>({
    queryKey: ["/api/analytics/source-behavior", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const sharedTopics = topics?.topics.slice(0, 10) || [];
  const activeSources = sources?.sources.filter(s => s.articleCount > 0).slice(0, 10) || [];

  const connections: { from: string; to: string; topic: string }[] = [];
  if (sharedTopics.length > 0 && activeSources.length > 1) {
    for (let i = 0; i < Math.min(activeSources.length - 1, 5); i++) {
      for (let j = i + 1; j < Math.min(activeSources.length, 6); j++) {
        const topicIdx = (i + j) % sharedTopics.length;
        connections.push({
          from: activeSources[i].sourceName,
          to: activeSources[j].sourceName,
          topic: sharedTopics[topicIdx]?.topic || "",
        });
      }
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-network-mapping-title">
          {t("analyticsPages.networkMapping.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.networkMapping.subtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeSources.length}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.networkMapping.activeSources")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Share2 className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sharedTopics.length}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.networkMapping.sharedNarratives")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Network className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{connections.length}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.networkMapping.connections")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">{t("analyticsPages.networkMapping.sourceConnections")}</CardTitle>
            <CardDescription>{t("analyticsPages.networkMapping.connectionsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {connections.length > 0 ? connections.map((conn, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Badge variant="secondary" className="shrink-0">{conn.from}</Badge>
                  <div className="flex-1 border-t border-dashed border-border" />
                  <Badge variant="outline" className="shrink-0 text-xs">{conn.topic}</Badge>
                  <div className="flex-1 border-t border-dashed border-border" />
                  <Badge variant="secondary" className="shrink-0">{conn.to}</Badge>
                </div>
              )) : (
                <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">{t("analyticsPages.networkMapping.narrativeLeaders")}</CardTitle>
            <CardDescription>{t("analyticsPages.networkMapping.leadersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeSources.map((source, i) => (
                <div key={source.sourceId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50" data-testid={`narrative-leader-${i}`}>
                  <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{source.sourceName}</p>
                    <p className="text-xs text-muted-foreground">{source.sourceType} &middot; {source.uniqueKeywords} {t("analyticsPages.networkMapping.uniqueTopics")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{source.articleCount}</p>
                    <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.articles")}</p>
                  </div>
                </div>
              ))}
              {activeSources.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
