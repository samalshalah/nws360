import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { Source } from "@shared/schema";
import type { WebsiteCollectorConfig } from "@shared/source-collector";
import { DEFAULT_SOURCE_FILTER_CONFIG, type SourceFilterConfig } from "@shared/source-filter";
import { GOOGLE_NEWS_EDITIONS } from "@shared/google-news-regions";
import { SOURCE_CATEGORIES } from "@shared/source-categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRebuildSource, useUpdateSource } from "@/hooks/use-sources";
import { DEFAULT_WEBSITE_COLLECTOR_CONFIG, WebsiteCollectorFields } from "./WebsiteCollectorFields";
import { SourceFilterFields } from "./SourceFilterFields";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  website: "Website",
  rss: "RSS feed",
  google_news: "Google News",
  youtube: "YouTube",
  twitter: "X / Twitter",
  facebook: "Facebook",
  instagram: "Instagram",
  telegram: "Telegram",
};

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || "https://nws360.com").replace(/\/$/, "");
const CONFIGURABLE_SOCIAL_FEED_SOURCE_TYPES = new Set(["facebook", "instagram", "twitter", "telegram"]);

interface SourceForm {
  name: string;
  url: string;
  country: string;
  category: string;
  active: boolean;
  intervalMinutes: number;
  maxArticlesPerFetch: number;
  retentionDays: number;
  collectorConfig: WebsiteCollectorConfig;
  filterConfig: SourceFilterConfig;
}

type TestStatus = "idle" | "testing" | "success" | "error";

function supportsConfiguredFeed(type: string): boolean {
  return type === "website" || CONFIGURABLE_SOCIAL_FEED_SOURCE_TYPES.has(type);
}

