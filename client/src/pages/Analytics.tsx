import { useAnalytics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

const COLORS = ['#22c55e', '#64748b', '#ef4444'];

export default function Analytics() {
  const { data: analytics, isLoading } = useAnalytics();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const sentimentData = analytics?.sentimentDistribution.map(item => ({
    name: item.name === "positive" ? t("feed.positive") : item.name === "negative" ? t("feed.negative") : t("feed.neutral"),
    value: item.value
  }));

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
            <div className="h-[300px] w-full">
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
                  >
                    {sentimentData?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
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
                    const pos = kw.positive || 0;
                    const neg = kw.negative || 0;
                    const neu = kw.neutral || 0;
                    const total = pos + neg + neu || 1;
                    const posPct = (pos / total) * 100;
                    const negPct = (neg / total) * 100;
                    const neuPct = (neu / total) * 100;
                    return (
                      <button
                        key={kw.text}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer text-left"
                        data-testid={`keyword-bar-${index}`}
                        onClick={() => setLocation(`/feed?search=${encodeURIComponent(kw.text)}`)}
                        title={`${kw.text}: ${pos} positive, ${neu} neutral, ${neg} negative`}
                      >
                        <span className="w-24 text-sm font-medium truncate shrink-0">{kw.text}</span>
                        <div className="flex-1 h-6">
                          <div className="h-full rounded-sm overflow-hidden flex" style={{ width: `${pct}%` }}>
                            {pos > 0 && (
                              <div className="h-full bg-emerald-500" style={{ width: `${posPct}%` }} />
                            )}
                            {neu > 0 && (
                              <div className="h-full bg-slate-400" style={{ width: `${neuPct}%` }} />
                            )}
                            {neg > 0 && (
                              <div className="h-full bg-red-500" style={{ width: `${negPct}%` }} />
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{kw.value}</span>
                      </button>
                    );
                  })}
                  <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> {t("feed.positive")}</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" /> {t("feed.neutral")}</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> {t("feed.negative")}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
