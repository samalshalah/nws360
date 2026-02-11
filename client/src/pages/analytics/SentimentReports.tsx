import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

export default function SentimentReports() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data, isLoading } = useQuery<{
    overall: { positive: number; negative: number; neutral: number };
    bySource: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number }[];
    timeline: { date: string; positive: number; negative: number; neutral: number }[];
    byCategory: { category: string; positive: number; negative: number; neutral: number }[];
  }>({
    queryKey: ["/api/analytics/sentiment-reports", `?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const overallPieData = data ? [
    { name: t("feed.positive"), value: data.overall.positive, key: "positive" },
    { name: t("feed.neutral"), value: data.overall.neutral, key: "neutral" },
    { name: t("feed.negative"), value: data.overall.negative, key: "negative" },
  ] : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-sentiment-reports-title">
          {t("analyticsPages.sentimentReports.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.sentimentReports.subtitle")}</p>
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
              <CardTitle className="font-display">{t("analyticsPages.sentimentReports.overallSentiment")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overallPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" nameKey="name">
                      {overallPieData.map((entry) => (
                        <Cell key={entry.key} fill={SENTIMENT_COLORS[entry.key]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-2">
                {overallPieData.map(entry => (
                  <div key={entry.key} className="text-center">
                    <p className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS[entry.key] }}>{entry.value}</p>
                    <p className="text-xs text-muted-foreground">{entry.name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sentimentReports.sentimentTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.timeline.map(t => ({ ...t, dateLabel: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}>
                    <defs>
                      <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradNeu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="positive" name={t("feed.positive")} stroke="#22c55e" fill="url(#gradPos)" strokeWidth={2} />
                    <Area type="monotone" dataKey="negative" name={t("feed.negative")} stroke="#ef4444" fill="url(#gradNeg)" strokeWidth={2} />
                    <Area type="monotone" dataKey="neutral" name={t("feed.neutral")} stroke="#64748b" fill="url(#gradNeu)" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sentimentReports.sentimentBySource")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.bySource} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis dataKey="sourceName" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="positive" name={t("feed.positive")} stackId="a" fill="#22c55e" />
                    <Bar dataKey="neutral" name={t("feed.neutral")} stackId="a" fill="#64748b" />
                    <Bar dataKey="negative" name={t("feed.negative")} stackId="a" fill="#ef4444" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display">{t("analyticsPages.sentimentReports.sentimentByCategory")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="positive" name={t("feed.positive")} stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="neutral" name={t("feed.neutral")} stackId="a" fill="#64748b" />
                    <Bar dataKey="negative" name={t("feed.negative")} stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Legend />
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
