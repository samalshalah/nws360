import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { TimeRangeFilter, useTimeRange } from "@/components/analytics/TimeRangeFilter";
import { Badge } from "@/components/ui/badge";
import { FileText, TrendingUp, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CustomReports() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useTimeRange("7d");

  const { data: stats } = useQuery<{
    totalArticles: number;
    sourcesCount: number;
    sentimentDistribution: { name: string; value: number }[];
    trendingKeywords: { text: string; value: number }[];
  }>({
    queryKey: ["/api/analytics/stats"],
  });

  const { data: volume } = useQuery<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
  }>({
    queryKey: [`/api/analytics/content-volume?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const { data: sentiment } = useQuery<{
    overall: { positive: number; negative: number; neutral: number };
    bySource: any[];
    timeline: any[];
    byCategory: any[];
  }>({
    queryKey: [`/api/analytics/sentiment-reports?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`],
  });

  const totalInPeriod = volume?.timeline.reduce((s, t) => s + t.count, 0) || 0;
  const peakDay = volume?.timeline.length ? volume.timeline.reduce((a, b) => a.count > b.count ? a : b) : null;
  const topSource = volume?.bySource[0];

  const handleExport = () => {
    const report: string[] = [];
    report.push(`NWS360 Report`);
    report.push(`Period: ${new Date(timeRange.startDate).toLocaleDateString()} - ${new Date(timeRange.endDate).toLocaleDateString()}`);
    report.push(`Generated: ${new Date().toLocaleString()}`);
    report.push(``);
    report.push(`--- Summary ---`);
    report.push(`Total Articles: ${totalInPeriod}`);
    report.push(`Active Sources: ${volume?.bySource.length || 0}`);
    if (sentiment) {
      report.push(`Positive: ${sentiment.overall.positive}, Neutral: ${sentiment.overall.neutral}, Negative: ${sentiment.overall.negative}`);
    }
    report.push(``);
    if (topSource) {
      report.push(`Most Active Source: ${topSource.sourceName} (${topSource.count} articles)`);
    }
    if (peakDay) {
      report.push(`Peak Day: ${new Date(peakDay.date).toLocaleDateString()} (${peakDay.count} articles)`);
    }
    report.push(``);
    report.push(`--- Top Keywords ---`);
    stats?.trendingKeywords.slice(0, 10).forEach((kw, i) => {
      report.push(`${i + 1}. ${kw.text} (${kw.value})`);
    });
    report.push(``);
    report.push(`--- Daily Breakdown ---`);
    volume?.timeline.forEach(day => {
      report.push(`${day.date}: ${day.count} articles`);
    });

    const blob = new Blob([report.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nws360-report-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const rows: string[] = [];
    rows.push('Date,Articles');
    volume?.timeline.forEach(day => {
      rows.push(`${day.date},${day.count}`);
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nws360-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-custom-reports-title">
          {t("analyticsPages.customReports.title")}
        </h1>
        <p className="text-muted-foreground">{t("analyticsPages.customReports.subtitle")}</p>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleExport} data-testid="button-export-report">
          <Download className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
          {t("analyticsPages.customReports.exportText")}
        </Button>
        <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
          {t("analyticsPages.customReports.exportCSV")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-report-total">{totalInPeriod}</p>
                <p className="text-xs text-muted-foreground">{t("analyticsPages.customReports.totalArticles")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{topSource?.sourceName || "--"}</p>
                <p className="text-xs text-muted-foreground">{t("analyticsPages.customReports.topSource")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{volume?.peaks.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("analyticsPages.customReports.spikes")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">{t("analyticsPages.customReports.executiveSummary")}</CardTitle>
          <CardDescription>{t("analyticsPages.customReports.summaryDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <h3 className="text-sm font-semibold mb-2">{t("analyticsPages.customReports.periodOverview")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("analyticsPages.customReports.periodSummaryText", {
                  total: totalInPeriod,
                  sources: volume?.bySource.length || 0,
                  startDate: new Date(timeRange.startDate).toLocaleDateString(),
                  endDate: new Date(timeRange.endDate).toLocaleDateString(),
                })}
              </p>
            </div>

            {sentiment && (
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="text-sm font-semibold mb-2">{t("analyticsPages.customReports.sentimentOverview")}</h3>
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-500">{sentiment.overall.positive}</p>
                    <p className="text-xs text-muted-foreground">{t("feed.positive")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-500">{sentiment.overall.neutral}</p>
                    <p className="text-xs text-muted-foreground">{t("feed.neutral")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-500">{sentiment.overall.negative}</p>
                    <p className="text-xs text-muted-foreground">{t("feed.negative")}</p>
                  </div>
                </div>
              </div>
            )}

            {stats?.trendingKeywords && stats.trendingKeywords.length > 0 && (
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="text-sm font-semibold mb-2">{t("analyticsPages.customReports.topKeywords")}</h3>
                <div className="flex gap-2 flex-wrap">
                  {stats.trendingKeywords.slice(0, 10).map(kw => (
                    <Badge key={kw.text} variant="secondary">{kw.text} ({kw.value})</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
