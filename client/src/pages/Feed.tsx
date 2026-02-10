import { useState } from "react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

const CATEGORIES = ["political", "health", "tech", "sports", "business", "entertainment", "science", "urgent", "general"] as const;
const SOURCE_TYPES = ["rss", "website", "twitter", "youtube", "facebook", "instagram", "telegram"] as const;

export default function Feed() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.split("-")[0] || "en";
  const [filters, setFilters] = useState({
    search: "",
    sourceId: undefined as string | undefined,
    sentiment: undefined as string | undefined,
    category: undefined as string | undefined,
    sourceType: undefined as string | undefined,
  });

  const { data: articles, isLoading: isLoadingArticles, isFetching } = useArticles({
    search: filters.search,
    sourceId: filters.sourceId ? parseInt(filters.sourceId) : undefined,
    sentiment: filters.sentiment,
    category: filters.category,
    sourceType: filters.sourceType,
    lang: currentLang,
  });

  const { data: sources } = useSources();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-feed-title">{t("feed.title")}</h1>
          {isFetching && currentLang !== "en" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("feed.translating")}
            </div>
          )}
        </div>
        <p className="text-muted-foreground">{t("feed.subtitle")}</p>
      </div>

      <div className="bg-card p-4 rounded-md border border-border/50 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder={t("feed.searchPlaceholder")}
              className="ltr:pl-10 rtl:pr-10 h-11 bg-background"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              data-testid="input-search-articles"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Select 
            value={filters.sourceId} 
            onValueChange={(val) => setFilters(prev => ({ ...prev, sourceId: val === "all" ? undefined : val }))}
          >
            <SelectTrigger className="w-[160px] h-9 bg-background" data-testid="select-filter-source">
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
            onValueChange={(val) => setFilters(prev => ({ ...prev, sourceType: val === "all" ? undefined : val }))}
          >
            <SelectTrigger className="w-[160px] h-9 bg-background" data-testid="select-filter-source-type">
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
            onValueChange={(val) => setFilters(prev => ({ ...prev, sentiment: val === "all" ? undefined : val }))}
          >
            <SelectTrigger className="w-[150px] h-9 bg-background" data-testid="select-filter-sentiment">
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
            onValueChange={(val) => setFilters(prev => ({ ...prev, category: val === "all" ? undefined : val }))}
          >
            <SelectTrigger className="w-[170px] h-9 bg-background" data-testid="select-filter-category">
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
        </div>
      </div>

      {isLoadingArticles ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-md" />
          ))}
        </div>
      ) : articles?.items.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-md border border-dashed border-border">
          <SlidersHorizontal className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold font-display text-foreground">{t("feed.noArticles")}</h3>
          <p className="text-muted-foreground mt-2">{t("feed.noArticlesHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles?.items.map((article: any) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
