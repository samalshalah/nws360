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
            <div style={{ maxHeight: '300px', overflowY: 'auto', width: '100%' }}>
              {analytics?.trendingKeywords && analytics.trendingKeywords.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analytics.trendingKeywords.map((kw: any, index: number) => {
                    const maxVal = analytics.trendingKeywords[0]?.value || 1;
                    const widthPct = Math.max(10, Math.round((kw.value / maxVal) * 100));
                    const pos = kw.positive || 0;
                    const neg = kw.negative || 0;
                    const neu = kw.neutral || 0;
                    const total = pos + neg + neu || 1;
                    return (
                      <div
                        key={kw.text}
                        data-testid={`keyword-bar-${index}`}
                        onClick={() => setLocation(`/feed?search=${encodeURIComponent(kw.text)}`)}
                        title={`${kw.text}: ${pos} positive, ${neu} neutral, ${neg} negative`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        className="hover:bg-muted/50"
                      >
                        <span style={{ width: '90px', fontSize: '13px', fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {kw.text}
                        </span>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <div style={{
                            display: 'flex',
                            height: '22px',
                            width: `${widthPct}%`,
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}>
                            {pos > 0 && (
                              <div style={{
                                width: `${(pos / total) * 100}%`,
                                height: '100%',
                                backgroundColor: '#22c55e',
                              }} />
                            )}
                            {neu > 0 && (
                              <div style={{
                                width: `${(neu / total) * 100}%`,
                                height: '100%',
                                backgroundColor: '#94a3b8',
                              }} />
                            )}
                            {neg > 0 && (
                              <div style={{
                                width: `${(neg / total) * 100}%`,
                                height: '100%',
                                backgroundColor: '#ef4444',
                              }} />
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', color: '#94a3b8', width: '30px', textAlign: 'right', flexShrink: 0 }}>
                          {kw.value}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', paddingTop: '8px', fontSize: '12px' }} className="text-muted-foreground">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#22c55e', display: 'inline-block' }} />
                      {t("feed.positive")}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#94a3b8', display: 'inline-block' }} />
                      {t("feed.neutral")}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#ef4444', display: 'inline-block' }} />
                      {t("feed.negative")}
                    </span>
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
