import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Calendar, MessageSquare, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Article, type Source } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ArticleCardProps {
  article: Article & { source: Source | null };
}

export function ArticleCard({ article }: ArticleCardProps) {
  const sentimentColor = {
    positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    neutral: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  }[article.sentimentLabel || "neutral"];

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
          {article.source?.name || "Unknown Source"}
        </div>
        
        {article.sentimentLabel && (
          <Badge variant="outline" className={cn("capitalize", sentimentColor)}>
            {article.sentimentLabel}
          </Badge>
        )}
      </div>

      <h3 className="text-xl font-bold font-display text-foreground leading-tight mb-3 line-clamp-2 group-hover:text-primary transition-colors">
        {article.title}
      </h3>

      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-6">
        {article.summary || article.content.substring(0, 150) + "..."}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : "Recently"}
        </div>

        <a
          href={article.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Read Full Story
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  );
}
