import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";
import { useAnalytics } from "@/hooks/use-analytics";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, RefreshCw, Newspaper, Download, Trash2, CheckSquare, SlidersHorizontal, X, TrendingUp, Rss, Globe, LayoutGrid, List, ArrowDownUp } from "lucide-react";
import { SiX, SiYoutube, SiFacebook, SiInstagram, SiTelegram, SiGooglenews } from "react-icons/si";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { CAPS } from "@shared/schema";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";

const CATEGORIES = ["political", "health", "tech", "sports", "business", "entertainment", "science", "urgent", "general"] as const;
const SOURCE_TYPES = ["rss", "website", "google_news", "twitter", "youtube", "facebook", "instagram", "telegram"] as const;
const PAGE_SIZE = 20;
type FeedSort = "newest" | "oldest" | "recently_added" | "source_az" | "title_az" | "engagement";
const DEFAULT_SORT: FeedSort = "newest";
const SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "newest", label: "Newest published" },
  { value: "recently_added", label: "Recently added" },
  { value: "oldest", label: "Oldest published" },
  { value: "source_az", label: "Source A-Z" },
  { value: "title_az", label: "Title A-Z" },
  { value: "engagement", label: "Highest engagement" },
];

function parseFeedSort(value: string | null | undefined): FeedSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? value as FeedSort : DEFAULT_SORT;
}

