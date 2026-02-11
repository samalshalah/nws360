import { useQuery } from "@tanstack/react-query";
import { useAnalytics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

export default function Analytics() {
  const { data: analytics, isLoading } = useAnalytics();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: sentimentTrend, isLoading: isTrendLoading } = useQuery<{ date: string; positive: number; negative: number; neutral: number }[]>({
    queryKey: ["/api/analytics/sentiment-trend"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const sentimentOrder = ["positive", "neutral", "negative"];
  const sentimentData = sentimentOrder.map(key => {
    const found = analytics?.sentimentDistribution.find(item => item.name === key);
    return {
      name: key,
      label: key === "positive" ? t("feed.positive") : key === "negative" ? t("feed.negative") : t("feed.neutral"),
      value: found?.value || 0,
    };
  });

  const trendFormatted = sentimentTrend?.map(item => ({
    ...item,
    dateLabel: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  })) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-analytics-title">{t("analytics.title")}</h1>
        <p className="text-muted-foreground">{t("analytics.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="font-display">{t("analytics.sentimentDistribution")}</CardTitle>
            <CardDescription>{t("analytics.sentimentDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
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
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {sentimentData.map((entry) => (
                <button
                  key={entry.name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover-elevate cursor-pointer text-sm"
                  data-testid={`sentiment-btn-${entry.name}`}
                  onClick={() => setLocation(`/feed?sentiment=${entry.name}`)}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SENTIMENT_COLORS[entry.name] }} />
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-muted-foreground">({entry.value})</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="font-display">{t("analytics.trendingKeywords")}</CardTitle>
            <CardDescription>{t("analytics.trendingDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full overflow-y-auto">
              {analytics?.trendingKeywords && analytics.trendingKeywords.length > 0 ? (
                <div className="space-y-2">
                  {analytics.trendingKeywords.map((kw: any, index: number) => {
                    const maxVal = analytics.trendingKeywords[0]?.value || 1;
                    const pct = Math.round((kw.value / maxVal) * 100);
                    return (
                      <button
                        key={kw.text}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer text-left"
                        data-testid={`keyword-bar-${index}`}
                        onClick={() => setLocation(`/feed?search=${encodeURIComponent(kw.text)}`)}
                      >
                        <span className="w-24 text-sm font-medium truncate shrink-0">{kw.text}</span>
                        <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-sm transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{kw.value}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="font-display">{t("analytics.sentimentTrend")}</CardTitle>
          <CardDescription>{t("analytics.sentimentTrendDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isTrendLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trendFormatted.length > 0 ? (
            <div className="h-[300px] w-full">
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
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
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
