import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ExternalLink, ChevronDown, Calendar, Bookmark, Share2 } from "lucide-react";
import { useArticle } from "@/hooks/use-articles";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ArticleDrawerProps {
  articleId: number | null;
  open: boolean;
  onClose: () => void;
}

export function ArticleDrawer({ articleId, open, onClose }: ArticleDrawerProps) {
  const { data: article, isLoading } = useArticle(articleId || 0);
  const { toast } = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);

  const { data: bookmarkedIds = [] } = useQuery<number[]>({
    queryKey: ["/api/bookmarks"],
  });

  const isBookmarked = articleId ? bookmarkedIds.includes(articleId) : false;

  const addBookmark = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bookmarks", { articleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/articles"] });
    },
  });

  const removeBookmark = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/bookmarks/${articleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/articles"] });
    },
  });

  const sentimentColor: Record<string, string> = {
    positive: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    negative: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    neutral: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  };

  const keywords: string[] = article
    ? (Array.isArray((article as any).keywords)
        ? (article as any).keywords
        : typeof (article as any).keywords === "string"
          ? (article as any).keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
          : [])
    : [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        {isLoading || !article ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Calendar className="w-3.5 h-3.5" />
                {article.publishedAt
                  ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
                  : "Recently"}
                <span className="mx-1">from</span>
                <span className="font-medium text-foreground" data-testid="text-drawer-source">
                  {(article as any).source?.name || "Unknown"}
                </span>
              </div>
              <SheetTitle className="text-lg font-bold leading-snug text-left" data-testid="text-drawer-title">
                {article.title}
              </SheetTitle>
            </SheetHeader>

            <div className="px-6 pt-3 flex items-center gap-2 flex-wrap">
              {article.sentimentLabel && (
                <Badge variant="outline" className={cn("capitalize text-xs", sentimentColor[article.sentimentLabel] || sentimentColor.neutral)} data-testid="badge-drawer-sentiment">
                  {article.sentimentLabel}
                </Badge>
              )}
              {(article as any).category && (article as any).category !== "general" && (
                <Badge variant="outline" className="text-xs capitalize" data-testid="badge-drawer-category">
                  {(article as any).category}
                </Badge>
              )}
            </div>

            <div className="px-6 pt-3 flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => isBookmarked ? removeBookmark.mutate() : addBookmark.mutate()}
                data-testid="button-drawer-bookmark"
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked ? "fill-primary text-primary" : "text-muted-foreground")} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(article.url || "");
                  toast({ title: "Link copied" });
                }}
                data-testid="button-drawer-share"
              >
                <Share2 className="w-4 h-4 text-muted-foreground" />
              </Button>
              {article.url && (
                <a href={article.url} target="_blank" rel="noopener noreferrer" data-testid="link-drawer-external">
                  <Button variant="ghost" size="icon">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </a>
              )}
            </div>

            <Separator className="mx-6 my-4 w-auto" />

            <div className="px-6 pb-2">
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap" data-testid="text-drawer-content">
                {article.content || "No content available."}
              </p>
            </div>

            {article.summary && (
              <>
                <Separator className="mx-6 my-2 w-auto" />
                <div className="px-6">
                  <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground w-full py-2" data-testid="button-drawer-summary-toggle">
                      <ChevronDown className={cn("w-4 h-4 transition-transform", summaryOpen && "rotate-180")} />
                      AI Summary
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <p className="text-sm leading-relaxed text-muted-foreground pb-3" data-testid="text-drawer-summary">
                        {article.summary}
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            )}

            {keywords.length > 0 && (
              <>
                <Separator className="mx-6 my-2 w-auto" />
                <div className="px-6 pb-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Keywords</h4>
                  <div className="flex flex-wrap gap-1.5" data-testid="drawer-keywords">
                    {keywords.map((kw: string) => (
                      <Badge key={kw} variant="secondary" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {article.sentimentLabel && (
              <>
                <Separator className="mx-6 my-2 w-auto" />
                <div className="px-6 pb-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Sentiment Breakdown</h4>
                  <div className="space-y-2">
                    {["positive", "negative", "neutral"].map((s) => {
                      const score = s === article.sentimentLabel ? (article.sentimentScore || 0.7) : (1 - (article.sentimentScore || 0.7)) / 2;
                      const pct = Math.round(Number(score) * 100);
                      const colors: Record<string, string> = {
                        positive: "bg-green-500 dark:bg-green-400",
                        negative: "bg-red-500 dark:bg-red-400",
                        neutral: "bg-gray-400 dark:bg-gray-500",
                      };
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <span className="text-xs capitalize text-muted-foreground w-16">{s}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", colors[s])} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
