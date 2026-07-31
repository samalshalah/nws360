import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, FileText, Loader2, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { ARTICLE_CATEGORIES, ARTICLE_PRIORITIES, IRAQ_PROVINCES, getArticleCategoryLabel } from "@shared/article-taxonomy";
import { CAPS } from "@shared/schema";
import { useEmbassyProfile } from "@/hooks/use-embassy-profile";

type DateRangeValue = "today" | "week" | "month" | "all";
type ExportFormat = "txt" | "csv";

type ReportBasketResponse = {
  items: any[];
  total: number;
  page: number;
  limit: number;
};

const SOURCE_TYPES = [
  { value: "rss", label: "RSS" },
  { value: "website", label: "Website" },
  { value: "google_news", label: "Google News" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
];

function buildDateRange(value: DateRangeValue): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (value === "today") {
    return { startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), endDate: now.toISOString() };
  }
  if (value === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  if (value === "month") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  return {};
}

function getFilenameFromDisposition(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export default function ReportBasket() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasCap } = usePermissions();
  const embassyProfile = useEmbassyProfile();
  const canExport = hasCap(CAPS.ARTICLE_EXPORT);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>("week");
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [province, setProvince] = useState<string>("all");
  const [sourceType, setSourceType] = useState<string>("all");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const range = useMemo(() => buildDateRange(dateRange), [dateRange]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sort", "newest");
    params.set("limit", "100");
    if (search.trim()) params.set("search", search.trim());
    if (category !== "all") params.set("category", category);
    if (priority !== "all") params.set("priority", priority);
    if (province !== "all") params.set("province", province);
    if (sourceType !== "all") params.set("sourceType", sourceType);
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    return params.toString();
  }, [category, priority, province, range.endDate, range.startDate, search, sourceType]);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ReportBasketResponse>({
    queryKey: ["/api/reports/basket", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/reports/basket?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report basket");
      return res.json();
    },
  });

  const articles = data?.items || [];
  const total = data?.total || 0;
  const hasFilters = Boolean(search.trim()) || category !== "all" || priority !== "all" || province !== "all" || sourceType !== "all" || dateRange !== "week";

  const resetFilters = () => {
    setSearch("");
    setDateRange("week");
    setCategory("all");
    setPriority("all");
    setProvince("all");
    setSourceType("all");
  };

  const exportReport = async (format: ExportFormat) => {
    try {
      setExporting(format);
      const res = await fetch(`/api/reports/basket/export?${queryString}&format=${format}`, { credentials: "include" });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFilenameFromDisposition(res.headers.get("Content-Disposition"), `nws360-report-basket.${format}`);
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: t("reports.reportBasket.exportFailed", "Export failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-report-basket-title">
              {t("reports.reportBasket.title", "Report Basket")}
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("reports.reportBasket.subtitle", "Articles marked For Report are collected here for review, filtering, and non-AI export.")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/briefings">
            <Button variant="outline" size="sm" data-testid="button-open-briefings-from-basket">
              <BookOpen className="h-4 w-4" />
              <span className="ml-2">{t("nav.briefings", "Briefings")}</span>
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-report-basket">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">{t("common.refresh", "Refresh")}</span>
          </Button>
          {canExport && (
            <>
              <Button size="sm" onClick={() => exportReport("txt")} disabled={!!exporting || total === 0} data-testid="button-export-report-basket-txt">
                {exporting === "txt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-2">{t("reports.reportBasket.exportText", "Export Text")}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportReport("csv")} disabled={!!exporting || total === 0} data-testid="button-export-report-basket-csv">
                {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-2">CSV</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-card p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("reports.reportBasket.searchPlaceholder", "Search marked articles")}
              className="h-9 pl-9"
              data-testid="input-search-report-basket"
            />
          </div>

          <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRangeValue)}>
            <SelectTrigger className="h-9 min-w-[135px] lg:w-[145px]" data-testid="select-report-basket-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("common.today", "Today")}</SelectItem>
              <SelectItem value="week">{t("common.last7Days", "Last 7 days")}</SelectItem>
              <SelectItem value="month">{t("common.last30Days", "Last 30 days")}</SelectItem>
              <SelectItem value="all">{t("common.allTime", "All time")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 min-w-[145px] lg:w-[160px]" data-testid="select-report-basket-category">
              <SelectValue placeholder={t("feed.allCategories", "All categories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allCategories", "All categories")}</SelectItem>
              {ARTICLE_CATEGORIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>{getArticleCategoryLabel(item.code, embassyProfile)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-9 min-w-[135px] lg:w-[150px]" data-testid="select-report-basket-priority">
              <SelectValue placeholder="All priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {ARTICLE_PRIORITIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="h-9 min-w-[135px] lg:w-[150px]" data-testid="select-report-basket-province">
              <SelectValue placeholder={t("feed.allProvinces", "All provinces")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allProvinces", "All provinces")}</SelectItem>
              {IRAQ_PROVINCES.map((item) => (
                <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="h-9 min-w-[130px] lg:w-[145px]" data-testid="select-report-basket-source-type">
              <SelectValue placeholder={t("feed.allTypes", "All types")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allTypes", "All types")}</SelectItem>
              {SOURCE_TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 shrink-0" data-testid="button-clear-report-basket-filters">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="ml-2">{t("common.clear", "Clear")}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" data-testid="badge-report-basket-total">
            {total} {t("reports.reportBasket.marked", "marked")}
          </Badge>
          {articles.length < total && (
            <span className="text-xs text-muted-foreground">
              {t("reports.reportBasket.showingFirst", "Showing first {{count}}", { count: articles.length })}
            </span>
          )}
        </div>
        <Link href="/feed?workflowStatus=for_report&sort=newest">
          <Button variant="ghost" size="sm" data-testid="link-open-report-basket-in-feed">
            {t("reports.reportBasket.openInFeed", "Open in feed")}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-md" />
          ))}
        </div>
      ) : articles.length > 0 ? (
        <div className="space-y-3" data-testid="list-report-basket-articles">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} layout="list" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center" data-testid="empty-report-basket">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <h2 className="text-base font-semibold text-foreground">
            {t("reports.reportBasket.emptyTitle", "No marked articles")}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("reports.reportBasket.emptyBody", "Mark articles as For Report from the news feed, then return here to review and export them.")}
          </p>
          <Link href="/feed">
            <Button className="mt-4" data-testid="button-report-basket-go-feed">
              {t("nav.latestNews", "Latest News")}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
