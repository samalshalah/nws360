import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Calendar, Newspaper, Rss, Globe, Send, Youtube, Facebook, Instagram, Twitter, Bookmark, Share2, Search, CheckCircle2, MapPin, Tag } from "lucide-react";
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
import { getArticleCategoryLabel, getArticlePriorityLabel, getArticleWorkflowStatusLabel, getIraqProvinceLabel } from "@shared/article-taxonomy";
import { useEmbassyProfile } from "@/hooks/use-embassy-profile";

interface ArticleCardProps {
  article: Article & { source: Source | null; sourceChannelName?: string | null };
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  layout?: "grid" | "list" | "headline" | "compact";
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

function sourceTypeToPlatform(type: string | null | undefined): string {
  if (type === "facebook" || type === "twitter" || type === "youtube" || type === "instagram" || type === "telegram" || type === "google_news") {
    return type;
  }
  return "web";
}

const categoryColors: Record<string, string> = {
  iraqi_government: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
  parliament_politics: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
  security_stability: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  economy_oil_finance: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  development_services: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800",
  justice_accountability: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  kurdistan_region: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
  civil_society_humanitarian: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  united_nations: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  client_bilateral_relations: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
  regional_international_relations: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  media_narratives: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  other: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

const priorityColors: Record<string, string> = {
  important: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  urgent: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  critical: "bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-500",
  routine: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

const workflowColors: Record<string, string> = {
  reviewed: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  important: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  irrelevant: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  for_report: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  archived: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800",
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

function displayChannelName(value: string | null | undefined): string | null {
  const cleaned = String(value || "")
    .replace(/\s*\/\s*(Twitter|X|Facebook|Instagram|Telegram)\s*$/i, "")
    .replace(/\s*\(@[^)]*\)\s*/g, " ")
    .replace(/\b(Page|Feed|Official)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : cleaned;
}

export function ArticleCard({ article, selected, onToggleSelect, layout = "grid" }: ArticleCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const embassyProfile = useEmbassyProfile();
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
  const articleCategory = (article as any).category || "other";
  const articlePriority = (article as any).priority || "routine";
  const articleWorkflowStatus = (article as any).workflowStatus || "new";
  const articleProvince = (article as any).province as string | null | undefined;
  const manualTags = (Array.isArray((article as any).manualTags) ? (article as any).manualTags : []) as string[];
  const hasImage = article.imageUrl && article.imageUrl !== "none" && !imgError;
  const sourceLogoUrl = article.source?.logoUrl || null;
  const channelName = displayChannelName(article.sourceChannelName || article.source?.name);
  const publisherFeedName = article.source?.name || null;
  const subSourceFavicon = article.subSource ? getSubSourceFaviconUrl(article.subSource) : null;
  const faviconUrl = subSourceFavicon || sourceLogoUrl;
  const crossPosts = (Array.isArray((article as any).crossPosts) ? (article as any).crossPosts : []) as { platform: string; url: string; sourceId: number; sourceName?: string | null }[];
  const channelLinks = [
    {
      platform: sourceTypeToPlatform(article.source?.type),
      url: article.url || "",
      sourceId: article.sourceId || 0,
      sourceName: channelName,
      primary: true,
    },
    ...crossPosts.map((post) => ({ ...post, primary: false })),
  ].filter((item, index, list) => item.url && list.findIndex((candidate) => candidate.url === item.url) === index);

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

  const categoryBadge = articleCategory && articleCategory !== "other" ? (
    <button
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?category=${articleCategory}`); }}
      data-testid={`badge-category-${article.id}`}
        >
          <Badge variant="outline" className={cn("text-xs cursor-pointer", categoryColors[articleCategory] || categoryColors.other)}>
            {getArticleCategoryLabel(articleCategory, embassyProfile)}
          </Badge>
        </button>
  ) : null;

  const priorityBadge = articlePriority && articlePriority !== "routine" ? (
    <button
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?priority=${articlePriority}`); }}
      data-testid={`badge-priority-${article.id}`}
    >
      <Badge variant="outline" className={cn("text-xs cursor-pointer", priorityColors[articlePriority] || priorityColors.routine)}>
        {getArticlePriorityLabel(articlePriority)}
      </Badge>
    </button>
  ) : null;

  const workflowBadge = articleWorkflowStatus && articleWorkflowStatus !== "new" ? (
    <button
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?workflowStatus=${articleWorkflowStatus}`); }}
      data-testid={`badge-workflow-${article.id}`}
    >
      <Badge variant="outline" className={cn("text-xs cursor-pointer", workflowColors[articleWorkflowStatus] || workflowColors.reviewed)}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {getArticleWorkflowStatusLabel(articleWorkflowStatus)}
      </Badge>
    </button>
  ) : null;

  const provinceBadge = articleProvince ? (
    <button
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?province=${articleProvince}`); }}
      data-testid={`badge-province-${article.id}`}
    >
      <Badge variant="outline" className="cursor-pointer text-xs">
        <MapPin className="mr-1 h-3 w-3" />
        {getIraqProvinceLabel(articleProvince)}
      </Badge>
    </button>
  ) : null;

  const manualTagBadges = manualTags.slice(0, 2).map((tag) => (
    <button
      key={tag}
      onClick={(e) => { e.stopPropagation(); setLocation(`/feed?manualTag=${encodeURIComponent(tag)}`); }}
      data-testid={`badge-manual-tag-${article.id}-${tag}`}
    >
      <Badge variant="secondary" className="cursor-pointer text-xs font-normal">
        <Tag className="mr-1 h-3 w-3" />
        {tag}
      </Badge>
    </button>
  ));

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
            title={publisherFeedName || undefined}
          >{channelName || t("common.noResults")}</button>
        </>
      ) : (
        <button
          className="hover:text-primary hover:underline transition-colors cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (article.sourceId) setLocation(`/feed?sourceId=${article.sourceId}`); }}
          data-testid={`text-source-${article.id}`}
          title={publisherFeedName || undefined}
        >{channelName || t("common.noResults")}</button>
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

  const crossPostIcons = channelLinks.length > 1 ? (
    <div className="flex items-center gap-0.5" data-testid={`cross-posts-${article.id}`}>
      <span className="mr-0.5 text-[10px] text-muted-foreground/60">{t("feed.channels", "Channels")}</span>
      {channelLinks.map((cp, idx) => {
        const pi = platformIcons[cp.platform] || platformIcons.web;
        if (!pi) return null;
        const PIcon = pi.icon;
        const cpLabel = displayChannelName(cp.sourceName);
        return (
          <a
            key={idx}
            href={cp.url}
            target="_blank"
            rel="noopener noreferrer"
            title={cpLabel ? `${cpLabel} (${pi.label})` : pi.label}
            onClick={(e) => e.stopPropagation()}
            className={cn("p-1 rounded-md transition-colors hover-elevate", pi.color)}
            data-testid={`cross-post-${cp.platform}-${article.id}-${idx}`}
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

  if (layout === "headline") {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
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
            "group grid min-h-[360px] cursor-pointer overflow-hidden rounded-md border bg-card shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:grid-cols-[minmax(0,1.08fr)_minmax(330px,0.92fr)]",
            selected ? "border-primary ring-1 ring-primary/30" : "border-border/50"
          )}
          data-testid={`card-article-headline-${article.id}`}
        >
          {selectCheckbox}
          <div className="relative min-h-[220px] overflow-hidden bg-muted">
            {hasImage ? (
              <img
                src={article.imageUrl!}
                alt={article.title}
                className="h-full min-h-[220px] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                {faviconUrl ? (
                  <img src={faviconUrl} alt={article.subSource || article.source?.name || ""} className="h-16 w-16 rounded-md" loading="lazy" />
                ) : (
                  <SourceIcon className="h-14 w-14 text-muted-foreground/30" />
                )}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {sourceInfo}
              {categoryBadge}
              {priorityBadge}
              {provinceBadge}
            </div>
            <h2 className="font-display text-2xl font-bold leading-tight text-foreground transition-colors group-hover:text-primary md:text-3xl">
              {article.title}
            </h2>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {timeInfo}
                {workflowBadge}
                {manualTagBadges}
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

  if (layout === "compact") {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
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
          className="group flex cursor-pointer gap-3 rounded-md border border-border/50 bg-card p-3 transition hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid={`card-article-compact-${article.id}`}
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {hasImage ? (
              <img
                src={article.imageUrl!}
                alt={article.title}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : faviconUrl ? (
              <img src={faviconUrl} alt={article.subSource || article.source?.name || ""} className="h-8 w-8 rounded-md" loading="lazy" />
            ) : (
              <SourceIcon className="h-7 w-7 text-muted-foreground/35" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {article.subSource || article.source?.name || t("common.noResults")}
              </span>
              {categoryBadge}
              {priorityBadge}
            </div>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
              {article.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {timeInfo}
              {provinceBadge}
              {crossPostIcons}
            </div>
          </div>
        </motion.div>
        {articleDialog}
      </>
    );
  }

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
              {priorityBadge}
              {workflowBadge}
              {provinceBadge}
              {manualTagBadges}
              {sentimentBadge}
            </div>
          </div>
          <h3 className="text-sm font-bold font-display text-foreground leading-snug group-hover:text-primary transition-colors">
            {article.title}
          </h3>
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
          <span className="text-sm font-semibold text-muted-foreground/50">{article.subSource || channelName}</span>
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
          {sourceInfo}
          <div className="flex items-center gap-1.5 flex-wrap">
            {categoryBadge}
            {priorityBadge}
            {workflowBadge}
            {provinceBadge}
            {manualTagBadges}
            {sentimentBadge}
          </div>
        </div>

        <h3 className="text-sm font-bold font-display text-foreground leading-snug mb-3 group-hover:text-primary transition-colors">
          {article.title}
        </h3>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4 border-t border-border/50 flex-wrap">
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
