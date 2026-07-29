import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Bookmark, Calendar, CheckSquare, ExternalLink, Loader2, Save, Share2 } from "lucide-react";
import { CAPS, type Article, type Source } from "@shared/schema";
import { ARTICLE_CATEGORIES, ARTICLE_WORKFLOW_STATUSES, IRAQ_PROVINCES, getArticleCategoryLabel, getArticleWorkflowStatusLabel, getIraqProvinceLabel } from "@shared/article-taxonomy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasCap, authContext } = usePermissions();
  const canEditArticle = hasCap(CAPS.ARTICLE_EDIT);
  const canCreateTask = hasCap(CAPS.COLLAB_TASKS);
  const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
  const sourceName = article.subSource || article.source?.name || "Unknown source";
  const collectedVia = article.subSource ? article.source?.name : null;
  const topics = Array.from(new Set([...(article.topics || []), ...(article.keywords || [])]));
  const content = article.content.trim();
  const summary = article.summary?.trim();
  const initialManualTags = Array.isArray((article as any).manualTags) ? (article as any).manualTags as string[] : [];
  const [category, setCategory] = useState((article as any).category || "general");
  const [province, setProvince] = useState((article as any).province || "none");
  const [workflowStatus, setWorkflowStatus] = useState((article as any).workflowStatus || "new");
  const [tagsInput, setTagsInput] = useState(initialManualTags.join(", "));

  useEffect(() => {
    if (!open) return;
    setCategory((article as any).category || "general");
    setProvince((article as any).province || "none");
    setWorkflowStatus((article as any).workflowStatus || "new");
    setTagsInput(initialManualTags.join(", "));
  }, [article.id, open]);

  const updateArticleWorkflow = useMutation({
    mutationFn: async () => {
      const manualTags = tagsInput
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " "))
        .filter(Boolean);

      const res = await apiRequest("PATCH", `/api/articles/${article.id}/workflow`, {
        category,
        province: province === "none" ? null : province,
        workflowStatus,
        manualTags,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Article updated" });
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] || "").startsWith("/api/articles"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/articles"] });
    },
    onError: (error) => {
      toast({
        title: "Article update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const createArticleTask = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collaboration/tasks", {
        title: `Review: ${article.title}`.slice(0, 160),
        description: summary || content.slice(0, 500) || null,
        priority: "medium",
        assignedTo: authContext?.user?.id || null,
        relatedTargetType: "article",
        relatedTargetId: article.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Task creation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const readonlyManualTags = initialManualTags.filter(Boolean);

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
                {collectedVia ? (
                  <span>
                    {t("common.via")} <span className="font-medium text-muted-foreground">{collectedVia}</span>
                  </span>
                ) : null}
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

            {canEditArticle ? (
              <div className="mt-5 rounded-md border bg-muted/30 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Workflow</Label>
                    <Select value={workflowStatus} onValueChange={setWorkflowStatus}>
                      <SelectTrigger className="bg-background" data-testid={`select-article-workflow-${article.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ARTICLE_WORKFLOW_STATUSES.map((status) => (
                          <SelectItem key={status.code} value={status.code}>{status.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="bg-background" data-testid={`select-article-category-${article.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ARTICLE_CATEGORIES.map((item) => (
                          <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Province</Label>
                    <Select value={province} onValueChange={setProvince}>
                      <SelectTrigger className="bg-background" data-testid={`select-article-province-${article.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No province</SelectItem>
                        {IRAQ_PROVINCES.map((item) => (
                          <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label className="text-xs">Manual tags</Label>
                    <Input
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="Embassy, Oil, Election"
                      className="bg-background"
                      data-testid={`input-article-tags-${article.id}`}
                    />
                  </div>
                  <Button
                    type="button"
                    className="self-end"
                    onClick={() => updateArticleWorkflow.mutate()}
                    disabled={updateArticleWorkflow.isPending}
                    data-testid={`button-save-article-workflow-${article.id}`}
                  >
                    {updateArticleWorkflow.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2" aria-label="Article organization">
                {(article as any).category ? (
                  <Badge variant="outline">{getArticleCategoryLabel((article as any).category)}</Badge>
                ) : null}
                {(article as any).workflowStatus ? (
                  <Badge variant="outline">{getArticleWorkflowStatusLabel((article as any).workflowStatus)}</Badge>
                ) : null}
                {(article as any).province ? (
                  <Badge variant="outline">{getIraqProvinceLabel((article as any).province)}</Badge>
                ) : null}
                {readonlyManualTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>
                ))}
              </div>
            )}

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
            {canCreateTask && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => createArticleTask.mutate()}
                disabled={createArticleTask.isPending}
                data-testid={`button-create-task-from-article-${article.id}`}
              >
                {createArticleTask.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckSquare className="mr-2 h-4 w-4" />
                )}
                Create task
              </Button>
            )}
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
