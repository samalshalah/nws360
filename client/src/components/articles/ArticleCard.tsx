import { useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Calendar, Newspaper, Rss, Globe, Send, Youtube, Facebook, Instagram, Twitter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Article, type Source } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ArticleCardProps {
  article: Article & { source: Source | null };
}

const sourceTypeIcons: Record<string, typeof Rss> = {
  rss: Rss,
  website: Globe,
  twitter: Twitter,
  youtube: Youtube,
  facebook: Facebook,
  instagram: Instagram,
  telegram: Send,
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

export function ArticleCard({ article }: ArticleCardProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const sentimentColor = {
    positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    neutral: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  }[article.sentimentLabel || "neutral"];

  const SourceIcon = sourceTypeIcons[article.source?.type || "rss"] || Newspaper;
  const displayContent = article.summary || article.content.substring(0, 150) + "...";
  const articleCategory = (article as any).category || "general";
  const hasImage = article.imageUrl && !imgError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-border/50 rounded-md overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group flex flex-col"
      data-testid={`card-article-${article.id}`}
    >
      {hasImage && (
        <div className="relative w-full h-48 overflow-hidden bg-muted" data-testid={`img-article-${article.id}`}>
          <img
            src={article.imageUrl!}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
            <SourceIcon className="w-3.5 h-3.5" />
            {article.subSource ? (
              <>
                <span className="font-semibold text-foreground/80" data-testid={`text-subsource-${article.id}`}>{article.subSource}</span>
                <span className="text-muted-foreground/40" data-testid={`text-via-${article.id}`}>{t("common.via")}</span>
                <span data-testid={`text-source-${article.id}`}>{article.source?.name || t("common.noResults")}</span>
              </>
            ) : (
              <span data-testid={`text-source-${article.id}`}>{article.source?.name || t("common.noResults")}</span>
            )}
            <span className="text-muted-foreground/60">
              {article.source?.type ? t(`feed.sourceTypes.${article.source.type}`) : ""}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            {articleCategory && articleCategory !== "general" && (
              <Badge variant="outline" className={cn("text-xs capitalize", categoryColors[articleCategory] || categoryColors.general)} data-testid={`badge-category-${article.id}`}>
                {t(`feed.categories.${articleCategory}`)}
              </Badge>
            )}
            {article.sentimentLabel && (
              <Badge variant="outline" className={cn("capitalize text-xs", sentimentColor)} data-testid={`badge-sentiment-${article.id}`}>
                {article.sentimentLabel === "positive" ? t("feed.positive") : 
                 article.sentimentLabel === "negative" ? t("feed.negative") : 
                 t("feed.neutral")}
              </Badge>
            )}
          </div>
        </div>

        <h3 className="text-xl font-bold font-display text-foreground leading-tight mb-3 line-clamp-2 group-hover:text-primary transition-colors">
          {article.title}
        </h3>

        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-6 flex-1">
          {displayContent}
        </p>

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/50 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : t("common.recently")}
          </div>

          <a
            href={article.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            data-testid={`link-read-article-${article.id}`}
          >
            {t("feed.readFullStory")}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
