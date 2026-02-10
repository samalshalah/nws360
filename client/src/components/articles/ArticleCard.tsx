import { useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Calendar, Newspaper, Languages, Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Article, type Source } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

interface ArticleCardProps {
  article: Article & { source: Source | null };
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { t, i18n } = useTranslation();
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<{
    translatedTitle: string;
    translatedContent: string;
    translatedSummary: string;
    targetLanguage: string;
  } | null>(null);

  const sentimentColor = {
    positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    neutral: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  }[article.sentimentLabel || "neutral"];

  const handleTranslate = async () => {
    const currentLang = i18n.language?.split("-")[0] || "en";
    if (translation) {
      setTranslation(null);
      return;
    }
    
    setIsTranslating(true);
    try {
      const res = await apiRequest("POST", `/api/articles/${article.id}/translate`, {
        targetLanguage: currentLang,
      });
      const data = await res.json();
      setTranslation(data);
    } catch (e) {
      console.error("Translation failed:", e);
    } finally {
      setIsTranslating(false);
    }
  };

  const displayTitle = translation ? translation.translatedTitle : article.title;
  const displayContent = translation 
    ? (translation.translatedSummary || translation.translatedContent.substring(0, 150) + "...")
    : (article.summary || article.content.substring(0, 150) + "...");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
          <Newspaper className="w-3.5 h-3.5" />
          {article.source?.name || t("common.noResults")}
        </div>
        
        <div className="flex items-center gap-1.5">
          {translation && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
              {t("feed.translated")}
            </Badge>
          )}
          {article.sentimentLabel && (
            <Badge variant="outline" className={cn("capitalize", sentimentColor)}>
              {article.sentimentLabel === "positive" ? t("feed.positive") : 
               article.sentimentLabel === "negative" ? t("feed.negative") : 
               t("feed.neutral")}
            </Badge>
          )}
        </div>
      </div>

      <h3 className="text-xl font-bold font-display text-foreground leading-tight mb-3 line-clamp-2 group-hover:text-primary transition-colors">
        {displayTitle}
      </h3>

      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-6">
        {displayContent}
      </p>

      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/50 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : t("common.recently")}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTranslate}
            disabled={isTranslating}
            className="text-xs gap-1"
            data-testid={`button-translate-${article.id}`}
          >
            {isTranslating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("feed.translating")}</>
            ) : translation ? (
              <><Undo2 className="w-3.5 h-3.5" /> {t("feed.originalLanguage")}</>
            ) : (
              <><Languages className="w-3.5 h-3.5" /> {t("feed.translate")}</>
            )}
          </Button>
          
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
