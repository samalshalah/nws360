import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useArticles } from "@/hooks/use-articles";
import { FeedCard } from "@/components/articles/FeedCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useFilters } from "@/contexts/FilterContext";
import { useFetchAllSources } from "@/hooks/use-sources";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const SENTIMENTS = ["positive", "neutral", "negative"] as const;
const DATE_RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
] as const;

export default function HomePage() {
  const { filters, setFilter, resetFilters, hasActiveFilters } = useFilters();
  const [page, setPage] = useState(1);
  const [allArticles, setAllArticles] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);
  const fetchAll = useFetchAllSources();

  const dateParams = useMemo(() => {
    const now = new Date();
    if (filters.dateRange === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (filters.dateRange === "week") {
      const start = new Date(now); start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (filters.dateRange === "month") {
      const start = new Date(now); start.setMonth(start.getMonth() - 1);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    return {};
  }, [filters.dateRange]);

  const { data, isLoading } = useArticles({
    search: filters.search || undefined,
    sentiment: filters.sentiment || undefined,
    category: filters.category || undefined,
    sourceType: filters.sourceType || undefined,
    sourceId: filters.sourceId ? Number(filters.sourceId) : undefined,
    page,
    limit: PAGE_SIZE,
    ...dateParams,
  });

  useEffect(() => {
    if (!data) return;
    const articles = Array.isArray(data) ? data : (data as any).items || (data as any).articles || [];
    if (page === 1) {
      setAllArticles(articles);
    } else {
      setAllArticles(prev => {
        const ids = new Set(prev.map((a: any) => a.id));
        return [...prev, ...articles.filter((a: any) => !ids.has(a.id))];
      });
    }
    setHasMore(articles.length >= PAGE_SIZE);
  }, [data, page]);

  useEffect(() => {
    setPage(1);
    setAllArticles([]);
    setHasMore(true);
  }, [filters]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) setPage(p => p + 1);
  }, [hasMore, isLoading]);

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">Live Feed</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchAll.mutate()}
            disabled={fetchAll.isPending}
            data-testid="button-refresh-feeds"
          >
            <RefreshCw className={cn("w-4 h-4", fetchAll.isPending && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "toggle-elevate toggle-elevated")}
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search articles..."
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Select
            value={filters.sentiment || "all"}
            onValueChange={(v) => setFilter("sentiment", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-32" data-testid="select-sentiment">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tones</SelectItem>
              {SENTIMENTS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.dateRange}
            onValueChange={(v) => setFilter("dateRange", v as any)}
          >
            <SelectTrigger className="w-32" data-testid="select-date-range">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-clear-filters">
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {filters.sentiment && (
            <Badge variant="secondary" className="text-xs capitalize gap-1" data-testid="badge-active-sentiment">
              {filters.sentiment}
              <button onClick={() => setFilter("sentiment", undefined)}><X className="w-3 h-3" /></button>
            </Badge>
          )}
          {filters.dateRange !== "all" && (
            <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-active-date">
              {filters.dateRange}
              <button onClick={() => setFilter("dateRange", "all")}><X className="w-3 h-3" /></button>
            </Badge>
          )}
        </div>
      )}

      {isLoading && page === 1 ? (
        <div className="space-y-4" data-testid="loading-skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b border-border/50 py-4 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : allArticles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm" data-testid="text-no-results">No articles found. Try adjusting your filters or add some sources.</p>
        </div>
      ) : (
        <div data-testid="article-feed">
          {allArticles.map((article: any) => (
            <FeedCard key={article.id} article={article} />
          ))}
          {hasMore && (
            <div ref={observerRef} className="py-4 flex justify-center">
              {isLoading && <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
