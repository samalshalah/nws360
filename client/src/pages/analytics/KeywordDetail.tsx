import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Search, ExternalLink } from "lucide-react";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

export default function KeywordDetail() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data: topicsData, isLoading: topicsLoading } = useQuery<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: any[];
    byCategory: any[];
  }>({
    queryKey: ["/api/analytics/trending-topics", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const { data, isLoading } = useQuery<{
    keyword: string;
    frequency: { date: string; count: number }[];
    topSources: { sourceName: string; count: number }[];
    sentiment: { positive: number; negative: number; neutral: number };
    headlines: { title: string; url: string; sourceName: string; publishedAt: string; sentiment: string }[];
  }>({
    queryKey: ["/api/analytics/keyword-detail", `?keyword=${encodeURIComponent(keyword)}&startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
    enabled: !!keyword,
  });

  const suggestedKeywords = topicsData?.topics.slice(0, 12) || [];

  const sentimentPie = data ? [
    { name: t("feed.positive"), value: data.sentiment.positive, key: "positive" },
    { name: t("feed.neutral"), value: data.sentiment.neutral, key: "neutral" },
    { name: t("feed.negative"), value: data.sentiment.negative, key: "negative" },
  ].filter(d => d.value > 0) : [];

  const handleSearch = () => {
    if (searchInput.trim()) {
      setKeyword(searchInput.trim());
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-keyword-detail-title">
          {t("analytics.keywordDetail")}
        </h1>
        <p className="text-muted-foreground">Deep dive into any keyword or topic with frequency, sources, and sentiment.</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Enter a keyword to analyze..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            className="pl-9"
            data-testid="input-keyword-search"
          />
        </div>
        <Button onClick={handleSearch} data-testid="button-keyword-search">
          Analyze
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {topicsLoading ? (
          [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-20 rounded-md" />)
        ) : suggestedKeywords.length > 0 ? suggestedKeywords.map((kw, i) => (
          <Button
            key={kw.topic}
            variant={keyword === kw.topic ? "default" : "secondary"}
            size="sm"
            onClick={() => { setKeyword(kw.topic); setSearchInput(kw.topic); }}
            data-testid={`keyword-suggest-${i}`}
          >
            {kw.topic}
          </Button>
        )) : null}
      </div>

      {keyword && isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      )}

      {keyword && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">{t("analytics.keywordFrequency")}</CardTitle>
              <CardDescription>"{keyword}" mentions over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                {data.frequency.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.frequency.map(d => ({ ...d, dateLabel: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}>
                      <defs>
                        <linearGradient id="gradKw" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Area type="monotone" dataKey="count" name="Mentions" stroke="hsl(var(--primary))" fill="url(#gradKw)" strokeWidth={2} />
                    </AreaChart>
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
            <CardHeader>
              <CardTitle className="font-display text-base">{t("analytics.keywordSentiment")}</CardTitle>
              <CardDescription>Sentiment of articles mentioning "{keyword}"</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                {sentimentPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={5} dataKey="value" nameKey="name">
                        {sentimentPie.map(entry => (
                          <Cell key={entry.key} fill={SENTIMENT_COLORS[entry.key]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
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
            <CardHeader>
              <CardTitle className="font-display text-base">{t("analytics.keywordSources")}</CardTitle>
              <CardDescription>Sources most frequently mentioning "{keyword}"</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topSources.length > 0 ? data.topSources.map((source, i) => {
                  const maxCount = data.topSources[0]?.count || 1;
                  const pct = Math.round((source.count / maxCount) * 100);
                  return (
                    <div key={source.sourceName} className="flex items-center gap-3" data-testid={`kw-source-${i}`}>
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="w-28 text-sm font-medium truncate shrink-0">{source.sourceName}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary rounded-sm transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{source.count}</span>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">{t("analytics.keywordHeadlines")}</CardTitle>
              <CardDescription>Recent articles mentioning "{keyword}"</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {data.headlines.length > 0 ? data.headlines.map((headline, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50" data-testid={`kw-headline-${i}`}>
                    <span
                      className="w-2 h-2 rounded-full mt-2 shrink-0"
                      style={{ backgroundColor: SENTIMENT_COLORS[headline.sentiment] || SENTIMENT_COLORS.neutral }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{headline.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{headline.sourceName}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(headline.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    {headline.url && (
                      <a href={headline.url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded-md hover-elevate">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">{t("analytics.noData")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
