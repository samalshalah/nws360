import { useMemo } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  Layers,
  Newspaper,
  RadioTower,
  Search,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getArticleCategoryLabel } from "@shared/article-taxonomy";
import { useAnalytics } from "@/hooks/use-analytics";
import { useArticles } from "@/hooks/use-articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdatedAt } from "@/components/UpdatedAt";

const DAY_MS = 24 * 60 * 60 * 1000;

type MetricCardProps = {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

const categoryTone: Record<string, string> = {
  urgent: "bg-red-500",
  security: "bg-rose-500",
  political: "bg-blue-500",
  economy: "bg-emerald-500",
  oil_energy: "bg-amber-500",
  foreign_relations: "bg-indigo-500",
  parliament_law: "bg-violet-500",
  government_services: "bg-sky-500",
  health: "bg-teal-500",
  education: "bg-cyan-500",
  corruption_courts: "bg-orange-500",
  provinces: "bg-lime-500",
  protests_public_opinion: "bg-pink-500",
  humanitarian_ngos: "bg-green-500",
  business: "bg-yellow-500",
  tech: "bg-purple-500",
  environment_water: "bg-emerald-600",
  culture_society: "bg-fuchsia-500",
  sports: "bg-orange-400",
  science: "bg-cyan-600",
  entertainment: "bg-pink-400",
  general: "bg-muted-foreground",
  other: "bg-muted-foreground",
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function trendLabel(current: number, previous: number) {
  if (previous <= 0 && current > 0) return "new activity";
  if (previous <= 0) return "no change";
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "flat vs previous 24h";
  return `${delta > 0 ? "+" : ""}${delta}% vs previous 24h`;
}

function categoryHref(category: string) {
  const params = new URLSearchParams({ category, sort: "newest", dateRange: "week" });
  return `/feed?${params.toString()}`;
}

function MetricCard({ title, value, detail, href, icon: Icon, tone }: MetricCardProps) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:border-primary/50 hover:bg-muted/20" data-testid={`card-dashboard-metric-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <CardContent className="flex h-full items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={`rounded-md p-3 ${tone}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: analytics, isLoading: isLoadingAnalytics, dataUpdatedAt: analyticsUpdatedAt } = useAnalytics();
  const startDate = useMemo(() => new Date(Date.now() - DAY_MS).toISOString(), []);
  const { data: latestCoverage, isLoading: latestLoading } = useArticles({
    limit: 6,
    sort: "newest",
    startDate,
  });

  const categoryBreakdown = (analytics?.categoryBreakdown || [])
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalCategoryCount = categoryBreakdown.reduce((sum, item) => sum + item.count, 0);
  const topCategory = categoryBreakdown[0];
  const headlineSignals = (analytics?.trendingKeywords || []).slice(0, 8);
  const topSources = (analytics?.topSources24h?.length ? analytics.topSources24h : analytics?.topSources || []).slice(0, 5);
  const latestArticles = latestCoverage?.items || [];
  const articlesLast24h = analytics?.articlesLast24h || 0;
  const articlesPrevious24h = analytics?.articlesPrevious24h || 0;
  const latestPublishedAt = analytics?.latestPublishedAt ? new Date(analytics.latestPublishedAt) : null;

  const metricCards: MetricCardProps[] = [
    {
      title: "New coverage",
      value: formatNumber(articlesLast24h),
      detail: trendLabel(articlesLast24h, articlesPrevious24h),
      href: `/feed?dateRange=day&sort=newest&startDate=${encodeURIComponent(startDate)}`,
      icon: Newspaper,
      tone: "bg-blue-600",
    },
    {
      title: "Active sources",
      value: `${formatNumber(analytics?.activeSources24h)}/${formatNumber(analytics?.sourcesCount)}`,
      detail: "sources publishing in the last 24h",
      href: "/sources/manage",
      icon: RadioTower,
      tone: "bg-orange-600",
    },
    {
      title: "Lead category",
      value: topCategory ? getArticleCategoryLabel(topCategory.category) : "No signal",
      detail: topCategory ? `${formatNumber(topCategory.count)} articles this week` : "category data is not ready",
      href: topCategory ? categoryHref(topCategory.category) : "/feed",
      icon: Layers,
      tone: "bg-emerald-600",
    },
    {
      title: "Headline signals",
      value: formatNumber(headlineSignals.length),
      detail: headlineSignals[0] ? `${headlineSignals[0].text} leads` : "waiting for new titles",
      href: "/analytics/trending-topics",
      icon: TrendingUp,
      tone: "bg-violet-600",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl" data-testid="text-dashboard-title">
              {t("dashboard.clientTitle", "Client Intelligence")}
            </h1>
            {latestPublishedAt && (
              <Badge variant="outline" className="gap-1">
                <Clock3 className="h-3 w-3" />
                latest {formatDistanceToNow(latestPublishedAt, { addSuffix: true })}
              </Badge>
            )}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("dashboard.clientSubtitle", "A live read of what changed across your monitored sources, organized for editorial and reporting decisions.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UpdatedAt timestamp={analyticsUpdatedAt ? new Date(analyticsUpdatedAt) : null} />
          <Link href="/feed?dateRange=day&sort=newest">
            <Button variant="outline" size="sm" data-testid="button-dashboard-open-today-feed">
              <Search className="h-4 w-4" />
              <span className="ml-2">Today feed</span>
            </Button>
          </Link>
        </div>
      </div>

      {isLoadingAnalytics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => <MetricCard key={card.title} {...card} />)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="rounded-md border border-border/60 bg-card" data-testid="section-dashboard-latest-coverage">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Latest priority coverage</h2>
              <p className="text-xs text-muted-foreground">Newest articles from the last 24 hours, now categorized for faster triage.</p>
            </div>
            <Link href="/feed?dateRange=day&sort=newest">
              <Button variant="ghost" size="sm">
                Open feed
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="space-y-3 p-4">
            {latestLoading ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-md" />)
            ) : latestArticles.length > 0 ? (
              latestArticles.map((article: any) => <ArticleCard key={article.id} article={article} layout="list" />)
            ) : (
              <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No new articles in the last 24 hours.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-border/60 bg-card" data-testid="section-dashboard-category-mix">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Coverage mix</h2>
              <p className="text-xs text-muted-foreground">Top categories from the last 7 days.</p>
            </div>
            <div className="space-y-3 p-4">
              {categoryBreakdown.length > 0 ? categoryBreakdown.slice(0, 7).map((item) => {
                const pct = totalCategoryCount > 0 ? Math.max(4, Math.round((item.count / totalCategoryCount) * 100)) : 0;
                return (
                  <Link key={item.category} href={categoryHref(item.category)}>
                    <div className="group space-y-1 rounded-md px-2 py-1 transition hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-foreground">{getArticleCategoryLabel(item.category)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(item.count)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className={`h-2 rounded-full ${categoryTone[item.category] || categoryTone.general}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              }) : (
                <p className="text-sm text-muted-foreground">Category data will appear after the next fetch.</p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-border/60 bg-card" data-testid="section-dashboard-headline-signals">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Headline signals</h2>
              <p className="text-xs text-muted-foreground">Non-AI terms gaining repetition in headlines.</p>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {headlineSignals.length > 0 ? headlineSignals.map((signal) => (
                <Link key={signal.text} href={`/feed?search=${encodeURIComponent(signal.text)}&sort=newest`}>
                  <Badge variant="secondary" className="cursor-pointer gap-1">
                    {signal.text}
                    <span className="text-muted-foreground">{signal.value}</span>
                  </Badge>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground">Signals will appear as titles repeat across sources.</p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-border/60 bg-card" data-testid="section-dashboard-top-sources">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Top sources today</h2>
              <p className="text-xs text-muted-foreground">Sub-source aware counts where Google News is involved.</p>
            </div>
            <div className="space-y-2 p-4">
              {topSources.length > 0 ? topSources.map((source) => (
                <Link key={source.name} href={`/feed?sourceName=${encodeURIComponent(source.name)}&dateRange=day&sort=newest`}>
                  <div className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-muted/40">
                    <span className="truncate text-foreground">{source.name}</span>
                    <Badge variant="outline">{formatNumber(source.count)}</Badge>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground">No source activity in the last 24 hours.</p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-border/60 bg-card p-4" data-testid="section-dashboard-actions">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Next reporting action</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Review the lead category, mark useful items for report, then build the briefing from the report basket.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/reports/basket">
                    <Button size="sm" variant="outline">Report basket</Button>
                  </Link>
                  <Link href="/briefings">
                    <Button size="sm">Briefings</Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
