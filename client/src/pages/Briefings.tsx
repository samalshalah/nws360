import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  Check,
  Copy,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type ReportStatus = "draft" | "review" | "published" | "archived";
type BriefingItemType = "article" | "note" | "heading" | "link";

type SharedReport = {
  id: number;
  clientId: number;
  workspaceId: number | null;
  title: string;
  summary: string | null;
  status: ReportStatus;
  createdBy: number;
  shareToken: string | null;
  lastUpdated: string | null;
  createdAt: string | null;
};

type BriefingItem = {
  id: number;
  reportId: number;
  itemType: BriefingItemType;
  itemRefId: number | null;
  content: string | null;
  position: number | null;
  createdAt: string | null;
};

type ReportBasketResponse = {
  items: any[];
  total: number;
  page: number;
  limit: number;
};

const REPORTS_QUERY_KEY = ["/api/collaboration/reports"];
const BASKET_QUERY_KEY = ["/api/reports/basket", "sort=newest&limit=100"];

const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  archived: "Archived",
};

function reportStatusVariant(status: ReportStatus): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

function itemLabel(type: BriefingItemType) {
  if (type === "article") return "Article";
  if (type === "heading") return "Heading";
  if (type === "link") return "Link";
  return "Note";
}

function sourceName(article: any) {
  return article?.subSource || article?.source?.name || "Unknown source";
}

function articleDate(article: any) {
  const value = article?.publishedAt || article?.ingestedAt || article?.createdAt;
  if (!value) return "";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "";
  }
}