function sourceToForm(source: Source): SourceForm {
  return {
    name: source.name,
    url: source.url,
    country: source.country || "",
    category: source.category || "",
    active: source.active !== false,
    intervalMinutes: source.intervalMinutes || 15,
    maxArticlesPerFetch: source.maxArticlesPerFetch || 10,
    retentionDays: source.retentionDays || 30,
    collectorConfig: supportsConfiguredFeed(source.type)
      ? { ...DEFAULT_WEBSITE_COLLECTOR_CONFIG, ...(source.collectorConfig || {}) }
      : DEFAULT_WEBSITE_COLLECTOR_CONFIG,
    filterConfig: {
      whitelist: { ...DEFAULT_SOURCE_FILTER_CONFIG.whitelist, ...(source.filterConfig?.whitelist || {}) },
      blacklist: { ...DEFAULT_SOURCE_FILTER_CONFIG.blacklist, ...(source.filterConfig?.blacklist || {}) },
    },
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function EditSourceDialog({
  source,
  open,
  onOpenChange,
}: {
  source: Source | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateSource = useUpdateSource();
  const rebuildSource = useRebuildSource();
  const [form, setForm] = useState<SourceForm | null>(source ? sourceToForm(source) : null);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [feedCopied, setFeedCopied] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    setForm(sourceToForm(source));
    setTestStatus("idle");
    setTestMessage("");
    setFeedCopied(false);
  }, [open, source]);

  if (!source || !form) return null;

  const isGoogleNews = source.type === "google_news";
  const isWebsite = source.type === "website";
  const isConfigurableSocialFeed = CONFIGURABLE_SOCIAL_FEED_SOURCE_TYPES.has(source.type);
  const canConfigureFeed = supportsConfiguredFeed(source.type);
  const originalCollectorConfig = canConfigureFeed
    ? { ...DEFAULT_WEBSITE_COLLECTOR_CONFIG, ...(source.collectorConfig || {}) }
    : DEFAULT_WEBSITE_COLLECTOR_CONFIG;
  const connectionChanged = form.url.trim() !== source.url
    || (isGoogleNews && form.country !== (source.country || ""))
    || (canConfigureFeed && JSON.stringify(form.collectorConfig) !== JSON.stringify(originalCollectorConfig));
  const isSubmitting = updateSource.isPending || rebuildSource.isPending;
  const canSave = form.name.trim().length > 0
    && form.url.trim().length > 0
    && (!isGoogleNews || form.country.length === 2)
    && (!connectionChanged || testStatus === "success")
    && !isSubmitting;

  const updateForm = (updates: Partial<SourceForm>, resetsConnection = false) => {
    setForm((current) => current ? { ...current, ...updates } : current);
    if (resetsConnection) {
      setTestStatus("idle");
      setTestMessage("");
    }
  };

  const testConnection = async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const response = await fetch("/api/sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.url.trim(),
          type: source.type,
          country: isGoogleNews ? form.country : undefined,
          maxArticles: Math.min(5, form.maxArticlesPerFetch),
          collectorConfig: canConfigureFeed ? form.collectorConfig : undefined,
          filterConfig: form.filterConfig,
        }),
      });
      const result = await response.json();
      const fallbackOnly = source.type !== "google_news" && result.method === "google_news_fallback";
      if (!response.ok || !result.success || !Array.isArray(result.articles) || result.articles.length === 0 || fallbackOnly) {
        throw new Error(result.error || "No articles were found at this address.");
      }
      if (canConfigureFeed && result.feedUrl) {
        setForm((current) => current ? {
          ...current,
          collectorConfig: { ...current.collectorConfig, feedUrl: result.feedUrl },
        } : current);
      }
      setTestStatus("success");
      setTestMessage(`${result.articles.length} recent article${result.articles.length === 1 ? "" : "s"} found via ${String(result.method).replace(/_/g, " ")}.`);
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : "Connection test failed.");
    }
  };

  const buildPayload = () => ({
    id: source.id,
    name: form.name.trim(),
    url: form.url.trim(),
    country: isGoogleNews ? form.country : null,
    category: form.category || null,
    active: form.active,
    intervalMinutes: clamp(form.intervalMinutes, 5, 1440, 15),
    maxArticlesPerFetch: clamp(form.maxArticlesPerFetch, 1, 50, 10),
    retentionDays: clamp(form.retentionDays, 1, 30, 30),
    collectorConfig: canConfigureFeed ? form.collectorConfig : null,
    filterConfig: form.filterConfig,
  });

  const save = async () => {
    if (!canSave) return;
    await updateSource.mutateAsync(buildPayload());
    onOpenChange(false);
  };

  const saveAndRebuild = async () => {
    if (!canSave) return;
    await rebuildSource.mutateAsync(buildPayload());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle>Edit source</DialogTitle>
              <DialogDescription>Update collection settings for this source.</DialogDescription>
            </div>
            <Badge variant="secondary">{SOURCE_TYPE_LABELS[source.type] || source.type}</Badge>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-source-name">Source name</Label>
              <Input
                id="edit-source-name"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                data-testid="input-edit-source-name"
              />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border px-4 py-2.5">
                <div>
                  <div className="text-sm font-medium">Collection active</div>
                  <div className="text-xs text-muted-foreground">Scheduled fetching</div>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(active) => updateForm({ active })}
                  aria-label="Collection active"
                  data-testid="switch-edit-source-active"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-source-url">{isGoogleNews ? "Topic or keyword" : "Source URL"}</Label>
              <Input
                id="edit-source-url"
                value={form.url}
                onChange={(event) => updateForm({ url: event.target.value }, true)}
                data-testid="input-edit-source-url"
              />
            </div>
            {isGoogleNews && (
              <div className="space-y-2">
                <Label>Google News region</Label>
                <Select value={form.country} onValueChange={(country) => updateForm({ country }, true)}>
                  <SelectTrigger data-testid="select-edit-source-region">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_NEWS_EDITIONS.map((edition) => (
                      <SelectItem key={edition.code} value={edition.code}>{edition.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={testConnection}
                disabled={!form.url.trim() || (isGoogleNews && !form.country) || testStatus === "testing"}
                data-testid="button-test-edited-source"
              >
                {testStatus === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Test connection
              </Button>
              {testStatus === "success" && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {testMessage}
                </div>
              )}
              {testStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <TriangleAlert className="h-4 w-4" />
                  {testMessage}
                </div>
              )}
            </div>
          </div>

          {isWebsite && (
            <WebsiteCollectorFields
              value={form.collectorConfig}
              onChange={(collectorConfig) => updateForm({ collectorConfig }, true)}
              detectedFeedUrl={form.collectorConfig.feedUrl}
            />
          )}

          {isConfigurableSocialFeed && (
            <div className="space-y-2">
              <Label htmlFor="edit-source-feed-url">Collection feed URL</Label>
              <Input
                id="edit-source-feed-url"
                value={form.collectorConfig.feedUrl || ""}
                onChange={(event) => updateForm({
                  collectorConfig: {
                    ...form.collectorConfig,
                    strategy: "rss",
                    feedUrl: event.target.value.trim() || undefined,
                  },
                }, true)}
                placeholder="https://example.com/feed.xml"
                data-testid="input-edit-source-feed-url"
              />
              <p className="text-xs text-muted-foreground">
                Optional RSS or bridge feed used before direct social fallback.
              </p>
            </div>
          )}

          <SourceFilterFields
            value={form.filterConfig}
            onChange={(filterConfig) => updateForm({ filterConfig })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>News category</Label>
              <Select value={form.category || "general"} onValueChange={(category) => updateForm({ category: category === "general" ? "" : category })}>
                <SelectTrigger data-testid="select-edit-source-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  {SOURCE_CATEGORIES.map((category) => (
                    <SelectItem key={category.code} value={category.code}>{category.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fetch interval</Label>
              <Select value={String(form.intervalMinutes)} onValueChange={(value) => updateForm({ intervalMinutes: Number(value) })}>
                <SelectTrigger data-testid="select-edit-source-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-source-posts">Posts per fetch</Label>
              <Input
                id="edit-source-posts"
                type="number"
                min={1}
                max={50}
                value={form.maxArticlesPerFetch}
                onChange={(event) => updateForm({ maxArticlesPerFetch: Number(event.target.value) })}
                data-testid="input-edit-source-posts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source-retention">Article lifespan (days)</Label>
              <Input
                id="edit-source-retention"
                type="number"
                min={1}
                max={30}
                value={form.retentionDays}
                onChange={(event) => updateForm({ retentionDays: Number(event.target.value) })}
                data-testid="input-edit-source-retention"
              />
            </div>
          </div>

          {source.feedToken && (
            <div className="space-y-2 border-t pt-5">
              <Label htmlFor="generated-source-feed">Generated RSS URL</Label>
              <div className="flex gap-2">
                <Input
                  id="generated-source-feed"
                  value={`${PUBLIC_APP_URL}/feeds/${source.feedToken}.xml`}
                  readOnly
                  data-testid="input-generated-source-feed"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Copy generated RSS URL"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${PUBLIC_APP_URL}/feeds/${source.feedToken}.xml`);
                    setFeedCopied(true);
                    window.setTimeout(() => setFeedCopied(false), 1500);
                  }}
                  data-testid="button-copy-generated-feed"
                >
                  {feedCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 border-t pt-5" data-testid="source-maintenance-section">
            <div>
              <Label>Maintenance</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Rebuild clears this source's collected articles and immediately fetches again with the saved settings.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!canSave}
                  data-testid="button-open-rebuild-source"
                >
                  {rebuildSource.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Save & Rebuild Source
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rebuild this source?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will save the current settings for {source.name}, delete all articles collected from this source, then run a fresh fetch. The source itself and its settings will stay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={saveAndRebuild}
                    data-testid="button-confirm-rebuild-source"
                  >
                    Rebuild source
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave} data-testid="button-save-source-settings">
            {updateSource.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
