import { useState, useEffect } from "react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, Loader2, ChevronLeft, ChevronRight, RefreshCw, Newspaper } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";

const CATEGORIES = ["political", "health", "tech", "sports", "business", "entertainment", "science", "urgent", "general"] as const;
const SOURCE_TYPES = ["rss", "website", "google_news", "twitter", "youtube", "facebook", "instagram", "telegram"] as const;
const PAGE_SIZE = 24;

export default function Feed() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const currentLang = i18n.language?.split("-")[0] || "en";
  const searchString = useSearch();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(searchString);
    return {
      search: params.get("search") || "",
      sourceId: undefined as string | undefined,
      sentiment: undefined as string | undefined,
      category: undefined as string | undefined,
      sourceType: undefined as string | undefined,
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const searchParam = params.get("search");
    if (searchParam) {
      setFilters(prev => ({ ...prev, search: searchParam }));
      setPage(1);
    }
  }, [searchString]);

  const { data: articlesData, isLoading: isLoadingArticles, isFetching } = useArticles({
    search: filters.search,
    sourceId: filters.sourceId ? parseInt(filters.sourceId) : undefined,
    sentiment: filters.sentiment,
    category: filters.category,
    sourceType: filters.sourceType,
    lang: currentLang,
    page,
    limit: PAGE_SIZE,
  });

  const { data: sources } = useSources();

  const reanalyzeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reanalyze"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: t("feed.reanalyzeSuccess"), description: `${data.analyzed} / ${data.total} articles analyzed` });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const totalPages = articlesData ? Math.ceil(articlesData.total / PAGE_SIZE) : 0;
  const articles = articlesData?.items || [];

  const hasActiveFilters = filters.search || filters.sourceId || filters.sentiment || filters.category || filters.sourceType;

  const clearFilters = () => {
    setFilters({ search: "", sourceId: undefined, sentiment: undefined, category: undefined, sourceType: undefined });
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-feed-title">{t("feed.title")}</h1>
            {isFetching && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {currentLang !== "en" ? t("feed.translating") : t("common.loading")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {articlesData && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-total-articles">
                <Newspaper className="w-3 h-3 mr-1" />
                {articlesData.total} {t("feed.articles")}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              data-testid="button-reanalyze"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reanalyzeMutation.isPending ? "animate-spin" : ""}`} />
              {t("feed.reanalyze")}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground">{t("feed.subtitle")}</p>
      </div>

      <div className="bg-card p-4 rounded-md border border-border/50 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder={t("feed.searchPlaceholder")}
              className="ltr:pl-10 rtl:pr-10 bg-background"
              value={filters.search}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, search: e.target.value }));
                setPage(1);
              }}
              data-testid="input-search-articles"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <Select 
            value={filters.sourceId} 
            onValueChange={(val) => { setFilters(prev => ({ ...prev, sourceId: val === "all" ? undefined : val })); setPage(1); }}
          >
            <SelectTrigger className="w-[160px] bg-background" data-testid="select-filter-source">
              <SelectValue placeholder={t("feed.allSources")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allSources")}</SelectItem>
              {sources?.map(source => (
                <SelectItem key={source.id} value={source.id.toString()}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={filters.sourceType} 
            onValueChange={(val) => { setFilters(prev => ({ ...prev, sourceType: val === "all" ? undefined : val })); setPage(1); }}
          >
            <SelectTrigger className="w-[160px] bg-background" data-testid="select-filter-source-type">
              <SelectValue placeholder={t("feed.allSourceTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allSourceTypes")}</SelectItem>
              {SOURCE_TYPES.map(type => (
                <SelectItem key={type} value={type}>
                  {t(`feed.sourceTypes.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={filters.sentiment} 
            onValueChange={(val) => { setFilters(prev => ({ ...prev, sentiment: val === "all" ? undefined : val })); setPage(1); }}
          >
            <SelectTrigger className="w-[150px] bg-background" data-testid="select-filter-sentiment">
              <SelectValue placeholder={t("feed.allSentiment")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allSentiment")}</SelectItem>
              <SelectItem value="positive">{t("feed.positive")}</SelectItem>
              <SelectItem value="neutral">{t("feed.neutral")}</SelectItem>
              <SelectItem value="negative">{t("feed.negative")}</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filters.category} 
            onValueChange={(val) => { setFilters(prev => ({ ...prev, category: val === "all" ? undefined : val })); setPage(1); }}
          >
            <SelectTrigger className="w-[170px] bg-background" data-testid="select-filter-category">
              <SelectValue placeholder={t("feed.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("feed.allCategories")}</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {t(`feed.categories.${cat}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              {t("feed.clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {isLoadingArticles ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-md" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-md border border-dashed border-border">
          <SlidersHorizontal className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold font-display text-foreground">{t("feed.noArticles")}</h3>
          <p className="text-muted-foreground mt-2">{t("feed.noArticlesHint")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article: any) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4" data-testid="pagination">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t("feed.previous")}
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === page ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      data-testid={`button-page-${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                data-testid="button-next-page"
              >
                {t("feed.next")}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
