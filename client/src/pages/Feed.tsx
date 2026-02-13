import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";
import { useAnalytics } from "@/hooks/use-analytics";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, RefreshCw, Newspaper, Download, Trash2, CheckSquare, SlidersHorizontal, X, TrendingUp, Rss, Globe } from "lucide-react";
import { SiX, SiYoutube, SiFacebook, SiInstagram, SiTelegram, SiGooglenews } from "react-icons/si";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";

const CATEGORIES = ["political", "health", "tech", "sports", "business", "entertainment", "science", "urgent", "general"] as const;
const SOURCE_TYPES = ["rss", "website", "google_news", "twitter", "youtube", "facebook", "instagram", "telegram"] as const;
const PAGE_SIZE = 20;

export default function Feed() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const currentLang = i18n.language?.split("-")[0] || "en";
  const searchString = useSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const [allArticles, setAllArticles] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [selectedArticles, setSelectedArticles] = useState<Set<number>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(searchString);
    return {
      search: params.get("search") || "",
      sourceId: undefined as string | undefined,
      sentiment: undefined as string | undefined,
      category: undefined as string | undefined,
      sourceType: undefined as string | undefined,
      dateRange: "all" as string,
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const searchParam = params.get("search");
    const sentimentParam = params.get("sentiment");
    const sourceIdParam = params.get("sourceId");
    const sourceTypeParam = params.get("sourceType");
    const categoryParam = params.get("category");
    const focusParam = params.get("focus");
    const updates: Record<string, string> = {};
    if (searchParam) updates.search = searchParam;
    if (sentimentParam) updates.sentiment = sentimentParam;
    if (sourceIdParam) updates.sourceId = sourceIdParam;
    if (sourceTypeParam) updates.sourceType = sourceTypeParam;
    if (categoryParam) updates.category = categoryParam;
    if (Object.keys(updates).length > 0) {
      setFilters(prev => ({ ...prev, ...updates }));
      if (updates.search) setSearchInput(updates.search);
      resetScroll();
    }
    if (focusParam === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchString]);

  const isResettingRef = useRef(false);

  const resetScroll = useCallback(() => {
    isResettingRef.current = true;
    setPage(1);
    setAllArticles([]);
    setHasMore(true);
    setSelectedArticles(new Set());
    setTimeout(() => { isResettingRef.current = false; }, 500);
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (filters.dateRange === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (filters.dateRange === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (filters.dateRange === "month") {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    return {} as { startDate?: string; endDate?: string };
  }, [filters.dateRange]);

  const { data: articlesData, isLoading: isLoadingArticles, isFetching } = useArticles({
    search: filters.search,
    sourceId: filters.sourceId ? parseInt(filters.sourceId) : undefined,
    sentiment: filters.sentiment,
    category: filters.category,
    sourceType: filters.sourceType,
    lang: currentLang,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    page,
    limit: PAGE_SIZE,
  });

  const { data: sources } = useSources();
  const { data: analytics } = useAnalytics();

  const suggestions = useMemo(() => {
    if (!searchInput || searchInput.length < 2) return [];
    const query = searchInput.toLowerCase();
    const results: { type: "trending" | "title"; text: string }[] = [];
    if (analytics?.trendingKeywords) {
      for (const kw of analytics.trendingKeywords) {
        if (kw.text.toLowerCase().includes(query) && results.length < 3) {
          results.push({ type: "trending", text: kw.text });
        }
      }
    }
    for (const article of allArticles) {
      if (article.title?.toLowerCase().includes(query) && results.length < 6) {
        results.push({ type: "title", text: article.title });
      }
    }
    return results;
  }, [filters.search, analytics?.trendingKeywords, allArticles]);

  useEffect(() => {
    if (!articlesData) return;
    const newItems = articlesData.items || [];
    if (page === 1) {
      setAllArticles(newItems);
    } else {
      setAllArticles(prev => {
        const existingIds = new Set(prev.map((a: any) => a.id));
        const uniqueNew = newItems.filter((a: any) => !existingIds.has(a.id));
        return [...prev, ...uniqueNew];
      });
    }
    setHasMore(newItems.length >= PAGE_SIZE);
  }, [articlesData, page]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching && !isLoadingArticles && !isResettingRef.current && allArticles.length > 0) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );
    const el = observerRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, isFetching, isLoadingArticles, allArticles.length]);

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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/articles/bulk-delete", { ids }),
    onSuccess: () => {
      toast({ title: t("feed.bulkDeleteSuccess") });
      setSelectedArticles(new Set());
      resetScroll();
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const toggleSelectArticle = (id: number) => {
    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedArticles.size === allArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(allArticles.map((a: any) => a.id)));
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.sourceId) params.set("sourceId", filters.sourceId);
    if (filters.sentiment) params.set("sentiment", filters.sentiment);
    if (filters.category) params.set("category", filters.category);
    if (filters.sourceType) params.set("sourceType", filters.sourceType);
    window.open(`/api/articles/export?${params.toString()}`, "_blank");
  };

  const updateFilter = (key: string, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    resetScroll();
  };

  const hasActiveFilters = filters.search || filters.sourceId || filters.sentiment || filters.category || filters.sourceType || filters.dateRange !== "all";

  const clearFilters = () => {
    setFilters({ search: "", sourceId: undefined, sentiment: undefined, category: undefined, sourceType: undefined, dateRange: "all" });
    resetScroll();
  };

  const CHANNEL_CONFIG: { key: string; label: string; icon: any; color: string }[] = [
    { key: "all", label: t("feed.allTypes"), icon: Newspaper, color: "" },
    { key: "rss", label: "RSS", icon: Rss, color: "text-orange-500" },
    { key: "website", label: "Web", icon: Globe, color: "text-blue-500" },
    { key: "youtube", label: "YouTube", icon: SiYoutube, color: "text-red-500" },
    { key: "twitter", label: "X", icon: SiX, color: "" },
    { key: "facebook", label: "Facebook", icon: SiFacebook, color: "text-blue-600" },
    { key: "instagram", label: "Instagram", icon: SiInstagram, color: "text-pink-500" },
    { key: "telegram", label: "Telegram", icon: SiTelegram, color: "text-sky-500" },
    { key: "google_news", label: "Google News", icon: SiGooglenews, color: "text-blue-500" },
  ];

  const activeChannelTypes = useMemo(() => {
    if (!sources) return new Set<string>();
    return new Set(sources.map((s: any) => s.type));
  }, [sources]);

  const visibleChannels = CHANNEL_CONFIG.filter(
    ch => ch.key === "all" || activeChannelTypes.has(ch.key)
  );

  const timeRangePills = [
    { key: "today", label: t("feed.today") },
    { key: "week", label: t("feed.thisWeek") },
    { key: "month", label: t("feed.thisMonth") },
    { key: "all", label: t("feed.allDates") },
  ];

  const sentimentPills = [
    { key: "all", label: t("feed.allSentiment"), dot: null },
    { key: "positive", label: t("feed.positive"), dot: "bg-green-500" },
    { key: "neutral", label: t("feed.neutral"), dot: "bg-gray-400" },
    { key: "negative", label: t("feed.negative"), dot: "bg-red-500" },
  ];

  const activeSourceType = filters.sourceType || "all";
  const activeSentiment = filters.sentiment || "all";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-feed-title">{t("feed.title")}</h1>
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
              onClick={handleExport}
              data-testid="button-export"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {t("feed.export")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              data-testid="button-reanalyze"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", reanalyzeMutation.isPending && "animate-spin")} />
              {t("feed.reanalyze")}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground">{t("feed.subtitle")}</p>
      </div>

      <div className="space-y-4">
        <div className="relative w-full">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
          <Input
            ref={searchInputRef}
            placeholder={t("feed.searchPlaceholder")}
            className="ltr:pl-11 rtl:pr-11 bg-background text-base"
            value={searchInput}
            onChange={(e) => {
              const val = e.target.value;
              setSearchInput(val);
              setShowSuggestions(true);
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => {
                updateFilter("search", val);
              }, 400);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            data-testid="input-search-articles"
            aria-label={t("feed.searchPlaceholder")}
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); updateFilter("search", ""); setShowSuggestions(false); }}
              className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 z-10"
              data-testid="button-clear-search"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden" data-testid="search-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchInput(s.text);
                    updateFilter("search", s.text);
                    setShowSuggestions(false);
                  }}
                  data-testid={`suggestion-${i}`}
                >
                  {s.type === "trending" ? (
                    <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Newspaper className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {visibleChannels.map(ch => {
            const isActive = (filters.sourceType || "all") === ch.key;
            const Icon = ch.icon;
            return (
              <Button
                key={ch.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => updateFilter("sourceType", ch.key === "all" ? undefined : ch.key)}
                className={cn(
                  "shrink-0 gap-1.5",
                  !isActive && "text-muted-foreground"
                )}
                data-testid={`button-channel-${ch.key}`}
              >
                <Icon className={cn("w-3.5 h-3.5", !isActive && ch.color)} />
                {ch.label}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.dateRange}
            onValueChange={(val) => updateFilter("dateRange", val)}
          >
            <SelectTrigger className="w-full sm:w-[150px] bg-background" data-testid="select-filter-date-range">
              <SelectValue placeholder={t("feed.allDates")} />
            </SelectTrigger>
            <SelectContent>
              {timeRangePills.map(pill => (
                <SelectItem key={pill.key} value={pill.key}>{pill.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.sentiment || "all"}
            onValueChange={(val) => updateFilter("sentiment", val === "all" ? undefined : val)}
          >
            <SelectTrigger className="w-full sm:w-[150px] bg-background" data-testid="select-filter-sentiment">
              <SelectValue placeholder={t("feed.allSentiment")} />
            </SelectTrigger>
            <SelectContent>
              {sentimentPills.map(pill => (
                <SelectItem key={pill.key} value={pill.key}>
                  <span className="flex items-center gap-1.5">
                    {pill.dot && <span className={cn("w-2 h-2 rounded-full inline-block", pill.dot)} />}
                    {pill.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.sourceId || "all"}
            onValueChange={(val) => updateFilter("sourceId", val === "all" ? undefined : val)}
          >
            <SelectTrigger className="w-full sm:w-[180px] bg-background" data-testid="select-filter-source">
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
            value={filters.category || "all"}
            onValueChange={(val) => updateFilter("category", val === "all" ? undefined : val)}
          >
            <SelectTrigger className="w-full sm:w-[170px] bg-background" data-testid="select-filter-category">
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
              <X className="w-3.5 h-3.5 mr-1" />
              {t("feed.clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {isLoadingArticles && page === 1 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-md" />
          ))}
        </div>
      ) : allArticles.length === 0 && !isFetching ? (
        <div className="text-center py-20 bg-muted/30 rounded-md border border-dashed border-border">
          <SlidersHorizontal className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold font-display text-foreground">{t("feed.noArticles")}</h3>
          <p className="text-muted-foreground mt-2">{t("feed.noArticlesHint")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allArticles.map((article: any) => (
              <ArticleCard
                key={article.id}
                article={article}
                selected={selectedArticles.has(article.id)}
                onToggleSelect={toggleSelectArticle}
              />
            ))}
          </div>

          <div
            ref={observerRef}
            className="flex items-center justify-center py-8"
            data-testid="infinite-scroll-trigger"
          >
            {isFetching && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{t("feed.loadingMore")}</span>
              </div>
            )}
            {!hasMore && allArticles.length > 0 && !isFetching && (
              <span className="text-sm text-muted-foreground">{t("feed.noMoreArticles")}</span>
            )}
          </div>
        </>
      )}

      {selectedArticles.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-card border border-border rounded-md shadow-lg"
          data-testid="bulk-actions-bar"
        >
          <Badge variant="secondary">{selectedArticles.size} {t("feed.selected")}</Badge>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(t("feed.confirmBulkDelete"))) {
                bulkDeleteMutation.mutate(Array.from(selectedArticles));
              }
            }}
            disabled={bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t("feed.deleteSelected")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedArticles(new Set())} data-testid="button-clear-selection">
            {t("feed.clearSelection")}
          </Button>
        </div>
      )}
    </div>
  );
}
