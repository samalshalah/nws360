import { format } from "date-fns";
import { Bookmark, Calendar, ExternalLink, Share2 } from "lucide-react";
import { type Article, type Source } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ArticleDetailDialogProps {
  article: Article & { source: Source | null };
  open: boolean;
  isBookmarked: boolean;
  onOpenChange: (open: boolean) => void;
  onBookmark: () => void;
  onShare: () => void;
}

export function ArticleDetailDialog({
  article,
  open,
  isBookmarked,
  onOpenChange,
  onBookmark,
  onShare,
}: ArticleDetailDialogProps) {
  const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
  const sourceName = article.subSource || article.source?.name || "Unknown source";
  const topics = Array.from(new Set([...(article.topics || []), ...(article.keywords || [])]));
  const content = article.content.trim();
  const summary = article.summary?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        data-testid={`dialog-article-${article.id}`}
      >
        <div className="overflow-y-auto">
          {article.imageUrl ? (
            <div className="aspect-[16/7] w-full overflow-hidden bg-muted">
              <img src={article.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}

          <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <DialogHeader className="pr-7 text-left">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80">{sourceName}</span>
                {publishedAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(publishedAt, "PPP 'at' p")}
                  </span>
                ) : null}
              </div>
              <DialogTitle className="text-xl font-bold leading-snug sm:text-2xl">
                {article.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Article details for {article.title}
              </DialogDescription>
            </DialogHeader>

            {summary ? (
              <p className="mt-5 border-l-2 border-primary pl-4 text-base font-medium leading-7 text-foreground/85">
                {summary}
              </p>
            ) : null}

            {content && content !== summary ? (
              <div className="mt-6 whitespace-pre-line text-sm leading-7 text-foreground/80 sm:text-base">
                {content}
              </div>
            ) : null}

            {topics.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2" aria-label="Article topics">
                {topics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="font-normal">
                    {topic}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:px-8">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onBookmark}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark article"}
            >
              <Bookmark className={cn("h-4 w-4", isBookmarked && "fill-primary text-primary")} />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={onShare} aria-label="Share article">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          {article.url ? (
            <Button asChild>
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                Open article
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
