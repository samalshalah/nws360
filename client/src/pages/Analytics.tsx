import { useQuery } from "@tanstack/react-query";
import { useAnalytics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import {
  Newspaper, TrendingUp, BarChart3, AlertTriangle,
  ArrowRight, Flame, Zap
} from "lucide-react";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

const SOURCE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#ef4444', '#22c55e', '#f97316', '#6366f1', '#84cc16'];

export default function Analytics() {
  const { data: analytics, isLoading: statsLoading } = useAnalytics();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data: sentimentTrend, isLoading: trendLoading } = useQuery<{ date: string; positive: number; negative: number; neutral: number }[]>({
    queryKey: ["/api/analytics/sentiment-trend"],
  });

  const { data: volume, isLoading: volumeLoading } = useQuery<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
  }>({
    queryKey: ["/api/analytics/content-volume", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const { data: topics, isLoading: topicsLoading } = useQuery<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>({
    queryKey: ["/api/analytics/trending-topics", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const isLoading = statsLoading || volumeLoading;

  const sentimentOrder = ["positive", "neutral", "negative"];
  const sentimentData = sentimentOrder.map(key => {
    const found = analytics?.sentimentDistribution.find(item => item.name === key);
    return {
      name: key,
      label: key === "positive" ? t("feed.positive") : key === "negative" ? t("feed.negative") : t("feed.neutral"),
      value: found?.value || 0,
    };
  });

  const totalArticles = volume?.timeline.reduce((s, d) => s + d.count, 0) || 0;
  const totalSentiment = sentimentData.reduce((s, d) => s + d.value, 0) || 1;

  const volumeTimeline = volume?.timeline.map((d, i, arr) => {
    const prevCount = i > 0 ? arr[i - 1].count : d.count;
    const isSurge = prevCount > 0 && d.count >= prevCount * 2;
    return {
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isSurge,
    };
  }) || [];

  const surges = volumeTimeline.filter(d => d.isSurge);

  const trendFormatted = sentimentTrend?.map(item => ({
    ...item,
    dateLabel: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    total: item.positive + item.negative + item.neutral,
  })) || [];

  const topSources = volume?.bySource.slice(0, 8) || [];
  const topTopics = topics?.topics.slice(0, 10) || [];
  const maxTopicCount = topTopics[0]?.count || 1;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-80 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-analytics-title">
            {t("analytics.title")}
          </h1>
          <p className="text-muted-foreground">{t("analytics.subtitle")}</p>
        </div>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Newspaper className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-analytics-total">{totalArticles}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.totalArticles")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <BarChart3 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-analytics-sources">{analytics?.sourcesCount || 0}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.activeSources")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-analytics-topics">{topTopics.length}</p>
              <p className="text-xs text-muted-foreground">{t("analyticsPages.trendingTopics.topTopics")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Flame className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-analytics-surges">{surges.length}</p>
              <p className="text-xs text-muted-foreground">{t("analytics.informationSurges")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {surges.length > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">{t("analytics.informationSurges")}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {surges.map(s => (
                <Badge key={s.date} variant="secondary" className="text-xs">
                  <AlertTriangle className="w-3 h-3 ltr:mr-1 rtl:ml-1 text-amber-500" />
                  {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {s.count} {t("analyticsPages.contentVolume.articles")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-display text-base">{t("analytics.newsVolumeOverTime")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/analytics/content-volume")} data-testid="link-volume-detail">
              {t("analytics.viewDetails")} <ArrowRight className="w-3 h-3 ltr:ml-1 rtl:mr-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeTimeline}>
                  <defs>
                    <linearGradient id="gradVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="count" name={t("analyticsPages.contentVolume.articles")} stroke="hsl(var(--primary))" fill="url(#gradVol)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-display text-base">{t("analytics.topSourcesRanking")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/analytics/source-behavior")} data-testid="link-sources-detail">
              {t("analytics.viewDetails")} <ArrowRight className="w-3 h-3 ltr:ml-1 rtl:mr-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {topSources.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSources} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      dataKey="sourceName"
                      type="category"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" name={t("analyticsPages.contentVolume.articles")} radius={[0, 4, 4, 0]}>
                      {topSources.map((_, i) => (
                        <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-display text-base">{t("analytics.trendingKeywords")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/analytics/trending-topics")} data-testid="link-topics-detail">
              {t("analytics.viewDetails")} <ArrowRight className="w-3 h-3 ltr:ml-1 rtl:mr-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full overflow-y-auto">
              {topTopics.length > 0 ? (
                <div className="space-y-1.5">
                  {topTopics.map((topic, index) => {
                    const pct = Math.round((topic.count / maxTopicCount) * 100);
                    return (
                      <button
                        key={topic.topic}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer text-left"
                        data-testid={`analytics-topic-${index}`}
                        onClick={() => setLocation(`/feed?search=${encodeURIComponent(topic.topic)}`)}
                      >
                        <span className="w-24 text-sm font-medium truncate shrink-0">{topic.topic}</span>
                        <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: SENTIMENT_COLORS[topic.sentiment] || '#64748b'
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{topic.count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-display text-base">{t("analytics.sentimentDistribution")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/analytics/sentiment-reports")} data-testid="link-sentiment-detail">
              {t("analytics.viewDetails")} <ArrowRight className="w-3 h-3 ltr:ml-1 rtl:mr-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="label"
                  >
                    {sentimentData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SENTIMENT_COLORS[entry.name]}
                        className="cursor-pointer"
                        onClick={() => setLocation(`/feed?sentiment=${entry.name}`)}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-1">
              {sentimentData.map(entry => (
                <button
                  key={entry.name}
                  className="text-center cursor-pointer hover-elevate rounded-md px-3 py-1"
                  data-testid={`sentiment-pct-${entry.name}`}
                  onClick={() => setLocation(`/feed?sentiment=${entry.name}`)}
                >
                  <p className="text-lg font-bold" style={{ color: SENTIMENT_COLORS[entry.name] }}>
                    {Math.round((entry.value / totalSentiment) * 100)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">{entry.label}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="font-display text-base">{t("analytics.sentimentTrend")}</CardTitle>
            <CardDescription>{t("analytics.sentimentTrendDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : trendFormatted.length > 0 ? (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendFormatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="positive" name={t("feed.positive")} stroke="#22c55e" fill="url(#gradPositive)" strokeWidth={2} />
                  <Area type="monotone" dataKey="negative" name={t("feed.negative")} stroke="#ef4444" fill="url(#gradNegative)" strokeWidth={2} />
                  <Area type="monotone" dataKey="neutral" name={t("feed.neutral")} stroke="#64748b" fill="url(#gradNeutral)" strokeWidth={2} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
