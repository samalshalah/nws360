import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";
import { useAnalytics } from "@/hooks/use-analytics";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, RefreshCw, Newspaper, Download, Trash2, CheckSquare, SlidersHorizontal, X, TrendingUp, Rss, Globe, LayoutGrid, List, ArrowDownUp, BookmarkPlus, ChevronDown } from "lucide-react";
import { SiX, SiYoutube, SiFacebook, SiInstagram, SiTelegram, SiGooglenews } from "react-icons/si";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { CAPS } from "@shared/schema";
import { ARTICLE_CATEGORIES, ARTICLE_PRIORITIES, ARTICLE_WORKFLOW_STATUSES, IRAQ_PROVINCES, getArticleCategoryLabel, type EmbassyProfile } from "@shared/article-taxonomy";
import { OFFICIAL_SOURCE_CATEGORY_CODES, OFFICIAL_SOURCE_CATEGORIES, getSourceCategoryLabel } from "@shared/source-categories";
import { useEmbassyProfile } from "@/hooks/use-embassy-profile";
import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
type FeedSort = "newest" | "oldest" | "recently_added" | "source_az" | "title_az" | "engagement";
type GridColumnCount = 2 | 3 | 4 | 5;
type FeedLiveUpdateMode = "notify" | "auto_load";
type PublicSystemSettings = {
  feedLiveUpdateEnabled: boolean;
  feedLiveUpdateIntervalSeconds: number;
  feedLiveUpdateMode: FeedLiveUpdateMode;
  defaultFeedDateRange?: "all" | "today" | "week" | "month";
  embassyProfile?: EmbassyProfile | null;
};
type ArticleLiveStatus = {
  total: number;
  items: { id: number; publishedAt: string | null; ingestedAt: string | null; createdAt: string | null }[];
};
type SavedFeedView = {
  id: number;
  name: string;
  filters: Record<string, string>;
  isShared: boolean;
  updatedAt?: string | null;
};
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

const GRID_COLUMN_OPTIONS: GridColumnCount[] = [2, 3, 4, 5];

function parseGridColumnCount(value: string | null | undefined): GridColumnCount {
  const parsed = Number(value);
  return GRID_COLUMN_OPTIONS.includes(parsed as GridColumnCount) ? parsed as GridColumnCount : 3;
}

function gridColumnClass(columns: GridColumnCount) {
  return {
    2: "grid-cols-1 xl:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
    5: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5",
  }[columns];
}

function GridDensityIcon({ columns }: { columns: GridColumnCount }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-4 w-6 gap-0.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <span key={index} className="rounded-[1px] bg-current opacity-80" />
      ))}
    </span>
  );
}

