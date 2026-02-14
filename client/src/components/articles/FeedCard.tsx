import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSelectedArticle } from "@/contexts/SelectedArticleContext";

interface FeedCardProps {
  article: any;
}

const sentimentStyles: Record<string, string> = {
  positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  neutral: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
};

export function FeedCard({ article }: FeedCardProps) {
  const { openArticle } = useSelectedArticle();

  const { data: bookmarkedIds = [] } = useQuery<number[]>({
    queryKey: ["/api/bookmarks"],
  });

  const isBookmarked = bookmarkedIds.includes(article.id);

  const addBookmark = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bookmarks", { articleId: article.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
  });

  const removeBookmark = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/bookmarks/${article.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
  });

  const source = article.source;
  const sentiment = article.sentimentLabel || "neutral";
  const excerpt = article.summary || (article.content ? article.content.substring(0, 160) + "..." : "");
  const keywords: string[] = Array.isArray(article.keywords) ? article.keywords.slice(0, 3) : [];
  let faviconUrl = source?.logoUrl || null;
  if (!faviconUrl && source?.url) {
    try {
      const urlStr = source.url.startsWith("http") ? source.url : `https://${source.url}`;
      faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${new URL(urlStr).hostname}`;
    } catch { /* skip */ }
  }

  return (
    <article
      className="group border-b border-border/50 py-4 px-1 cursor-pointer hover-elevate transition-colors"
      onClick={() => openArticle(article.id)}
      data-testid={`card-article-${article.id}`}
    >
      <div className="flex gap-3">
        {faviconUrl && (
          <div className="shrink-0 mt-1">
            <img
              src={faviconUrl}
              alt=""
              className="w-5 h-5 rounded-sm"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground truncate" data-testid={`text-source-${article.id}`}>
              {source?.name || "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {article.publishedAt
                ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
                : "Recently"}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-foreground leading-snug mb-1 line-clamp-2" data-testid={`text-title-${article.id}`}>
            {article.title}
          </h3>

          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2" data-testid={`text-excerpt-${article.id}`}>
            {excerpt}
          </p>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {kw}
                </Badge>
              ))}
              <Badge
                variant="outline"
                className={cn("text-[10px] capitalize", sentimentStyles[sentiment])}
                data-testid={`badge-sentiment-${article.id}`}
              >
                {sentiment}
              </Badge>
            </div>

            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => isBookmarked ? removeBookmark.mutate() : addBookmark.mutate()}
                data-testid={`button-bookmark-${article.id}`}
              >
                <Bookmark className={cn("w-3.5 h-3.5", isBookmarked ? "fill-primary text-primary" : "text-muted-foreground")} />
              </Button>
              {article.url && (
                <a href={article.url} target="_blank" rel="noopener noreferrer" data-testid={`link-external-${article.id}`}>
                  <Button size="icon" variant="ghost">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