function articleSnapshot(article: any) {
  return String(article?.summary || article?.contentClean || article?.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

export default function Briefings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editStatus, setEditStatus] = useState<ReportStatus>("draft");
  const [itemType, setItemType] = useState<Exclude<BriefingItemType, "article">>("note");
  const [itemContent, setItemContent] = useState("");
  const [copied, setCopied] = useState(false);

  const {
    data: reports = [],
    isLoading: reportsLoading,
    isFetching: reportsFetching,
    refetch: refetchReports,
  } = useQuery<SharedReport[]>({
    queryKey: REPORTS_QUERY_KEY,
  });

  const { data: basket, isLoading: basketLoading, refetch: refetchBasket } = useQuery<ReportBasketResponse>({
    queryKey: BASKET_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/reports/basket?sort=newest&limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report basket");
      return res.json();
    },
  });

  const selectedReport = useMemo(
    () => reports.find(report => report.id === selectedReportId) || null,
    [reports, selectedReportId],
  );

  const itemsQueryKey = selectedReportId
    ? [`/api/collaboration/reports/${selectedReportId}/items`]
    : ["/api/collaboration/reports/none/items"];

  const {
    data: items = [],
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery<BriefingItem[]>({
    queryKey: itemsQueryKey,
    enabled: Boolean(selectedReportId),
  });

  const basketArticles = basket?.items || [];
  const articleMap = useMemo(
    () => new Map(basketArticles.map(article => [article.id, article])),
    [basketArticles],
  );

  const addedArticleIds = useMemo(
    () => new Set(items.filter(item => item.itemType === "article" && item.itemRefId).map(item => item.itemRefId as number)),
    [items],
  );

  const totals = useMemo(() => {
    const draft = reports.filter(report => report.status === "draft").length;
    const review = reports.filter(report => report.status === "review").length;
    const published = reports.filter(report => report.status === "published").length;
    return { draft, review, published };
  }, [reports]);

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null);
      return;
    }
    if (!selectedReportId || !reports.some(report => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (!selectedReport) return;
    setEditTitle(selectedReport.title);
    setEditSummary(selectedReport.summary || "");
    setEditStatus(selectedReport.status || "draft");
    setCopied(false);
  }, [selectedReport]);

  const invalidateReports = () => {
    queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/activity-feed"] });
  };

  const invalidateItems = () => {
    if (selectedReportId) {
      queryClient.invalidateQueries({ queryKey: [`/api/collaboration/reports/${selectedReportId}/items`] });
    }
    invalidateReports();
  };

  const createReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collaboration/reports", {
        title: newTitle.trim(),
        summary: newSummary.trim() || null,
        status: "draft",
      });
      return res.json() as Promise<SharedReport>;
    },
    onSuccess: (report) => {
      invalidateReports();
      setSelectedReportId(report.id);
      setNewTitle("");
      setNewSummary("");
      toast({ title: t("briefings.created", "Briefing created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<SharedReport> }) => {
      const res = await apiRequest("PATCH", `/api/collaboration/reports/${id}`, updates);
      return res.json() as Promise<SharedReport>;
    },
    onSuccess: () => {
      invalidateReports();
      toast({ title: t("briefings.saved", "Briefing updated") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/reports/${id}`);
    },
    onSuccess: () => {
      invalidateReports();
      toast({ title: t("briefings.deleted", "Briefing deleted") });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (payload: { itemType: BriefingItemType; itemRefId?: number | null; content?: string | null; position?: number }) => {
      if (!selectedReportId) throw new Error("Select a briefing first");
      const res = await apiRequest("POST", `/api/collaboration/reports/${selectedReportId}/items`, payload);
      return res.json() as Promise<BriefingItem>;
    },
    onSuccess: () => {
      invalidateItems();
      setItemContent("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/reports/items/${id}`);
    },
    onSuccess: invalidateItems,
  });

  const bulkAddMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReportId) throw new Error("Select a briefing first");
      const candidates = basketArticles.filter(article => !addedArticleIds.has(article.id));
      const startPosition = items.length;
      for (let index = 0; index < candidates.length; index += 1) {
        const article = candidates[index];
        await apiRequest("POST", `/api/collaboration/reports/${selectedReportId}/items`, {
          itemType: "article",
          itemRefId: article.id,
          content: articleSnapshot(article),
          position: startPosition + index,
        });
      }
      return candidates.length;
    },
    onSuccess: (count) => {
      invalidateItems();
      toast({ title: t("briefings.bulkAdded", "{{count}} articles added", { count }) });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const saveSelectedReport = () => {
    if (!selectedReport) return;
    updateReportMutation.mutate({
      id: selectedReport.id,
      updates: {
        title: editTitle.trim(),
        summary: editSummary.trim() || null,
        status: editStatus,
      } as any,
    });
  };

  const addTextItem = () => {
    if (!itemContent.trim()) return;
    addItemMutation.mutate({
      itemType,
      content: itemContent.trim(),
      position: items.length,
    });
  };

  const addArticle = (article: any) => {
    addItemMutation.mutate({
      itemType: "article",
      itemRefId: article.id,
      content: articleSnapshot(article),
      position: items.length,
    });
  };

  const copyShareLink = async () => {
    if (!selectedReport?.shareToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/shared-report/${selectedReport.shareToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t("briefings.shareCopied", "Share link copied") });
  };

  if (reportsLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-md" />)}
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-briefings-page-title">
              {t("briefings.title", "Briefings")}
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("briefings.subtitle", "Assemble client-ready briefings from curated articles, notes, links, and headings. Each briefing stays inside the current tenant until a share link is used.")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchReports(); refetchItems(); refetchBasket(); }} disabled={reportsFetching} data-testid="button-refresh-briefings">
            {reportsFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">{t("common.refresh", "Refresh")}</span>
          </Button>
          {selectedReport && (
            <Button variant="outline" size="sm" onClick={copyShareLink} disabled={!selectedReport.shareToken} data-testid="button-copy-briefing-share">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{t("briefings.copyShare", "Copy share link")}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.total", "Total briefings")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{reports.length}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.drafts", "Drafts")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.draft}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.inReview", "In review")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.review}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.basketArticles", "Report basket")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{basket?.total || 0}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                {t("briefings.newBriefing", "New Briefing")}
              </CardTitle>
              <CardDescription>{t("briefings.newBriefingDescription", "Start a briefing, then add articles from the report basket.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="briefing-title">{t("briefings.briefingTitle", "Title")}</Label>
                <Input
                  id="briefing-title"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder={t("briefings.titlePlaceholder", "Morning security brief")}
                  data-testid="input-new-briefing-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="briefing-summary">{t("briefings.summary", "Summary")}</Label>
                <Textarea
                  id="briefing-summary"
                  value={newSummary}
                  onChange={(event) => setNewSummary(event.target.value)}
                  placeholder={t("briefings.summaryPlaceholder", "Short context for the team or external reader")}
                  data-testid="textarea-new-briefing-summary"
                />
              </div>
              <Button
                onClick={() => createReportMutation.mutate()}
                disabled={createReportMutation.isPending || newTitle.trim().length < 2}
                data-testid="button-create-briefing"
              >
                {createReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">{t("common.create", "Create")}</span>
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-md border border-border/60 bg-card">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">{t("briefings.allBriefings", "All briefings")}</h2>
            </div>
            <div className="divide-y divide-border/60" data-testid="list-briefings">
              {reports.length > 0 ? reports.map(report => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition hover:bg-muted/50",
                    selectedReportId === report.id && "bg-muted",
                  )}
                  data-testid={`button-select-briefing-${report.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.lastUpdated || report.createdAt
                          ? formatDistanceToNow(new Date(report.lastUpdated || report.createdAt || Date.now()), { addSuffix: true })
                          : t("common.notAvailable", "Not available")}
                      </p>
                    </div>
                    <Badge variant={reportStatusVariant(report.status)}>{STATUS_LABELS[report.status] || report.status}</Badge>
                  </div>
                </button>
              )) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="empty-briefings">
                  {t("briefings.empty", "No briefings yet. Create one to start assembling client-ready output.")}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedReport ? (
            <>
              <Card className="rounded-md">
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4 text-primary" />
                        {t("briefings.editor", "Briefing Editor")}
                      </CardTitle>
                      <CardDescription>{t("briefings.editorDescription", "Edit details, publish status, and manage briefing items.")}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateReportMutation.mutate({ id: selectedReport.id, updates: { status: "published" } as any })}
                        disabled={updateReportMutation.isPending || selectedReport.status === "published"}
                        data-testid="button-publish-briefing"
                      >
                        <Send className="h-4 w-4" />
                        <span className="ml-2">{t("briefings.publish", "Publish")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(t("briefings.deleteConfirm", "Delete this briefing?"))) {
                            deleteReportMutation.mutate(selectedReport.id);
                          }
                        }}
                        disabled={deleteReportMutation.isPending}
                        data-testid="button-delete-briefing"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="space-y-2 lg:col-span-5">
                      <Label htmlFor="edit-briefing-title">{t("briefings.briefingTitle", "Title")}</Label>
                      <Input
                        id="edit-briefing-title"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        data-testid="input-edit-briefing-title"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-3">
                      <Label>{t("briefings.status", "Status")}</Label>
                      <Select value={editStatus} onValueChange={(value) => setEditStatus(value as ReportStatus)}>
                        <SelectTrigger data-testid="select-edit-briefing-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="review">In review</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-end lg:col-span-4">
                      <Button onClick={saveSelectedReport} disabled={updateReportMutation.isPending || editTitle.trim().length < 2} data-testid="button-save-briefing">
                        {updateReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span className="ml-2">{t("common.save", "Save")}</span>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-briefing-summary">{t("briefings.summary", "Summary")}</Label>
                    <Textarea
                      id="edit-briefing-summary"
                      value={editSummary}
                      onChange={(event) => setEditSummary(event.target.value)}
                      data-testid="textarea-edit-briefing-summary"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="rounded-md">
                  <CardHeader>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle className="text-base">{t("briefings.items", "Briefing Items")}</CardTitle>
                        <CardDescription>{t("briefings.itemsDescription", "Arrange article references and written context for the final briefing.")}</CardDescription>
                      </div>
                      <Badge variant="secondary">{items.length} {t("briefings.itemsCount", "items")}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                      <div className="grid gap-3 lg:grid-cols-12">
                        <div className="space-y-2 lg:col-span-3">
                          <Label>{t("briefings.itemType", "Type")}</Label>
                          <Select value={itemType} onValueChange={(value) => setItemType(value as Exclude<BriefingItemType, "article">)}>
                            <SelectTrigger data-testid="select-briefing-item-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="note">Note</SelectItem>
                              <SelectItem value="heading">Heading</SelectItem>
                              <SelectItem value="link">Link</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 lg:col-span-7">
                          <Label htmlFor="briefing-item-content">{t("briefings.content", "Content")}</Label>
                          <Input
                            id="briefing-item-content"
                            value={itemContent}
                            onChange={(event) => setItemContent(event.target.value)}
                            placeholder={itemType === "link" ? "https://example.com" : t("briefings.contentPlaceholder", "Add context, heading, or link")}
                            data-testid="input-briefing-item-content"
                          />
                        </div>
                        <div className="flex items-end justify-end lg:col-span-2">
                          <Button onClick={addTextItem} disabled={addItemMutation.isPending || !itemContent.trim()} data-testid="button-add-briefing-text-item">
                            {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            <span className="ml-2">{t("common.add", "Add")}</span>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {itemsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)}
                      </div>
                    ) : items.length > 0 ? (
                      <div className="space-y-2" data-testid="list-briefing-items">
                        {items.map((item, index) => {
                          const article = item.itemRefId ? articleMap.get(item.itemRefId) : null;
                          return (
                            <div key={item.id} className="rounded-md border border-border/60 bg-card p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">#{index + 1}</Badge>
                                    <Badge variant={item.itemType === "article" ? "default" : "secondary"}>{itemLabel(item.itemType)}</Badge>
                                    {article && <span className="text-xs text-muted-foreground">{sourceName(article)} {articleDate(article) ? `- ${articleDate(article)}` : ""}</span>}
                                  </div>
                                  {item.itemType === "article" ? (
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium text-foreground">{article?.title || `Article #${item.itemRefId}`}</p>
                                      {item.content && <p className="line-clamp-2 text-sm text-muted-foreground">{item.content}</p>}
                                    </div>
                                  ) : (
                                    <p className={cn("text-sm text-foreground", item.itemType === "heading" && "font-semibold")}>{item.content}</p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  disabled={deleteItemMutation.isPending}
                                  data-testid={`button-delete-briefing-item-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center" data-testid="empty-briefing-items">
                        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                        <h2 className="text-base font-semibold text-foreground">{t("briefings.noItemsTitle", "No items yet")}</h2>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                          {t("briefings.noItemsBody", "Add articles from the report basket or write notes to shape the briefing.")}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{t("briefings.reportBasket", "Report Basket")}</CardTitle>
                        <CardDescription>{t("briefings.reportBasketDescription", "Use articles marked For Report as the briefing source pool.")}</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkAddMutation.mutate()}
                        disabled={bulkAddMutation.isPending || basketArticles.every(article => addedArticleIds.has(article.id))}
                        data-testid="button-add-visible-basket"
                      >
                        {bulkAddMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        <span className="ml-2">{t("briefings.addAll", "Add all")}</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {basketLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)}
                      </div>
                    ) : basketArticles.length > 0 ? (
                      <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1" data-testid="list-briefing-basket-articles">
                        {basketArticles.map(article => {
                          const alreadyAdded = addedArticleIds.has(article.id);
                          return (
                            <div key={article.id} className="rounded-md border border-border/60 p-3">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-medium text-foreground">{article.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{sourceName(article)} {articleDate(article) ? `- ${articleDate(article)}` : ""}</p>
                                  </div>
                                  <Button
                                    variant={alreadyAdded ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => addArticle(article)}
                                    disabled={alreadyAdded || addItemMutation.isPending}
                                    data-testid={`button-add-article-to-briefing-${article.id}`}
                                  >
                                    {alreadyAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    <span className="ml-2">{alreadyAdded ? t("briefings.added", "Added") : t("common.add", "Add")}</span>
                                  </Button>
                                </div>
                                {articleSnapshot(article) && <p className="line-clamp-2 text-xs text-muted-foreground">{articleSnapshot(article)}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
                        <p className="text-sm font-medium text-foreground">{t("briefings.emptyBasketTitle", "Report basket is empty")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("briefings.emptyBasketBody", "Mark feed items as For Report, then return here to add them to briefings.")}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center" data-testid="empty-selected-briefing">
              <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
              <h2 className="text-base font-semibold text-foreground">{t("briefings.selectTitle", "Create or select a briefing")}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {t("briefings.selectBody", "A briefing is the client-facing package built from marked news, staff notes, links, and publishing status.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
