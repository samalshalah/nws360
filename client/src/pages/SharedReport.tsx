import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, ArrowLeft, BookOpen, Calendar, Download, ExternalLink, Loader2, Newspaper, Printer } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type PublicArticle = {
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  summary: string;
  category: string | null;
  province: string | null;
  sourceName: string;
  collectedVia: string | null;
  sourceType: string | null;
};

type PublicBriefingItem = {
  id: number;
  itemType: "article" | "note" | "heading" | "link";
  itemRefId: number | null;
  content: string | null;
  position: number | null;
  createdAt: string | null;
  article: PublicArticle | null;
};

type PublicSharedReport = {
  organization: {
    name: string;
  };
  report: {
    id: number;
    title: string;
    summary: string | null;
    status: string;
    shareToken: string | null;
    createdAt: string | null;
    lastUpdated: string | null;
  };
  items: PublicBriefingItem[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not dated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not dated";
  return format(date, "MMM d, yyyy h:mm a");
}

function itemText(item: PublicBriefingItem) {
  if (item.itemType === "article") {
    return [
      item.article?.title,
      item.article?.sourceName,
      item.article?.publishedAt ? formatDate(item.article.publishedAt) : undefined,
      item.content || item.article?.summary,
      item.article?.url,
    ].filter(Boolean).join("\n");
  }
  return item.content || "";
}

function buildTextExport(data: PublicSharedReport) {
  const header = [
    data.report.title,
    data.organization.name,
    `Updated: ${formatDate(data.report.lastUpdated || data.report.createdAt)}`,
    data.report.summary || "",
  ].filter(Boolean).join("\n");
  const body = data.items
    .map((item, index) => `${index + 1}. ${itemText(item)}`)
    .join("\n\n");
  return `${header}\n\n${body}\n`;
}

function downloadText(data: PublicSharedReport) {
  const blob = new Blob([buildTextExport(data)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "briefing"}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function contentLabel(type: PublicBriefingItem["itemType"]) {
  if (type === "article") return "Article";
  if (type === "heading") return "Section";
  if (type === "link") return "Link";
  return "Note";
}

export default function SharedReport({ params }: { params?: { token?: string } }) {
  const token = params?.token || "";

  const { data, isLoading, error } = useQuery<PublicSharedReport>({
    queryKey: [`/api/shared-report/${token}`],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await fetch(`/api/shared-report/${token}`);
      if (!res.ok) throw new Error("Briefing not found");
      return res.json();
    },
    staleTime: 60_000,
  });

  const sortedItems = useMemo(
    () => [...(data?.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id),
    [data?.items],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-36 w-full rounded-md" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-md" />)}
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md rounded-md border border-border/60 bg-card p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h1 className="text-xl font-semibold text-foreground">Briefing unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">The briefing link may be invalid or archived.</p>
          <Link href="/">
            <Button className="mt-5" variant="outline">
              <ArrowLeft className="h-4 w-4" />
              <span className="ml-2">Return home</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card print:hidden">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">NWS360 Briefing</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadText(data)} data-testid="button-download-shared-report">
              <Download className="h-4 w-4" />
              <span className="ml-2">Download text</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-shared-report">
              <Printer className="h-4 w-4" />
              <span className="ml-2">Print / PDF</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="border-b border-border/70 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{data.organization.name}</span>
            <span>/</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(data.report.lastUpdated || data.report.createdAt)}
            </span>
            <Badge variant={data.report.status === "published" ? "default" : "secondary"}>{data.report.status}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-display font-bold leading-tight text-foreground md:text-4xl" data-testid="text-shared-report-title">
            {data.report.title}
          </h1>
          {data.report.summary && (
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              {data.report.summary}
            </p>
          )}
        </section>

        {sortedItems.length > 0 ? (
          <section className="mt-6 space-y-4" data-testid="list-shared-report-items">
            {sortedItems.map((item, index) => {
              const article = item.article;
              if (item.itemType === "heading") {
                return (
                  <div key={item.id} className="pt-5">
                    <h2 className="text-xl font-semibold text-foreground">{item.content}</h2>
                  </div>
                );
              }

              return (
                <article key={item.id} className="rounded-md border border-border/60 bg-card p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    {article?.imageUrl && (
                      <div className="h-28 w-full shrink-0 overflow-hidden rounded-md bg-muted md:w-44">
                        <img src={article.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <Badge variant={item.itemType === "article" ? "default" : "secondary"}>{contentLabel(item.itemType)}</Badge>
                        {article?.sourceName && <span className="text-xs text-muted-foreground">{article.sourceName}</span>}
                        {article?.publishedAt && <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>}
                      </div>

                      {item.itemType === "article" ? (
                        <>
                          <div className="flex items-start gap-2">
                            <Newspaper className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            <h2 className="text-lg font-semibold leading-snug text-foreground">{article?.title || `Article #${item.itemRefId}`}</h2>
                          </div>
                          {(item.content || article?.summary) && (
                            <p className="text-sm leading-6 text-muted-foreground">{item.content || article?.summary}</p>
                          )}
                          {article?.url && (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              Open source
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </>
                      ) : item.itemType === "link" && item.content?.startsWith("http") ? (
                        <a href={item.content} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                          {item.content}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <p className="text-sm leading-6 text-foreground">{item.content}</p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="mt-8 rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <h2 className="text-base font-semibold text-foreground">No briefing items</h2>
            <p className="mt-1 text-sm text-muted-foreground">This briefing has been created but does not include items yet.</p>
          </section>
        )}
      </main>
    </div>
  );
}
