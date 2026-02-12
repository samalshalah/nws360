import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, AreaChart, Area, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange, type TimeRange } from "@/components/analytics/TimeRangeFilter";
import { FileText, TrendingUp, Clock, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ContentVolume() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data, isLoading } = useQuery<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
  }>({
    queryKey: [`/api/analytics/content-volume?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const totalArticles = data?.timeline.reduce((s, t) => s + t.count, 0) || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-content-volume-title">
          {t("analyticsPages.contentVolume.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.contentVolume.subtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-articles">{totalArticles}</p>
                  <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.totalArticles")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-active-sources">{data?.bySource.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.activeSources")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-peak-hour">
                    {data?.byHour.length ? `${data.byHour.reduce((a, b) => a.count > b.count ? a : b).hour}:00` : "--"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.peakHour")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <Flame className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-peaks-count">{data?.peaks.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("analyticsPages.contentVolume.publishingPeaks")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">{t("analyticsPages.contentVolume.articlesOverTime")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.timeline.map(t => ({ ...t, dateLabel: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}>
                      <defs>
                        <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Area type="monotone" dataKey="count" name={t("analyticsPages.contentVolume.articles")} stroke="hsl(var(--primary))" fill="url(#gradVolume)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">{t("analyticsPages.contentVolume.mostActiveSources")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.bySource.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="sourceName" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="count" name={t("analyticsPages.contentVolume.articles")} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">{t("analyticsPages.contentVolume.activityByHour")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.byHour}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}:00`} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} labelFormatter={(h) => `${h}:00`} />
                      <Bar dataKey="count" name={t("analyticsPages.contentVolume.articles")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">{t("analyticsPages.contentVolume.publishingPeaks")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.peaks && data.peaks.length > 0 ? (
                  <div className="space-y-3">
                    {data.peaks.map((peak, i) => (
                      <div key={peak.date} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{i + 1}</Badge>
                          <span className="text-sm font-medium">{new Date(peak.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        </div>
                        <span className="font-bold text-primary">{peak.count} {t("analyticsPages.contentVolume.articles")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">{t("analytics.noData")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