export default function Feed() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { hasCap, isAdmin } = usePermissions();
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
  const [layout, setLayout] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("feed-layout") as "grid" | "list") || "grid";
  });

  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(searchString);
    return {
      search: params.get("search") || "",
      sourceId: undefined as string | undefined,
      sourceName: undefined as string | undefined,
      sentiment: undefined as string | undefined,
      category: undefined as string | undefined,
      sourceType: undefined as string | undefined,
      dateRange: "all" as string,
      sort: parseFeedSort(params.get("sort")),
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const searchParam = params.get("search");
    const sentimentParam = params.get("sentiment");
    const sourceIdParam = params.get("sourceId");
    const sourceTypeParam = params.get("sourceType");
    const categoryParam = params.get("category");
    const sortParam = params.get("sort");
    const focusParam = params.get("focus");
    const updates: Partial<typeof filters> = {};
    if (searchParam) updates.search = searchParam;
    if (sentimentParam) updates.sentiment = sentimentParam;
    if (sourceIdParam) updates.sourceId = sourceIdParam;
    if (sourceTypeParam) updates.sourceType = sourceTypeParam;
    if (categoryParam) updates.category = categoryParam;
    if (sortParam) updates.sort = parseFeedSort(sortParam);
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
    sourceName: filters.sourceName,
    sort: filters.sort,
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

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/articles/delete-all"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "All articles deleted", description: `${data.deleted} articles removed` });
      setSelectedArticles(new Set());
      resetScroll();
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
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
    if (filters.sourceName) params.set("sourceName", filters.sourceName);
    if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
    if (filters.sentiment) params.set("sentiment", filters.sentiment);
    if (filters.category) params.set("category", filters.category);
    if (filters.sourceType) params.set("sourceType", filters.sourceType);
    window.open(`/api/articles/export?${params.toString()}`, "_blank");
  };

  const updateFilter = (key: string, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    resetScroll();
  };

  const hasActiveFilters = filters.search || filters.sourceId || filters.sourceName || filters.sentiment || filters.category || filters.sourceType || filters.dateRange !== "all";

  const clearFilters = () => {
    setFilters({ search: "", sourceId: undefined, sourceName: undefined, sentiment: undefined, category: undefined, sourceType: undefined, dateRange: "all", sort: DEFAULT_SORT });
    setSearchInput("");
    resetScroll();
  };

  const CHANNEL_CONFIG: { key: string; label: string; icon: any; color: string }[] = [
    { key: "all", label: t("feed.allChannels") || "All Channels", icon: Newspaper, color: "" },
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

  const uniqueSourceNames = useMemo(() => {
    if (!sources) return [];
    const names = new Set(sources.map((s: any) => s.name));
    return Array.from(names).sort();
  }, [sources]);

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
  const canExportArticles = hasCap(CAPS.ARTICLE_EXPORT);
  const canRunIntelligence = hasCap(CAPS.INTELLIGENCE_RUN);
  const canDeleteArticles = isAdmin;

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilterCount = [
    filters.sourceName,
    filters.sourceType,
    filters.sentiment,
    filters.category,
    filters.dateRange !== "all" ? filters.dateRange : undefined,
  ].filter(Boolean).length;

  const searchBar = (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      <Input
        ref={searchInputRef}
        placeholder={t("feed.searchPlaceholder")}
        className="ltr:pl-9 rtl:pr-9 bg-background"
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
  );

  const filterDropdowns = (
    <>
      <Select
        value={filters.sort}
        onValueChange={(val) => updateFilter("sort", parseFeedSort(val))}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-sort-articles">
          <ArrowDownUp className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sourceName || "all"}
        onValueChange={(val) => updateFilter("sourceName", val === "all" ? undefined : val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-source">
          <SelectValue placeholder={t("feed.allSources")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("feed.allSources")}</SelectItem>
          {uniqueSourceNames.map(name => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sourceType || "all"}
        onValueChange={(val) => updateFilter("sourceType", val === "all" ? undefined : val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-channel-type">
          <SelectValue placeholder={t("feed.allChannels")} />
        </SelectTrigger>
        <SelectContent>
          {visibleChannels.map(ch => {
            const Icon = ch.icon;
            return (
              <SelectItem key={ch.key} value={ch.key}>
                <span className="flex items-center gap-1.5">
                  <Icon className={cn("w-3.5 h-3.5", ch.color)} />
                  {ch.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select
        value={filters.dateRange}
        onValueChange={(val) => updateFilter("dateRange", val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-date-range">
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
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-sentiment">
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
        value={filters.category || "all"}
        onValueChange={(val) => updateFilter("category", val === "all" ? undefined : val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-category">
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
        <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={clearFilters} data-testid="button-clear-filters">
          <X className="w-3.5 h-3.5 mr-1" />
          {t("feed.clearFilters")}
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <h1 className="shrink-0 text-xl font-bold text-foreground" data-testid="text-feed-title">{t("feed.title")}</h1>
          {articlesData && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums" data-testid="badge-total-articles">
              {articlesData.total} {t("feed.articles")}
            </span>
          )}
          {isFetching && (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="hidden w-[300px] max-w-[34vw] shrink md:block">
            {searchBar}
          </div>
          <div className="hidden shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5 md:flex">
            <Button
              size="icon"
              variant={layout === "grid" ? "default" : "ghost"}
              onClick={() => { setLayout("grid"); localStorage.setItem("feed-layout", "grid"); }}
              data-testid="button-layout-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={layout === "list" ? "default" : "ghost"}
              onClick={() => { setLayout("list"); localStorage.setItem("feed-layout", "list"); }}
              data-testid="button-layout-list"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="md:hidden flex items-center gap-1">
              <Button
                variant={mobileSearchOpen ? "default" : "ghost"}
                size="icon"
                onClick={() => { setMobileSearchOpen(!mobileSearchOpen); if (!mobileSearchOpen) setMobileFiltersOpen(false); }}
                data-testid="button-mobile-search-toggle"
              >
                <Search className="w-4 h-4" />
              </Button>
              <div className="relative">
                <Button
                  variant={mobileFiltersOpen ? "default" : "ghost"}
                  size="icon"
                  onClick={() => { setMobileFiltersOpen(!mobileFiltersOpen); if (!mobileFiltersOpen) setMobileSearchOpen(false); }}
                  data-testid="button-mobile-filters-toggle"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center rounded-full" data-testid="badge-active-filter-count">
                    {activeFilterCount}
                  </span>
                )}
              </div>
            </div>
            {canExportArticles && (
              <Button variant="ghost" size="icon" onClick={handleExport} data-testid="button-export">
                <Download className="w-4 h-4" />
              </Button>
            )}
            {canRunIntelligence && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => reanalyzeMutation.mutate()}
                disabled={reanalyzeMutation.isPending}
                data-testid="button-reanalyze"
              >
                <RefreshCw className={cn("w-4 h-4", reanalyzeMutation.isPending && "animate-spin")} />
              </Button>
            )}
            {canDeleteArticles && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleteAllMutation.isPending || !articlesData?.total}
                    data-testid="button-delete-all"
                    title="Delete all articles"
                  >
                    <Trash2 className={cn("w-4 h-4 text-destructive", deleteAllMutation.isPending && "animate-pulse")} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all articles?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {articlesData?.total || 0} articles. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-all">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-all"
                    >
                      {deleteAllMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="md:hidden" data-testid="mobile-search-panel">
          {searchBar}
        </div>
      )}

      {mobileFiltersOpen && (
        <div className="md:hidden space-y-2" data-testid="mobile-filters-panel">
          <div className="grid grid-cols-2 gap-2">
            {filterDropdowns}
          </div>
        </div>
      )}

      <div className="hidden md:block">
        <div className="flex w-full items-center gap-2">
          {filterDropdowns}
        </div>
      </div>

      {isLoadingArticles && page === 1 ? (
        <div className={cn(
          layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"
        )}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className={layout === "grid" ? "h-80 w-full rounded-md" : "h-32 w-full rounded-md"} />
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
          <div className={cn(
            layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"
          )}>
            {allArticles.map((article: any) => (
              <ArticleCard
                key={article.id}
                article={article}
                selected={selectedArticles.has(article.id)}
                onToggleSelect={canDeleteArticles ? toggleSelectArticle : undefined}
                layout={layout}
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

      {canDeleteArticles && selectedArticles.size > 0 && (
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
