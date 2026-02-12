import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Newspaper, TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Zap, ExternalLink, Download } from "lucide-react";
import { useLocation } from "wouter";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#ef4444',
};

export default function DailyBrief() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = new Date().toISOString().split("T")[0];

  const { data, isLoading } = useQuery<{
    date: string;
    topStories: { title: string; url: string; sourceName: string; sentiment: string }[];
    biggestTopic: string;
    sentimentShift: {
      previous: { positive: number; negative: number; neutral: number };
      current: { positive: number; negative: number; neutral: number };
    };
    sourceSpike: { sourceName: string; count: number; avgCount: number } | null;
  }>({
    queryKey: [`/api/analytics/daily-brief?date=${today}`],
  });

  const handleDownload = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`NWS360 Daily Intelligence Brief`);
    lines.push(`Date: ${new Date(data.date).toLocaleDateString()}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(``);
    lines.push(`--- Top Stories ---`);
    data.topStories.forEach((story, i) => {
      lines.push(`${i + 1}. [${story.sentiment.toUpperCase()}] ${story.title}`);
      lines.push(`   Source: ${story.sourceName}`);
      lines.push(`   URL: ${story.url}`);
    });
    lines.push(``);
    lines.push(`--- Biggest Topic ---`);
    lines.push(data.biggestTopic || "N/A");
    lines.push(``);
    lines.push(`--- Sentiment Today ---`);
    lines.push(`Positive: ${data.sentimentShift.current.positive} (was ${data.sentimentShift.previous.positive})`);
    lines.push(`Neutral: ${data.sentimentShift.current.neutral} (was ${data.sentimentShift.previous.neutral})`);
    lines.push(`Negative: ${data.sentimentShift.current.negative} (was ${data.sentimentShift.previous.negative})`);
    if (data.sourceSpike) {
      lines.push(``);
      lines.push(`--- Source Spike ---`);
      lines.push(`${data.sourceSpike.sourceName}: ${data.sourceSpike.count} articles (avg: ${data.sourceSpike.avgCount})`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nws360-daily-brief-${data.date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-60 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data || data.topStories.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-daily-brief-title">
            {t("analytics.dailyBrief")}
          </h1>
          <p className="text-muted-foreground">{t("analytics.dailyBriefDescription")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{t("analytics.noBriefYet")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const prevTotal = data.sentimentShift.previous.positive + data.sentimentShift.previous.negative + data.sentimentShift.previous.neutral || 1;
  const currTotal = data.sentimentShift.current.positive + data.sentimentShift.current.negative + data.sentimentShift.current.neutral || 1;
  const prevPosPct = Math.round((data.sentimentShift.previous.positive / prevTotal) * 100);
  const currPosPct = Math.round((data.sentimentShift.current.positive / currTotal) * 100);
  const posShift = currPosPct - prevPosPct;

  const prevNegPct = Math.round((data.sentimentShift.previous.negative / prevTotal) * 100);
  const currNegPct = Math.round((data.sentimentShift.current.negative / currTotal) * 100);
  const negShift = currNegPct - prevNegPct;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-daily-brief-title">
            {t("analytics.dailyBrief")}
          </h1>
          <p className="text-muted-foreground">{t("analytics.dailyBriefDescription")}</p>
        </div>
        <Button onClick={handleDownload} data-testid="button-download-brief">
          <Download className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
          Download Brief
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("analytics.generatedAt")} {new Date().toLocaleString()} &middot; {new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-biggest-topic">{data.biggestTopic || "--"}</p>
              <p className="text-xs text-muted-foreground">{t("analytics.biggestTopic")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              {posShift > 0 ? <ArrowUpRight className="w-5 h-5 text-green-500" /> :
               posShift < 0 ? <ArrowDownRight className="w-5 h-5 text-red-500" /> :
               <Minus className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-sentiment-shift">
                {posShift > 0 ? `+${posShift}%` : `${posShift}%`} positive
              </p>
              <p className="text-xs text-muted-foreground">{t("analytics.sentimentShift")} vs yesterday</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              {data.sourceSpike ? (
                <>
                  <p className="text-lg font-bold" data-testid="text-source-spike">{data.sourceSpike.sourceName}</p>
                  <p className="text-xs text-muted-foreground">{t("analytics.sourceSpike")}: {data.sourceSpike.count} articles</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold">--</p>
                  <p className="text-xs text-muted-foreground">{t("analytics.sourceSpike")}</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">{t("analytics.topStories")}</CardTitle>
          <CardDescription>{new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.topStories.map((story, i) => (
              <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-muted/50" data-testid={`brief-story-${i}`}>
                <span className="text-lg font-bold text-muted-foreground w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug">{story.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{story.sourceName}</Badge>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: SENTIMENT_COLORS[story.sentiment] || SENTIMENT_COLORS.neutral }}
                    />
                    <span className="text-xs text-muted-foreground capitalize">{story.sentiment}</span>
                  </div>
                </div>
                {story.url && (
                  <a
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-md hover-elevate"
                    data-testid={`brief-story-link-${i}`}
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">{t("analytics.sentimentShift")}</CardTitle>
          <CardDescription>Comparing today vs yesterday</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            {(["positive", "negative", "neutral"] as const).map(key => {
              const prev = data.sentimentShift.previous[key];
              const curr = data.sentimentShift.current[key];
              const diff = curr - prev;
              return (
                <div key={key} className="text-center space-y-2">
                  <p className="text-xs uppercase text-muted-foreground capitalize">{t(`feed.${key}`)}</p>
                  <p className="text-3xl font-bold" style={{ color: SENTIMENT_COLORS[key] }}>{curr}</p>
                  <div className="flex items-center justify-center gap-1">
                    {diff > 0 ? <ArrowUpRight className="w-3 h-3 text-green-500" /> :
                     diff < 0 ? <ArrowDownRight className="w-3 h-3 text-red-500" /> :
                     <Minus className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">
                      {diff > 0 ? `+${diff}` : diff} vs yesterday ({prev})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