export default function Feed({ officialSourcesOnly: officialSourcesOnlyProp = false }: { officialSourcesOnly?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { hasCap, isAdmin } = usePermissions();
  const embassyProfile = useEmbassyProfile();
  const currentLang = i18n.language?.split("-")[0] || "en";
  const [location] = useLocation();
  const searchString = useSearch();
  const officialSourcesOnly = officialSourcesOnlyProp || location === "/official-sources";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const [allArticles, setAllArticles] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [selectedArticles, setSelectedArticles] = useState<Set<number>>(new Set());
  const [bulkWorkflowStatus, setBulkWorkflowStatus] = useState("skip");
  const [bulkCategory, setBulkCategory] = useState("skip");
  const [bulkPriority, setBulkPriority] = useState("skip");
  const [bulkProvince, setBulkProvince] = useState("skip");
  const [bulkTagsInput, setBulkTagsInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [settingsDefaultApplied, setSettingsDefaultApplied] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const baselineArticleIdsRef = useRef<Set<number>>(new Set());
  const baselineTotalRef = useRef(0);
  const baselineReadyRef = useRef(false);
  const [layout, setLayout] = useState<"grid" | "list">(() => {
    const storedLayout = localStorage.getItem("feed-layout-v2");
    return storedLayout === "list" ? "list" : "grid";
  });
  const [gridColumns, setGridColumns] = useState<GridColumnCount>(() => parseGridColumnCount(localStorage.getItem("feed-grid-columns-v1")));

  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(searchString);
    return {
      search: params.get("search") || "",
      sourceId: undefined as string | undefined,
      sourceName: undefined as string | undefined,
      sourceCategory: undefined as string | undefined,
      sentiment: undefined as string | undefined,
      category: undefined as string | undefined,
      priority: undefined as string | undefined,
      province: undefined as string | undefined,
      workflowStatus: undefined as string | undefined,
      manualTag: undefined as string | undefined,
      sourceType: undefined as string | undefined,
      startDate: params.get("startDate") || undefined as string | undefined,
      endDate: params.get("endDate") || undefined as string | undefined,
      dateRange: "all" as string,
      sort: parseFeedSort(params.get("sort")),
    };
  });
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const searchParam = params.get("search");
    const sentimentParam = params.get("sentiment");
    const sourceIdParam = params.get("sourceId");
    const sourceTypeParam = params.get("sourceType");
    const sourceCategoryParam = params.get("sourceCategory");
    const categoryParam = params.get("category");
    const priorityParam = params.get("priority");
    const provinceParam = params.get("province");
    const workflowStatusParam = params.get("workflowStatus");
    const manualTagParam = params.get("manualTag");
    const startDateParam = params.get("startDate");
    const endDateParam = params.get("endDate");
    const dateRangeParam = params.get("dateRange");
    const sortParam = params.get("sort");
    const focusParam = params.get("focus");
    const nextFilters = {
      search: searchParam || "",
      sourceId: sourceIdParam || undefined,
      sourceName: params.get("sourceName") || undefined,
      sourceCategory: sourceCategoryParam || undefined,
      sentiment: sentimentParam || undefined,
      category: categoryParam || undefined,
      priority: priorityParam || undefined,
      province: provinceParam || undefined,
      workflowStatus: workflowStatusParam || undefined,
      manualTag: manualTagParam || undefined,
      sourceType: sourceTypeParam || undefined,
      startDate: startDateParam || undefined,
      endDate: endDateParam || undefined,
      dateRange: dateRangeParam || "all",
      sort: parseFeedSort(sortParam),
    };
    setFilters(prev => {
      const changed = Object.keys(nextFilters).some((key) => prev[key as keyof typeof prev] !== nextFilters[key as keyof typeof nextFilters]);
      return changed ? nextFilters : prev;
    });
    setSearchInput(nextFilters.search);
    resetScroll();
    if (focusParam === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchString]);

  const isResettingRef = useRef(false);

  const resetScroll = useCallback(() => {
    isResettingRef.current = true;
    baselineReadyRef.current = false;
    baselineArticleIdsRef.current = new Set();
    baselineTotalRef.current = 0;
    setPendingNewCount(0);
    setPage(1);
    setAllArticles([]);
    setHasMore(true);
    setSelectedArticles(new Set());
    setTimeout(() => { isResettingRef.current = false; }, 500);
  }, []);

  const dateRange = useMemo(() => {
    if (filters.startDate || filters.endDate) {
      return { startDate: filters.startDate, endDate: filters.endDate };
    }
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
  }, [filters.dateRange, filters.endDate, filters.startDate]);

  const { data: articlesData, isLoading: isLoadingArticles, isFetching } = useArticles({
    search: filters.search,
    sourceId: filters.sourceId ? parseInt(filters.sourceId) : undefined,
    sourceName: filters.sourceName,
    sourceCategory: filters.sourceCategory,
    sort: filters.sort,
    sentiment: filters.sentiment,
    category: filters.category,
    priority: filters.priority,
    province: filters.province,
    workflowStatus: filters.workflowStatus,
    manualTag: filters.manualTag,
    sourceType: filters.sourceType,
    officialSources: officialSourcesOnly,
    lang: currentLang,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    page,
    limit: PAGE_SIZE,
  });

  const { data: publicSettings } = useQuery<PublicSystemSettings>({
    queryKey: ["/api/settings/public"],
    queryFn: async () => {
      const res = await fetch("/api/settings/public", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch public settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (settingsDefaultApplied || !publicSettings?.defaultFeedDateRange) return;
    const params = new URLSearchParams(searchString);
    if (!params.has("dateRange") && !params.has("startDate") && !params.has("endDate")) {
      setFilters(prev => prev.dateRange === "all" && publicSettings.defaultFeedDateRange !== "all"
        ? { ...prev, dateRange: publicSettings.defaultFeedDateRange as string }
        : prev);
    }
    setSettingsDefaultApplied(true);
  }, [publicSettings?.defaultFeedDateRange, searchString, settingsDefaultApplied]);

  const { data: savedViews = [] } = useQuery<SavedFeedView[]>({
    queryKey: ["/api/feed/views"],
    queryFn: async () => {
      const res = await fetch("/api/feed/views", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch saved views");
      return res.json();
    },
  });

  const liveUpdateEnabled = publicSettings?.feedLiveUpdateEnabled ?? true;
  const liveUpdateMode: FeedLiveUpdateMode = publicSettings?.feedLiveUpdateMode === "auto_load" ? "auto_load" : "notify";
  const liveUpdateIntervalMs = Math.min(
    300,
    Math.max(15, publicSettings?.feedLiveUpdateIntervalSeconds ?? 60)
  ) * 1000;
  const liveStatusQueryString = useMemo(() => {
    const searchParams = new URLSearchParams();
    if (filters.search) searchParams.set("search", filters.search);
    if (filters.sourceId) searchParams.set("sourceId", filters.sourceId);
    if (filters.sourceName) searchParams.set("sourceName", filters.sourceName);
    if (filters.sort) searchParams.set("sort", filters.sort);
    if (filters.sentiment) searchParams.set("sentiment", filters.sentiment);
    if (filters.category) searchParams.set("category", filters.category);
    if (filters.priority) searchParams.set("priority", filters.priority);
    if (filters.province) searchParams.set("province", filters.province);
    if (filters.workflowStatus) searchParams.set("workflowStatus", filters.workflowStatus);
    if (filters.manualTag) searchParams.set("manualTag", filters.manualTag);
    if (filters.sourceType) searchParams.set("sourceType", filters.sourceType);
    if (filters.sourceCategory) searchParams.set("sourceCategory", filters.sourceCategory);
    if (officialSourcesOnly) searchParams.set("officialSources", "true");
    if (dateRange.startDate) searchParams.set("startDate", dateRange.startDate);
    if (dateRange.endDate) searchParams.set("endDate", dateRange.endDate);
    return searchParams.toString();
  }, [filters.search, filters.sourceId, filters.sourceName, filters.sourceCategory, filters.sort, filters.sentiment, filters.category, filters.priority, filters.province, filters.workflowStatus, filters.manualTag, filters.sourceType, officialSourcesOnly, dateRange.startDate, dateRange.endDate]);

  const { data: liveStatus, dataUpdatedAt: liveStatusUpdatedAt } = useQuery<ArticleLiveStatus>({
    queryKey: ["/api/articles/live-status", liveStatusQueryString],
    queryFn: async () => {
      const url = liveStatusQueryString ? `/api/articles/live-status?${liveStatusQueryString}` : "/api/articles/live-status";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to check feed updates");
      return res.json();
    },
    enabled: liveUpdateEnabled,
    refetchInterval: liveUpdateEnabled ? liveUpdateIntervalMs : false,
    staleTime: 0,
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
      baselineArticleIdsRef.current = new Set(newItems.map((article: any) => article.id));
      baselineTotalRef.current = articlesData.total || 0;
      baselineReadyRef.current = true;
      setPendingNewCount(0);
    } else {
      setAllArticles(prev => {
        const existingIds = new Set(prev.map((a: any) => a.id));
        const uniqueNew = newItems.filter((a: any) => !existingIds.has(a.id));
        for (const article of uniqueNew) {
          baselineArticleIdsRef.current.add(article.id);
        }
        return [...prev, ...uniqueNew];
      });
    }
    setHasMore(newItems.length >= PAGE_SIZE);
  }, [articlesData, page]);

  const loadNewestArticles = useCallback(() => {
    setPendingNewCount(0);
    queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0] || "").startsWith("/api/articles"),
    });
    resetScroll();
  }, [resetScroll]);

  useEffect(() => {
    if (!liveStatus || !baselineReadyRef.current) return;
    const unseenItems = (liveStatus.items || []).filter(item => !baselineArticleIdsRef.current.has(item.id));
    const totalIncrease = Math.max(0, (liveStatus.total || 0) - baselineTotalRef.current);
    const nextNewCount = Math.max(unseenItems.length, totalIncrease);
    if (nextNewCount <= 0) return;

    if (liveUpdateMode === "auto_load") {
      loadNewestArticles();
      return;
    }

    setPendingNewCount(nextNewCount);
  }, [liveStatus, liveStatusUpdatedAt, liveUpdateMode, loadNewestArticles]);

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
      resetBulkControls();
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

  function resetBulkControls() {
    setBulkWorkflowStatus("skip");
    setBulkCategory("skip");
    setBulkPriority("skip");
    setBulkProvince("skip");
    setBulkTagsInput("");
  }

  const bulkWorkflowMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedArticles);
      const manualTags = bulkTagsInput
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      const payload: Record<string, any> = { ids };

      if (bulkWorkflowStatus !== "skip") payload.workflowStatus = bulkWorkflowStatus;
      if (bulkCategory !== "skip") payload.category = bulkCategory;
      if (bulkPriority !== "skip") payload.priority = bulkPriority;
      if (bulkProvince !== "skip") payload.province = bulkProvince === "none" ? null : bulkProvince;
      if (manualTags.length > 0) payload.manualTags = manualTags;

      if (Object.keys(payload).length === 1) {
        throw new Error("Choose a bulk action first.");
      }

      const res = await apiRequest("POST", "/api/articles/bulk-workflow", payload);
      return res.json() as Promise<{ requested: number; matched: number; updated: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Articles updated", description: `${data.updated} article${data.updated === 1 ? "" : "s"} updated` });
      setSelectedArticles(new Set());
      resetBulkControls();
      resetScroll();
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] || "").startsWith("/api/articles"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Bulk update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const buildCurrentSavedViewFilters = useCallback(() => {
    const viewFilters: Record<string, string> = {
      sort: filters.sort,
      dateRange: filters.dateRange,
    };
    if (filters.search) viewFilters.search = filters.search;
    if (filters.sourceId) viewFilters.sourceId = filters.sourceId;
    if (filters.sourceName) viewFilters.sourceName = filters.sourceName;
    if (filters.sourceCategory) viewFilters.sourceCategory = filters.sourceCategory;
    if (filters.sentiment) viewFilters.sentiment = filters.sentiment;
    if (filters.category) viewFilters.category = filters.category;
    if (filters.priority) viewFilters.priority = filters.priority;
    if (filters.province) viewFilters.province = filters.province;
    if (filters.workflowStatus) viewFilters.workflowStatus = filters.workflowStatus;
    if (filters.manualTag) viewFilters.manualTag = filters.manualTag;
    if (filters.sourceType) viewFilters.sourceType = filters.sourceType;
    return viewFilters;
  }, [filters]);

  const applySavedView = useCallback((view: SavedFeedView) => {
    const saved = view.filters || {};
    const nextFilters = {
      search: typeof saved.search === "string" ? saved.search : "",
      sourceId: typeof saved.sourceId === "string" ? saved.sourceId : undefined,
      sourceName: typeof saved.sourceName === "string" ? saved.sourceName : undefined,
      sourceCategory: typeof saved.sourceCategory === "string" ? saved.sourceCategory : undefined,
      sentiment: typeof saved.sentiment === "string" ? saved.sentiment : undefined,
      category: typeof saved.category === "string" ? saved.category : undefined,
      priority: typeof saved.priority === "string" ? saved.priority : undefined,
      province: typeof saved.province === "string" ? saved.province : undefined,
      workflowStatus: typeof saved.workflowStatus === "string" ? saved.workflowStatus : undefined,
      manualTag: typeof saved.manualTag === "string" ? saved.manualTag : undefined,
      sourceType: typeof saved.sourceType === "string" ? saved.sourceType : undefined,
      startDate: undefined as string | undefined,
      endDate: undefined as string | undefined,
      dateRange: typeof saved.dateRange === "string" ? saved.dateRange : "all",
      sort: parseFeedSort(saved.sort),
    };
    setFilters(nextFilters);
    setSearchInput(nextFilters.search);
    setActiveSavedViewId(String(view.id));
    resetScroll();
  }, [resetScroll]);

  const saveViewMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/feed/views", {
        name,
        filters: buildCurrentSavedViewFilters(),
        isShared: true,
      });
      return res.json() as Promise<SavedFeedView>;
    },
    onSuccess: (view) => {
      toast({ title: "Saved view updated" });
      setActiveSavedViewId(String(view.id));
      setSaveViewOpen(false);
      setViewName("");
      queryClient.invalidateQueries({ queryKey: ["/api/feed/views"] });
    },
    onError: (error) => {
      toast({
        title: "Saved view failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/feed/views/${id}`),
    onSuccess: () => {
      toast({ title: "Saved view deleted" });
      setActiveSavedViewId(undefined);
      queryClient.invalidateQueries({ queryKey: ["/api/feed/views"] });
    },
    onError: () => {
      toast({ title: "Saved view delete failed", variant: "destructive" });
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
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.province) params.set("province", filters.province);
    if (filters.workflowStatus) params.set("workflowStatus", filters.workflowStatus);
    if (filters.manualTag) params.set("manualTag", filters.manualTag);
    if (filters.sourceType) params.set("sourceType", filters.sourceType);
    if (filters.sourceCategory) params.set("sourceCategory", filters.sourceCategory);
    if (officialSourcesOnly) params.set("officialSources", "true");
    if (dateRange.startDate) params.set("startDate", dateRange.startDate);
    if (dateRange.endDate) params.set("endDate", dateRange.endDate);
    window.open(`/api/articles/export?${params.toString()}`, "_blank");
  };

  const updateFilter = (key: string, value: string | undefined) => {
    setActiveSavedViewId(undefined);
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "dateRange") {
        next.startDate = undefined;
        next.endDate = undefined;
      }
      return next;
    });
    resetScroll();
  };

  const updateBrowseFilter = (key: "category" | "sourceCategory" | "sourceName" | "province", value: string | undefined) => {
    setActiveSavedViewId(undefined);
    setFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key === "sourceName" ? { sourceId: undefined } : {}),
    }));
    resetScroll();
  };

  const clearBrowseNavigation = () => {
    clearFilters();
  };

  const hasActiveFilters = filters.search || filters.sourceId || filters.sourceName || filters.sourceCategory || filters.sentiment || filters.category || filters.priority || filters.province || filters.workflowStatus || filters.manualTag || filters.sourceType || filters.startDate || filters.endDate || filters.dateRange !== "all";

  const clearFilters = () => {
    setFilters({ search: "", sourceId: undefined, sourceName: undefined, sourceCategory: undefined, sentiment: undefined, category: undefined, priority: undefined, province: undefined, workflowStatus: undefined, manualTag: undefined, sourceType: undefined, startDate: undefined, endDate: undefined, dateRange: "all", sort: DEFAULT_SORT });
    setSearchInput("");
    setActiveSavedViewId(undefined);
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
    const scopedSources = officialSourcesOnly
      ? sources.filter((s: any) => OFFICIAL_SOURCE_CATEGORY_CODES.includes(s.category))
      : sources;
    return new Set(scopedSources.map((s: any) => s.type));
  }, [officialSourcesOnly, sources]);

  const visibleChannels = CHANNEL_CONFIG.filter(
    ch => ch.key === "all" || activeChannelTypes.has(ch.key)
  );

  const uniqueSourceNames = useMemo(() => {
    if (!sources) return [];
    const scopedSources = officialSourcesOnly
      ? sources.filter((s: any) => OFFICIAL_SOURCE_CATEGORY_CODES.includes(s.category))
      : sources;
    const names = new Set(scopedSources.map((s: any) => s.name));
    return Array.from(names).sort();
  }, [officialSourcesOnly, sources]);

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

  const activeSavedView = savedViews.find((view) => String(view.id) === activeSavedViewId);
  const canManageSavedViews = hasCap(CAPS.FEED_FILTER);
  const canEditArticles = hasCap(CAPS.ARTICLE_EDIT);
  const canExportArticles = hasCap(CAPS.ARTICLE_EXPORT);
  const canRunIntelligence = hasCap(CAPS.INTELLIGENCE_RUN);
  const canDeleteArticles = isAdmin;
  const canSelectArticles = canEditArticles || canDeleteArticles;
  const hasBulkWorkflowAction = bulkWorkflowStatus !== "skip" || bulkCategory !== "skip" || bulkPriority !== "skip" || bulkProvince !== "skip" || bulkTagsInput.trim().length > 0;

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeBrowseNavigation = Boolean(filters.category || filters.sourceCategory || filters.sourceId || filters.sourceName || filters.province);

  const activeFilterCount = [
    filters.sourceType,
    filters.sourceCategory,
    filters.sentiment,
    filters.priority,
    filters.workflowStatus,
    filters.manualTag,
    filters.startDate || filters.endDate,
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

  const primaryArticleCategoryNav = [
    { code: "iraqi_government", label: "Government" },
    { code: "parliament_politics", label: "Politics" },
    { code: "security_stability", label: "Security" },
    { code: "economy_oil_finance", label: "Economy" },
    { code: "development_services", label: "Services" },
    { code: "regional_international_relations", label: "International" },
    { code: "client_bilateral_relations", label: "Bilateral" },
  ];
  const primaryOfficialCategoryNav = [
    { code: "official_presidency", label: "Presidency" },
    { code: "official_prime_minister", label: "Prime Minister" },
    { code: "official_council_ministers", label: "Council" },
    { code: "official_ministry", label: "Ministries" },
    { code: "official_parliament", label: "Parliament" },
    { code: "official_security", label: "Security" },
    { code: "official_economy", label: "Central Bank" },
  ];
  const primaryCategoryNav = officialSourcesOnly ? primaryOfficialCategoryNav : primaryArticleCategoryNav;
  const primaryCategoryCodes = new Set(primaryCategoryNav.map((item) => item.code));
  const secondaryCategoryNav = officialSourcesOnly
    ? OFFICIAL_SOURCE_CATEGORIES.filter((category) => !primaryCategoryCodes.has(category.code))
    : ARTICLE_CATEGORIES.filter((category) => !primaryCategoryCodes.has(category.code));

  const navLinkClass = (active: boolean) => cn(
    "relative flex h-11 shrink-0 items-center px-3 text-sm font-semibold transition-colors",
    "text-muted-foreground hover:text-foreground",
    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity",
    active && "text-foreground after:opacity-100"
  );

  const navMenuTriggerClass = (active: boolean) => cn(
    navLinkClass(active),
    "gap-1 rounded-none bg-transparent hover:bg-transparent focus:bg-transparent"
  );

  const navMenuItemClass = (active: boolean) => cn(
    "gap-3",
    active && "bg-accent text-accent-foreground font-medium"
  );

  const browseNavigation = (
    <nav
      className="border-y border-border/70 bg-background"
      data-testid="feed-browse-navigation"
      aria-label="Feed browse navigation"
    >
      <div className="flex min-w-0 items-center overflow-x-auto">
        <button
          type="button"
          className={navLinkClass(!activeBrowseNavigation)}
          onClick={clearBrowseNavigation}
          data-testid="button-browse-home"
        >
          Home
        </button>

        {primaryCategoryNav.map((item) => (
          <button
            key={item.code}
            type="button"
            className={navLinkClass((officialSourcesOnly ? filters.sourceCategory : filters.category) === item.code)}
            onClick={() => updateBrowseFilter(officialSourcesOnly ? "sourceCategory" : "category", item.code)}
            data-testid={`button-nav-category-${item.code}`}
          >
            {item.label}
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={navMenuTriggerClass(Boolean(
                (officialSourcesOnly ? filters.sourceCategory : filters.category) &&
                !primaryCategoryCodes.has((officialSourcesOnly ? filters.sourceCategory : filters.category)!)
              ))}
              data-testid="menu-browse-more-sections"
            >
              More
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Sections</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {secondaryCategoryNav.map(category => (
              <DropdownMenuItem
                key={category.code}
                className={navMenuItemClass((officialSourcesOnly ? filters.sourceCategory : filters.category) === category.code)}
                onSelect={() => updateBrowseFilter(officialSourcesOnly ? "sourceCategory" : "category", category.code)}
                data-testid={`menu-item-category-${category.code}`}
              >
                <span className="truncate">
                  {officialSourcesOnly ? getSourceCategoryLabel(category.code) : getArticleCategoryLabel(category.code, embassyProfile)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex shrink-0 items-center border-l border-border/70 pl-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={navMenuTriggerClass(Boolean(filters.sourceName))}
                data-testid="menu-browse-sources"
              >
                Sources
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(70vh,460px)] w-80">
              <DropdownMenuLabel>Sources</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={navMenuItemClass(!filters.sourceName)}
                onSelect={() => updateBrowseFilter("sourceName", undefined)}
                data-testid="menu-item-source-all"
              >
                All sources
              </DropdownMenuItem>
              {uniqueSourceNames.length === 0 ? (
                <DropdownMenuItem disabled>No sources loaded</DropdownMenuItem>
              ) : uniqueSourceNames.map(name => (
                <DropdownMenuItem
                  key={name}
                  className={navMenuItemClass(filters.sourceName === name)}
                  onSelect={() => updateBrowseFilter("sourceName", name)}
                  data-testid={`menu-item-source-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                >
                  <span className="truncate">{name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={navMenuTriggerClass(Boolean(filters.province))}
                data-testid="menu-browse-cities"
              >
                Cities
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Cities</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={navMenuItemClass(!filters.province)}
                onSelect={() => updateBrowseFilter("province", undefined)}
                data-testid="menu-item-city-all"
              >
                All cities
              </DropdownMenuItem>
              {IRAQ_PROVINCES.map(province => (
                <DropdownMenuItem
                  key={province.code}
                  className={navMenuItemClass(filters.province === province.code)}
                  onSelect={() => updateBrowseFilter("province", province.code)}
                  data-testid={`menu-item-city-${province.code}`}
                >
                  {province.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );

  const savedViewsControl = canManageSavedViews ? (
    <div className="flex w-full min-w-0 items-center gap-1 md:w-[260px]" data-testid="saved-feed-views-control">
      <Select
        value={activeSavedViewId || "none"}
        onValueChange={(val) => {
          if (val === "none") {
            setActiveSavedViewId(undefined);
            return;
          }
          const view = savedViews.find((item) => String(item.id) === val);
          if (view) applySavedView(view);
        }}
      >
        <SelectTrigger className="h-9 min-w-0 flex-1 bg-background" data-testid="select-saved-feed-view">
          <SelectValue placeholder="Saved views" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Saved views</SelectItem>
          {savedViews.map((view) => (
            <SelectItem key={view.id} value={String(view.id)}>
              {view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={saveViewOpen}
        onOpenChange={(open) => {
          setSaveViewOpen(open);
          if (open) setViewName(activeSavedView?.name || "");
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Save view" data-testid="button-open-save-feed-view">
            <BookmarkPlus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save feed view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="saved-feed-view-name">Name</Label>
            <Input
              id="saved-feed-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Baghdad security"
              data-testid="input-saved-feed-view-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewOpen(false)} data-testid="button-cancel-save-feed-view">
              Cancel
            </Button>
            <Button
              onClick={() => saveViewMutation.mutate(viewName.trim())}
              disabled={saveViewMutation.isPending || viewName.trim().length < 2}
              data-testid="button-save-feed-view"
            >
              {saveViewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeSavedView ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Delete saved view"
          onClick={() => {
            if (window.confirm(`Delete saved view "${activeSavedView.name}"?`)) {
              deleteViewMutation.mutate(activeSavedView.id);
            }
          }}
          disabled={deleteViewMutation.isPending}
          data-testid="button-delete-saved-feed-view"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  ) : null;

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
        value={filters.priority || "all"}
        onValueChange={(val) => updateFilter("priority", val === "all" ? undefined : val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-priority">
          <SelectValue placeholder="All Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          {ARTICLE_PRIORITIES.map(priority => (
            <SelectItem key={priority.code} value={priority.code}>
              {priority.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.workflowStatus || "all"}
        onValueChange={(val) => updateFilter("workflowStatus", val === "all" ? undefined : val)}
      >
        <SelectTrigger className="h-9 w-full min-w-0 flex-1 basis-0 bg-background" data-testid="select-filter-workflow-status">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {ARTICLE_WORKFLOW_STATUSES.map(status => (
            <SelectItem key={status.code} value={status.code}>
              {status.label}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant={layout === "grid" ? "default" : "ghost"}
                  data-testid="button-layout-grid"
                  title="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-0 p-1" data-testid="grid-density-menu">
                {GRID_COLUMN_OPTIONS.map((columns) => (
                  <DropdownMenuItem
                    key={columns}
                    className={cn(
                      "flex h-9 w-11 cursor-pointer items-center justify-center rounded-md p-0",
                      gridColumns === columns && layout === "grid" && "bg-accent text-accent-foreground"
                    )}
                    onSelect={() => {
                      setLayout("grid");
                      setGridColumns(columns);
                      localStorage.setItem("feed-layout-v2", "grid");
                      localStorage.setItem("feed-grid-columns-v1", String(columns));
                    }}
                    data-testid={`menu-grid-columns-${columns}`}
                    title={`${columns} cards per row`}
                    aria-label={`${columns} cards per row`}
                  >
                    <GridDensityIcon columns={columns} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              variant={layout === "list" ? "default" : "ghost"}
              onClick={() => { setLayout("list"); localStorage.setItem("feed-layout-v2", "list"); }}
              data-testid="button-layout-list"
              title="List view"
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
            {canSelectArticles && allArticles.length > 0 && (
              <Button
                variant={selectedArticles.size > 0 ? "default" : "ghost"}
                size="icon"
                onClick={selectAllVisible}
                data-testid="button-select-visible-articles"
                title={selectedArticles.size === allArticles.length ? "Clear selection" : "Select visible articles"}
              >
                <CheckSquare className="w-4 h-4" />
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

      {browseNavigation}

      {pendingNewCount > 0 && liveUpdateMode === "notify" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm" data-testid="banner-new-articles">
          <div className="flex min-w-0 items-center gap-2 text-primary">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium">
              {pendingNewCount === 1 ? "1 new article available" : `${pendingNewCount} new articles available`}
            </span>
          </div>
          <Button size="sm" onClick={loadNewestArticles} data-testid="button-load-new-articles">
            Load newest
          </Button>
        </div>
      )}

      {mobileSearchOpen && (
        <div className="md:hidden" data-testid="mobile-search-panel">
          {searchBar}
        </div>
      )}

      {mobileFiltersOpen && (
        <div className="md:hidden space-y-2" data-testid="mobile-filters-panel">
          {savedViewsControl}
          <div className="grid grid-cols-2 gap-2">
            {filterDropdowns}
          </div>
        </div>
      )}

      <div className="hidden md:block">
        <div className="flex w-full flex-wrap items-center gap-2">
          {savedViewsControl}
          {filterDropdowns}
        </div>
      </div>

      <div className="min-w-0">
            {isLoadingArticles && page === 1 ? (
              <div className={cn(
                layout === "grid" ? "grid gap-4 md:gap-5" : "flex flex-col gap-4",
                layout === "grid" && gridColumnClass(gridColumns)
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
                  layout === "grid" ? "grid gap-4 md:gap-5" : "flex flex-col gap-4",
                  layout === "grid" && gridColumnClass(gridColumns)
                )}>
                  {allArticles.map((article: any) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      selected={selectedArticles.has(article.id)}
                      onToggleSelect={canSelectArticles ? toggleSelectArticle : undefined}
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
        </div>

      {canSelectArticles && selectedArticles.size > 0 && (
        <div
          className="fixed bottom-4 left-3 right-3 z-50 mx-auto max-w-6xl rounded-md border border-border bg-card px-3 py-3 shadow-lg"
          data-testid="bulk-actions-bar"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="h-9 shrink-0 px-3">{selectedArticles.size} {t("feed.selected")}</Badge>

            {canEditArticles && (
              <>
                <Select value={bulkWorkflowStatus} onValueChange={setBulkWorkflowStatus}>
                  <SelectTrigger className="h-9 w-[145px] bg-background" data-testid="select-bulk-workflow">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Keep status</SelectItem>
                    {ARTICLE_WORKFLOW_STATUSES.map(status => (
                      <SelectItem key={status.code} value={status.code}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="h-9 w-[170px] bg-background" data-testid="select-bulk-category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Keep category</SelectItem>
                    {ARTICLE_CATEGORIES.map(category => (
                      <SelectItem key={category.code} value={category.code}>{getArticleCategoryLabel(category.code, embassyProfile)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bulkPriority} onValueChange={setBulkPriority}>
                  <SelectTrigger className="h-9 w-[150px] bg-background" data-testid="select-bulk-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Keep priority</SelectItem>
                    {ARTICLE_PRIORITIES.map(priority => (
                      <SelectItem key={priority.code} value={priority.code}>{priority.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bulkProvince} onValueChange={setBulkProvince}>
                  <SelectTrigger className="h-9 w-[155px] bg-background" data-testid="select-bulk-province">
                    <SelectValue placeholder="Province" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Keep province</SelectItem>
                    <SelectItem value="none">No province</SelectItem>
                    {IRAQ_PROVINCES.map(province => (
                      <SelectItem key={province.code} value={province.code}>{province.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={bulkTagsInput}
                  onChange={(event) => setBulkTagsInput(event.target.value)}
                  placeholder="Tags"
                  className="h-9 w-[180px] bg-background"
                  data-testid="input-bulk-tags"
                />

                <Button
                  size="sm"
                  onClick={() => bulkWorkflowMutation.mutate()}
                  disabled={bulkWorkflowMutation.isPending || !hasBulkWorkflowAction}
                  data-testid="button-apply-bulk-workflow"
                >
                  {bulkWorkflowMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Apply
                </Button>
              </>
            )}

            {canDeleteArticles && (
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
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedArticles(new Set()); resetBulkControls(); }}
              data-testid="button-clear-selection"
            >
              {t("feed.clearSelection")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
