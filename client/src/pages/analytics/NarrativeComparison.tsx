import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

export default function NarrativeComparison() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");
  const { data: topicsData, isLoading: topicsLoading } = useQuery<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: any[];
    byCategory: any[];
  }>({
    queryKey: [`/api/analytics/trending-topics?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const [selectedTopic, setSelectedTopic] = useState<string>("");

  const availableTopics = topicsData?.topics.slice(0, 20) || [];

  const { data: comparison, isLoading: comparisonLoading } = useQuery<{
    topic: string;
    sources: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number; total: number }[];
    hasContrast: boolean;
  }>({
    queryKey: [`/api/analytics/narrative-comparison?topic=${encodeURIComponent(selectedTopic)}&startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
    enabled: !!selectedTopic,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-narrative-comparison-title">
          {t("analytics.narrativeComparison")}
        </h1>
        <p className="text-muted-foreground">{t("analytics.narrativeComparisonSubtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">{t("analytics.selectTopic")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {topicsLoading ? (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-24 rounded-md" />)}
              </div>
            ) : availableTopics.length > 0 ? availableTopics.map((topic, i) => (
              <Button
                key={topic.topic}
                variant={selectedTopic === topic.topic ? "default" : "secondary"}
                size="sm"
                onClick={() => setSelectedTopic(topic.topic)}
                data-testid={`topic-select-${i}`}
              >
                {topic.topic} ({topic.count})
              </Button>
            )) : (
              <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedTopic && (
        <>
          {comparisonLoading ? (
            <div className="grid grid-cols-1 gap-6">
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          ) : comparison && comparison.sources.length > 0 ? (
            <>
              {comparison.hasContrast && (
                <Card className="border-amber-500/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{t("analytics.contrastingFraming")}</p>
                      <p className="text-xs text-muted-foreground">
                        Sources show significantly different sentiment distributions for "{selectedTopic}"
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!comparison.hasContrast && (
                <Card className="border-green-500/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <p className="text-sm">{t("analytics.noContrastDetected")}</p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">{t("analytics.sourceSentiment")}</CardTitle>
                  <CardDescription>
                    Sentiment breakdown for "{selectedTopic}" across top sources
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparison.sources.slice(0, 8)} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="sourceName" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="positive" name={t("feed.positive")} stackId="a" fill={SENTIMENT_COLORS.positive} />
                        <Bar dataKey="neutral" name={t("feed.neutral")} stackId="a" fill={SENTIMENT_COLORS.neutral} />
                        <Bar dataKey="negative" name={t("feed.negative")} stackId="a" fill={SENTIMENT_COLORS.negative} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">Source Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparison.sources.map((source, i) => {
                      const total = source.total || 1;
                      const posPct = Math.round((source.positive / total) * 100);
                      const neuPct = Math.round((source.neutral / total) * 100);
                      const negPct = Math.round((source.negative / total) * 100);
                      return (
                        <div key={source.sourceId} className="space-y-2" data-testid={`narrative-source-${i}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{source.sourceName}</span>
                            <span className="text-xs text-muted-foreground">{source.total} {t("analyticsPages.contentVolume.articles")}</span>
                          </div>
                          <div className="flex h-3 rounded-sm overflow-hidden">
                            <div style={{ width: `${posPct}%`, backgroundColor: SENTIMENT_COLORS.positive }} />
                            <div style={{ width: `${neuPct}%`, backgroundColor: SENTIMENT_COLORS.neutral }} />
                            <div style={{ width: `${negPct}%`, backgroundColor: SENTIMENT_COLORS.negative }} />
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>{posPct}% {t("feed.positive")}</span>
                            <span>{neuPct}% {t("feed.neutral")}</span>
                            <span>{negPct}% {t("feed.negative")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">{t("analytics.noData")}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
