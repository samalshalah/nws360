import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Calendar, Newspaper, Rss, Globe, Send, Youtube, Facebook, Instagram, Twitter, Bookmark, Share2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { type Article, type Source } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArticleDetailDialog } from "@/components/articles/ArticleDetailDialog";

interface ArticleCardProps {
  article: Article & { source: Source | null };
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  layout?: "grid" | "list";
}

const sourceTypeIcons: Record<string, typeof Rss> = {
  rss: Rss,
  website: Globe,
  twitter: Twitter,
  youtube: Youtube,
  facebook: Facebook,
  instagram: Instagram,
  telegram: Send,
  google_news: Search,
};

const platformIcons: Record<string, { icon: typeof Rss; label: string; color: string }> = {
  facebook: { icon: Facebook, label: "Facebook", color: "text-blue-600 dark:text-blue-400" },
  twitter: { icon: Twitter, label: "X / Twitter", color: "text-sky-500 dark:text-sky-400" },
  youtube: { icon: Youtube, label: "YouTube", color: "text-red-600 dark:text-red-400" },
  instagram: { icon: Instagram, label: "Instagram", color: "text-pink-600 dark:text-pink-400" },
  telegram: { icon: Send, label: "Telegram", color: "text-blue-500 dark:text-blue-300" },
  google_news: { icon: Search, label: "Google News", color: "text-green-600 dark:text-green-400" },
  reddit: { icon: Globe, label: "Reddit", color: "text-orange-600 dark:text-orange-400" },
  linkedin: { icon: Globe, label: "LinkedIn", color: "text-blue-700 dark:text-blue-300" },
  web: { icon: Globe, label: "Web", color: "text-muted-foreground" },
};

