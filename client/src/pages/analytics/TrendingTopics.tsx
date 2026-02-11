import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line, Legend, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

const TOPIC_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function TrendingTopics() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>({
    queryKey: ["/api/analytics/trending-topics", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const timelineByDate = data?.topicTimeline.reduce((acc, item) => {
    const existing = acc.find(a => a.date === item.date);
    if (existing) {
      existing[item.topic] = item.count;
    } else {
      acc.push({ date: item.date, [item.topic]: item.count });
    }
    return acc;
  }, [] as Record<string, any>[]) || [];

  const topTopics = Array.from(new Set(data?.topicTimeline.map(t => t.topic) || []));

  const SENTIMENT_COLORS: Record<string, string> = { positive: '#22c55e', neutral: '#64748b', negative: '#ef4444' };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-trending-topics-title">
          {t("analyticsPages.trendingTopics.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.trendingTopics.subtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.trendingTopics.topTopics")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {data?.topics.map((topic, i) => {
                  const maxVal = data.topics[0]?.count || 1;
                  const pct = Math.round((topic.count / maxVal) * 100);
                  return (
                    <button
                      key={topic.topic}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer text-left"
                      data-testid={`trending-topic-${i}`}
                      onClick={() => setLocation(`/feed?search=${encodeURIComponent(topic.topic)}`)}
                    >
                      <span className="w-28 text-sm font-medium truncate shrink-0">{topic.topic}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all"
                          style={{ width: `${pct}%`, backgroundColor: SENTIMENT_COLORS[topic.sentiment] || '#64748b' }}
                        />
                      </div>
                      <Badge variant="secondary" className="shrink-0">{topic.count}</Badge>
                    </button>
                  );
                })}
                {(!data?.topics || data.topics.length === 0) && (
                  <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.trendingTopics.topicTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineByDate.map(d => ({ ...d, dateLabel: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    {topTopics.map((topic, i) => (
                      <Line key={topic} type="monotone" dataKey={topic} stroke={TOPIC_COLORS[i % TOPIC_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.trendingTopics.byCategory")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" name={t("analyticsPages.contentVolume.articles")} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
