import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { useLocation } from "wouter";

const KEYWORD_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

export default function KeywordAnalysis() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{
    topKeywords: { keyword: string; count: number; avgSentiment: number }[];
    keywordTimeline: { date: string; keyword: string; count: number }[];
  }>({
    queryKey: [`/api/analytics/keyword-analysis?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const timelineByDate = data?.keywordTimeline.reduce((acc, item) => {
    const existing = acc.find(a => a.date === item.date);
    if (existing) {
      existing[item.keyword] = item.count;
    } else {
      acc.push({ date: item.date, [item.keyword]: item.count });
    }
    return acc;
  }, [] as Record<string, any>[]) || [];

  const topKeywordsForChart = Array.from(new Set(data?.keywordTimeline.map(t => t.keyword) || []));

  const getSentimentColor = (score: number) => {
    if (score > 20) return '#22c55e';
    if (score < -20) return '#ef4444';
    return '#64748b';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-keyword-analysis-title">
          {t("analyticsPages.keywordAnalysis.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.keywordAnalysis.subtitle")}</p>
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
              <CardTitle className="font-display">{t("analyticsPages.keywordAnalysis.topKeywords")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {data?.topKeywords.map((kw, i) => {
                  const maxVal = data.topKeywords[0]?.count || 1;
                  const pct = Math.round((kw.count / maxVal) * 100);
                  return (
                    <button
                      key={kw.keyword}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer text-left"
                      data-testid={`keyword-item-${i}`}
                      onClick={() => setLocation(`/feed?search=${encodeURIComponent(kw.keyword)}`)}
                    >
                      <span className="w-28 text-sm font-medium truncate shrink-0">{kw.keyword}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{kw.count}</span>
                    </button>
                  );
                })}
                {(!data?.topKeywords || data.topKeywords.length === 0) && (
                  <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.keywordAnalysis.keywordTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineByDate.map(d => ({ ...d, dateLabel: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    {topKeywordsForChart.map((kw, i) => (
                      <Line key={kw} type="monotone" dataKey={kw} stroke={KEYWORD_COLORS[i % KEYWORD_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