const categoryColors: Record<string, string> = {
  political: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  health: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  tech: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  sports: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  business: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  entertainment: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800",
  science: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800",
  urgent: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  general: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

function getSubSourceFaviconUrl(subSource: string): string | null {
  const known: Record<string, string> = {
    "CNN": "cnn.com", "NBC News": "nbcnews.com", "The New York Times": "nytimes.com",
    "The Guardian": "theguardian.com", "Politico": "politico.com", "Fox News": "foxnews.com",
    "ABC News": "abcnews.go.com", "Bloomberg": "bloomberg.com", "Reuters": "reuters.com",
    "AP News": "apnews.com", "BBC": "bbc.com", "BBC News": "bbc.com", "NPR": "npr.org",
    "Forbes": "forbes.com", "TechCrunch": "techcrunch.com", "The Verge": "theverge.com",
    "Al Jazeera": "aljazeera.com", "CNBC": "cnbc.com", "Axios": "axios.com",
  };
  const domain = known[subSource] || (subSource.includes(".") ? subSource.toLowerCase() : null);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
}

export function ArticleCard({ article, selected, onToggleSelect, layout = "grid" }: ArticleCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [imgError, setImgError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: bookmarkedIds = [] } = useQuery<number[]>({
    queryKey: ["/api/bookmarks"],
  });

  const isBookmarked = bookmarkedIds.includes(article.id);

  const addBookmark = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bookmarks", { articleId: article.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/articles"] });
    },
  });

  const removeBookmark = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/bookmarks/${article.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/articles"] });
    },
  });

  const handleBookmarkToggle = () => {
    if (isBookmarked) {
      removeBookmark.mutate();
    } else {
      addBookmark.mutate();
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(article.url || "").then(() => {
      toast({ title: t("feed.linkCopied") });
    });
  };

  const sentimentColor = {
    positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    neutral: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  }[article.sentimentLabel || "neutral"];

  const SourceIcon = sourceTypeIcons[article.source?.type || "rss"] || Newspaper;
  const displayContent = article.summary || article.content.substring(0, 150) + "...";
  const articleCategory = (article as any).category || "general";
  const hasImage = article.imageUrl && article.imageUrl !== "none" && !imgError;
  const sourceLogoUrl = article.source?.logoUrl || null;
  const subSourceFavicon = article.subSource ? getSubSourceFaviconUrl(article.subSource) : null;
  const faviconUrl = subSourceFavicon || sourceLogoUrl;
  const crossPosts = (Array.isArray((article as any).crossPosts) ? (article as any).crossPosts : []) as { platform: string; url: string; sourceId: number }[];

  const sentimentBadge = article.sentimentLabel ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); setLocation(`/feed?sentiment=${article.sentimentLabel}`); }}
          data-testid={`badge-sentiment-${article.id}`}
        >
          <Badge variant="outline" className={cn("capitalize text-xs cursor-pointer", sentimentColor)}>
            {article.sentimentLabel === "positive" ? t("feed.positive") : 
             article.sentimentLabel === "negative" ? t("feed.negative") : 
             t("feed.neutral")}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
        {t("feed.sentimentTooltip")}
      </TooltipContent>
    </Tooltip>
  ) : null;

  const categoryBadge = articleCategory && articleCategory !== "general" ? (
    <button
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?category=${articleCategory}`); }}
      data-testid={`badge-category-${article.id}`}
    >
      <Badge variant="outline" className={cn("text-xs capitalize cursor-pointer", categoryColors[articleCategory] || categoryColors.general)}>
        {t(`feed.categories.${articleCategory}`)}
      </Badge>
    </button>
  ) : null;

  const sourceInfo = (
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
      <SourceIcon className="w-3.5 h-3.5" />
      {article.subSource ? (
        <>
          <span className="font-semibold text-foreground/80" data-testid={`text-subsource-${article.id}`}>{article.subSource}</span>
          <span className="text-muted-foreground/40" data-testid={`text-via-${article.id}`}>{t("common.via")}</span>
          <button
            className="hover:text-primary hover:underline transition-colors cursor-pointer"
            onClick={(e) => { e.stopPropagation(); if (article.sourceId) setLocation(`/feed?sourceId=${article.sourceId}`); }}
            data-testid={`text-source-${article.id}`}
          >{article.source?.name || t("common.noResults")}</button>
        </>
      ) : (
        <button
          className="hover:text-primary hover:underline transition-colors cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (article.sourceId) setLocation(`/feed?sourceId=${article.sourceId}`); }}
          data-testid={`text-source-${article.id}`}
        >{article.source?.name || t("common.noResults")}</button>
      )}
      <span className="text-muted-foreground/60">
        {article.source?.type ? t(`feed.sourceTypes.${article.source.type}`) : ""}
      </span>
    </div>
  );

  const actionButtons = (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); handleBookmarkToggle(); }}
        title={isBookmarked ? t("feed.unbookmark") : t("feed.bookmark")}
        data-testid={`button-bookmark-${article.id}`}
      >
        <Bookmark className={cn("w-4 h-4", isBookmarked ? "fill-primary text-primary" : "text-muted-foreground")} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); handleShare(); }}
        title={t("feed.share")}
        data-testid={`button-share-${article.id}`}
      >
        <Share2 className="w-4 h-4 text-muted-foreground" />
      </Button>
      <a
        href={article.url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        data-testid={`link-read-article-${article.id}`}
      >
        {t("feed.readFullStory")}
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );

  const timeInfo = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Calendar className="w-3.5 h-3.5" />
      {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : t("common.recently")}
    </div>
  );

  const crossPostIcons = crossPosts.length > 0 ? (
    <div className="flex items-center gap-0.5" data-testid={`cross-posts-${article.id}`}>
      <span className="text-[10px] text-muted-foreground/60 mr-0.5">{t("feed.alsoOn", "Also on")}</span>
      {crossPosts.map((cp, idx) => {
        const pi = platformIcons[cp.platform];
        if (!pi) return null;
        const PIcon = pi.icon;
        return (
          <a
            key={idx}
            href={cp.url}
            target="_blank"
            rel="noopener noreferrer"
            title={pi.label}
            onClick={(e) => e.stopPropagation()}
            className={cn("p-1 rounded-md transition-colors hover-elevate", pi.color)}
            data-testid={`cross-post-${cp.platform}-${article.id}`}
          >
            <PIcon className="w-3.5 h-3.5" />
          </a>
        );
      })}
    </div>
  ) : null;

  const selectCheckbox = onToggleSelect ? (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleSelect(article.id); }}
      className={cn(
        "absolute top-3 left-3 rtl:left-auto rtl:right-3 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
        selected ? "bg-primary border-primary text-primary-foreground" : "bg-background/80 border-muted-foreground/40"
      )}
      data-testid={`checkbox-article-${article.id}`}
    >
      {selected && <span className="text-xs font-bold">&#10003;</span>}
    </button>
  ) : null;

  const articleDialog = (
    <ArticleDetailDialog
      article={article}
      open={detailOpen}
      isBookmarked={isBookmarked}
      onOpenChange={setDetailOpen}
      onBookmark={handleBookmarkToggle}
      onShare={handleShare}
    />
  );

  if (layout === "list") {
    return (
      <>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
        className={cn(
          "bg-card border rounded-md shadow-sm hover:shadow-md transition-all duration-200 group flex relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected ? "border-primary ring-1 ring-primary/30" : "border-border/50"
        )}
        data-testid={`card-article-${article.id}`}
      >
        {selectCheckbox}
        {hasImage ? (
          <div className="relative w-40 min-h-[120px] shrink-0 overflow-hidden bg-muted rounded-l-md" data-testid={`img-article-${article.id}`}>
            <img
              src={article.imageUrl!}
              alt={article.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div className="relative w-40 min-h-[120px] shrink-0 overflow-hidden bg-gradient-to-br from-muted to-muted/60 rounded-l-md flex items-center justify-center" data-testid={`favicon-article-${article.id}`}>
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt={article.subSource || article.source?.name || ""}
                className="w-8 h-8 rounded-md"
                loading="lazy"
              />
            ) : (
              <SourceIcon className="w-8 h-8 text-muted-foreground/30" />
            )}
          </div>
        )}
        <div className="flex flex-col flex-1 p-4 gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {sourceInfo}
            <div className="flex items-center gap-1.5 flex-wrap">
              {categoryBadge}
              {sentimentBadge}
            </div>
          </div>
          <h3 className="text-sm font-bold font-display text-foreground leading-snug group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 flex-1">
            {displayContent}
          </p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              {timeInfo}
              {crossPostIcons}
            </div>
            {actionButtons}
          </div>
        </div>
      </motion.div>
      {articleDialog}
      </>
    );
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      role="button"
      tabIndex={0}
      onClick={() => setDetailOpen(true)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setDetailOpen(true);
        }
      }}
      className={cn(
        "bg-card border rounded-md overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group flex flex-col relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border/50"
      )}
      data-testid={`card-article-${article.id}`}
    >
      {selectCheckbox}
      {hasImage ? (
        <div className="relative w-full h-48 overflow-hidden bg-muted" data-testid={`img-article-${article.id}`}>
          <img
            src={article.imageUrl!}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="relative w-full h-48 overflow-hidden bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center gap-3" data-testid={`favicon-article-${article.id}`}>
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt={article.subSource || article.source?.name || ""}
              className="w-12 h-12 rounded-md"
              loading="lazy"
            />
          ) : (
            <SourceIcon className="w-10 h-10 text-muted-foreground/30" />
          )}
          <span className="text-sm font-semibold text-muted-foreground/50">{article.subSource || article.source?.name}</span>
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
          {sourceInfo}
          <div className="flex items-center gap-1.5 flex-wrap">
            {categoryBadge}
            {sentimentBadge}
          </div>
        </div>

        <h3 className="text-sm font-bold font-display text-foreground leading-snug mb-3 group-hover:text-primary transition-colors">
          {article.title}
        </h3>

        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-6 flex-1">
          {displayContent}
        </p>

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/50 flex-wrap">
          <div className="flex items-center gap-3">
            {timeInfo}
            {crossPostIcons}
          </div>
          {actionButtons}
        </div>
      </div>
    </motion.div>
    {articleDialog}
    </>
  );
}
