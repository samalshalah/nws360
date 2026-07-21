import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Newspaper,
  Plus,
  Search,
  Share2,
  Settings2,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiTelegram, SiX, SiYoutube } from "react-icons/si";
import { api, type CreateSourceRequest } from "@shared/routes";
import { GOOGLE_NEWS_EDITIONS, getGoogleNewsEdition } from "@shared/google-news-regions";
import { getSourceCategoryLabel, isSourceCategoryCode, type SourceCategoryCode } from "@shared/source-categories";
import type { WebsiteCollectorConfig } from "@shared/source-collector";
import { DEFAULT_SOURCE_FILTER_CONFIG, type SourceFilterConfig } from "@shared/source-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_WEBSITE_COLLECTOR_CONFIG, WebsiteCollectorFields } from "./WebsiteCollectorFields";
import { SourceFilterFields } from "./SourceFilterFields";

type AddMethod = "website" | "topic" | "social";
type SocialType = "youtube" | "twitter" | "facebook" | "instagram" | "telegram";
type SourceType = "website" | "rss" | "google_news" | SocialType;

interface DraftSource {
  key: string;
  name: string;
  url: string;
  type: SourceType;
  country?: string;
  category?: SourceCategoryCode;
  collectorConfig?: WebsiteCollectorConfig;
}

interface PreviewArticle {
  title: string;
  url: string;
  publishedAt?: string;
}

interface PreviewResult {
  success: boolean;
  method: string;
  articles: PreviewArticle[];
  feedUrl?: string;
  rendered?: boolean;
  warnings?: string[];
  error?: string;
}

interface PreviewEntry {
  draft: DraftSource;
  result: PreviewResult;
  ready: boolean;
}

interface DetectedChannel {
  type: SocialType;
  url: string;
  selected: boolean;
}

interface DetectedCategory {
  category: SourceCategoryCode;
  label: string;
  url: string;
  type: "rss" | "website";
  selected: boolean;
}

const SOCIAL_OPTIONS: Array<{
  type: SocialType;
  label: string;
  suffix: string;
  placeholder: string;
  icon: typeof SiYoutube;
  color: string;
}> = [
  { type: "youtube", label: "YouTube", suffix: "YouTube", placeholder: "https://youtube.com/@channel", icon: SiYoutube, color: "text-red-500" },
  { type: "twitter", label: "X / Twitter", suffix: "X", placeholder: "https://x.com/username", icon: SiX, color: "text-foreground" },
  { type: "facebook", label: "Facebook", suffix: "Facebook", placeholder: "https://facebook.com/page", icon: SiFacebook, color: "text-blue-600" },
  { type: "instagram", label: "Instagram", suffix: "Instagram", placeholder: "https://instagram.com/username", icon: SiInstagram, color: "text-pink-500" },
  { type: "telegram", label: "Telegram", suffix: "Telegram", placeholder: "https://t.me/channel", icon: SiTelegram, color: "text-sky-500" },
];

const METHOD_OPTIONS: Array<{
  method: AddMethod;
  title: string;
  description: string;
  icon: typeof Globe;
}> = [
  { method: "website", title: "Website / Publisher", description: "Website feed and official channels", icon: Newspaper },
  { method: "topic", title: "Topic / Keyword", description: "Regional Google News monitoring", icon: Search },
  { method: "social", title: "Social Channel", description: "A specific social account or channel", icon: Share2 },
];

const initialSettings = {
  intervalMinutes: 15,
  maxArticlesPerFetch: 10,
  retentionDays: 7,
};

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function inferWebsiteName(value: string): string {
  try {
    const hostname = new URL(normalizeWebsiteUrl(value)).hostname.replace(/^www\./, "");
    const base = hostname.split(".")[0].replace(/[-_]+/g, " ");
    return base.replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "";
  }
}

function socialOption(type: SocialType) {
  return SOCIAL_OPTIONS.find((option) => option.type === type)!;
}

function SettingsFields({
  settings,
  onChange,
}: {
  settings: typeof initialSettings;
  onChange: (settings: typeof initialSettings) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>Posts per fetch</Label>
          <span className="text-sm tabular-nums text-muted-foreground">{settings.maxArticlesPerFetch}</span>
        </div>
        <Slider
          value={[settings.maxArticlesPerFetch]}
          onValueChange={([value]) => onChange({ ...settings, maxArticlesPerFetch: value })}
          min={1}
          max={50}
          step={1}
          data-testid="slider-add-source-posts"
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>Article lifespan</Label>
          <span className="text-sm tabular-nums text-muted-foreground">{settings.retentionDays} days</span>
        </div>
        <Slider
          value={[settings.retentionDays]}
          onValueChange={([value]) => onChange({ ...settings, retentionDays: value })}
          min={1}
          max={30}
          step={1}
          data-testid="slider-add-source-retention"
        />
      </div>
      <div className="space-y-2">
        <Label>Fetch interval</Label>
        <Select
          value={String(settings.intervalMinutes)}
          onValueChange={(value) => onChange({ ...settings, intervalMinutes: Number(value) })}
        >
          <SelectTrigger data-testid="select-add-source-interval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 minutes</SelectItem>
            <SelectItem value="10">10 minutes</SelectItem>
            <SelectItem value="15">15 minutes</SelectItem>
            <SelectItem value="30">30 minutes</SelectItem>
            <SelectItem value="60">1 hour</SelectItem>
            <SelectItem value="120">2 hours</SelectItem>
            <SelectItem value="360">6 hours</SelectItem>
            <SelectItem value="720">12 hours</SelectItem>
            <SelectItem value="1440">24 hours</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SourceOptions({
  settings,
  onSettingsChange,
  filterConfig,
  onFilterChange,
  collector,
}: {
  settings: typeof initialSettings;
  onSettingsChange: (settings: typeof initialSettings) => void;
  filterConfig: SourceFilterConfig;
  onFilterChange: (config: SourceFilterConfig) => void;
  collector?: {
    value: WebsiteCollectorConfig;
    onChange: (config: WebsiteCollectorConfig) => void;
  };
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="border-t pt-4">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2">
            <Settings2 className="h-4 w-4" />
            Collection settings
            <Badge variant="secondary" className="ml-1">{settings.maxArticlesPerFetch} per fetch</Badge>
            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-3">
          {collector && <WebsiteCollectorFields value={collector.value} onChange={collector.onChange} />}
          <SettingsFields settings={settings} onChange={onSettingsChange} />
        </CollapsibleContent>
      </Collapsible>
      <SourceFilterFields value={filterConfig} onChange={onFilterChange} />
    </div>
  );
}

export function GlobalAddSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [method, setMethod] = useState<AddMethod | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>([]);
  const [filterConfig, setFilterConfig] = useState<SourceFilterConfig>(DEFAULT_SOURCE_FILTER_CONFIG);

  const [websiteName, setWebsiteName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  const [detectedChannels, setDetectedChannels] = useState<DetectedChannel[]>([]);
  const [detectedCategories, setDetectedCategories] = useState<DetectedCategory[]>([]);
  const [websiteCollectorConfig, setWebsiteCollectorConfig] = useState<WebsiteCollectorConfig>(DEFAULT_WEBSITE_COLLECTOR_CONFIG);

  const [topic, setTopic] = useState("");
  const [regionSearch, setRegionSearch] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const [socialType, setSocialType] = useState<SocialType>("youtube");
  const [socialName, setSocialName] = useState("");
  const [socialUrl, setSocialUrl] = useState("");

  useEffect(() => {
    if (open) return;
    setMethod(null);
    setShowPreview(false);
    setSettings(initialSettings);
    setPreviewEntries([]);
    setFilterConfig(DEFAULT_SOURCE_FILTER_CONFIG);
    setWebsiteName("");
    setWebsiteUrl("");
    setDiscoveryComplete(false);
    setDetectedChannels([]);
    setDetectedCategories([]);
    setWebsiteCollectorConfig(DEFAULT_WEBSITE_COLLECTOR_CONFIG);
    setTopic("");
    setRegionSearch("");
    setSelectedRegions([]);
    setSocialType("youtube");
    setSocialName("");
    setSocialUrl("");
  }, [open]);

  const filteredRegions = useMemo(() => {
    const query = regionSearch.trim().toLowerCase();
    if (!query) return GOOGLE_NEWS_EDITIONS;
    return GOOGLE_NEWS_EDITIONS.filter((edition) =>
      edition.name.toLowerCase().includes(query) || edition.code.toLowerCase().includes(query),
    );
  }, [regionSearch]);

  const discoverWebsite = async () => {
    const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
    if (!normalizedUrl) return;
    setIsDiscovering(true);
    setDiscoveryComplete(false);
    if (!websiteName.trim()) setWebsiteName(inferWebsiteName(normalizedUrl));
    setWebsiteUrl(normalizedUrl);
    try {
      const response = await fetch("/api/sources/discover-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      const body = response.ok ? await response.json() : { channels: {}, categories: [] };
      const channels = Object.entries(body.channels || {})
        .filter(([type]) => SOCIAL_OPTIONS.some((option) => option.type === type))
        .map(([type, value]) => ({
          type: type as SocialType,
          url: (value as { url: string }).url,
          selected: true,
        }));
      setDetectedChannels(channels);
      const categories = Array.isArray(body.categories)
        ? body.categories
          .filter((item: any) => isSourceCategoryCode(item?.category) && typeof item?.url === "string")
          .map((item: any) => ({
            category: item.category as SourceCategoryCode,
            label: typeof item.label === "string" ? item.label : getSourceCategoryLabel(item.category),
            url: item.url,
            type: item.type === "rss" ? "rss" as const : "website" as const,
            selected: false,
          }))
        : [];
      setDetectedCategories(categories);
      setDiscoveryComplete(true);
    } catch {
      setDetectedChannels([]);
      setDetectedCategories([]);
      setDiscoveryComplete(true);
      toast({ variant: "destructive", title: "Discovery failed", description: "The website could not be inspected." });
    } finally {
      setIsDiscovering(false);
    }
  };

  const buildDrafts = (): DraftSource[] => {
    if (method === "website") {
      const baseName = websiteName.trim();
      const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
      if (!baseName || !normalizedUrl) return [];
      return [
        { key: "publisher", name: baseName, url: normalizedUrl, type: "website", collectorConfig: websiteCollectorConfig },
        ...detectedCategories
          .filter((category) => category.selected)
          .map((category) => ({
            key: `category-${category.category}`,
            name: `${baseName} - ${category.label}`,
            url: category.url,
            type: category.type,
            category: category.category,
            collectorConfig: category.type === "website" ? websiteCollectorConfig : undefined,
          })),
        ...detectedChannels
          .filter((channel) => channel.selected && channel.url.trim())
          .map((channel) => ({
            key: `social-${channel.type}`,
            name: `${baseName} - ${socialOption(channel.type).suffix}`,
            url: channel.url.trim(),
            type: channel.type,
          })),
      ];
    }

    if (method === "topic") {
      const term = topic.trim();
      if (!term || selectedRegions.length === 0) return [];
      return selectedRegions.map((code) => {
        const edition = getGoogleNewsEdition(code);
        return {
          key: `topic-${edition.code}`,
          name: `${term} - ${edition.name}`,
          url: term,
          type: "google_news" as const,
          country: edition.code,
        };
      });
    }

    if (method === "social") {
      if (!socialName.trim() || !socialUrl.trim()) return [];
      return [{ key: `social-${socialType}`, name: socialName.trim(), url: socialUrl.trim(), type: socialType }];
    }

    return [];
  };

  const testAndPreview = async () => {
    const drafts = buildDrafts();
    if (drafts.length === 0) return;
    setIsTesting(true);
    try {
      const entries = await Promise.all(drafts.map(async (draft): Promise<PreviewEntry> => {
        try {
          const response = await fetch("/api/sources/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: draft.url,
              type: draft.type,
              country: draft.country,
              maxArticles: settings.maxArticlesPerFetch,
              collectorConfig: draft.collectorConfig,
              filterConfig,
            }),
          });
          const result = await response.json() as PreviewResult;
          const isFallback = draft.type !== "google_news" && result.method === "google_news_fallback";
          return { draft, result, ready: response.ok && result.success && result.articles.length > 0 && !isFallback };
        } catch {
          return {
            draft,
            ready: false,
            result: { success: false, method: "none", articles: [], error: "Connection failed" },
          };
        }
      }));
      setPreviewEntries(entries);
      setShowPreview(true);
    } finally {
      setIsTesting(false);
    }
  };

  const importSources = async () => {
    const readyEntries = previewEntries.filter((entry) => entry.ready);
    if (readyEntries.length === 0) return;
    setIsImporting(true);
    let created = 0;
    const failures: string[] = [];

    for (const entry of readyEntries) {
      const collectorConfig = entry.draft.type === "website"
        ? { ...(entry.draft.collectorConfig || DEFAULT_WEBSITE_COLLECTOR_CONFIG), feedUrl: entry.result.feedUrl || entry.draft.collectorConfig?.feedUrl }
        : undefined;
      const request: CreateSourceRequest = {
        name: entry.draft.name,
        url: entry.draft.url,
        type: entry.draft.type,
        country: entry.draft.country || null,
        category: entry.draft.category || null,
        collectorConfig,
        filterConfig,
        intervalMinutes: settings.intervalMinutes,
        maxArticlesPerFetch: settings.maxArticlesPerFetch,
        retentionDays: settings.retentionDays,
      };

      try {
        const response = await fetch(api.sources.create.path, {
          method: api.sources.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: "Create failed" }));
          throw new Error(body.message || "Create failed");
        }
        created += 1;
      } catch {
        failures.push(entry.draft.name);
      }
    }

    setIsImporting(false);
    await queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
    await queryClient.invalidateQueries({ queryKey: ["/api/sources/article-counts"] });

    if (created > 0) {
      toast({
        title: `${created} source${created === 1 ? "" : "s"} added`,
        description: failures.length > 0 ? `${failures.length} source${failures.length === 1 ? "" : "s"} could not be added.` : "Collection has started.",
      });
      onOpenChange(false);
    } else {
      toast({ variant: "destructive", title: "Sources were not added", description: "Please review the preview results and try again." });
    }
  };

  const readyCount = previewEntries.filter((entry) => entry.ready).length;
  const methodTitle = METHOD_OPTIONS.find((option) => option.method === method)?.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <div className="flex items-center gap-3">
            {method && !showPreview && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setMethod(null)}
                aria-label="Back to source methods"
                data-testid="button-add-source-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {showPreview && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setShowPreview(false)}
                aria-label="Back to source settings"
                data-testid="button-preview-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <DialogTitle>{showPreview ? "Preview sources" : methodTitle || "Add source"}</DialogTitle>
              <DialogDescription>
                {showPreview ? `${readyCount} of ${previewEntries.length} sources are ready` : "Choose how NWS360 should collect this coverage."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!method && (
            <div className="grid gap-3 md:grid-cols-3" data-testid="add-source-methods">
              {METHOD_OPTIONS.map(({ method: optionMethod, title, description, icon: Icon }) => (
                <button
                  key={optionMethod}
                  type="button"
                  className="flex min-h-36 flex-col items-start justify-between rounded-md border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setMethod(optionMethod)}
                  data-testid={`method-${optionMethod}`}
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {method === "website" && !showPreview && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="publisher-name">Publisher name</Label>
                  <Input
                    id="publisher-name"
                    value={websiteName}
                    onChange={(event) => setWebsiteName(event.target.value)}
                    placeholder="BBC News"
                    data-testid="input-publisher-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisher-url">Website URL</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="publisher-url"
                      value={websiteUrl}
                      onChange={(event) => {
                        setWebsiteUrl(event.target.value);
                        setDiscoveryComplete(false);
                      }}
                      placeholder="https://example.com"
                      data-testid="input-publisher-url"
                    />
                    <Button
                      variant="outline"
                      className="shrink-0 gap-2"
                      onClick={discoverWebsite}
                      disabled={!websiteUrl.trim() || isDiscovering}
                      data-testid="button-discover-publisher"
                    >
                      {isDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Discover
                    </Button>
                  </div>
                </div>
              </div>

              {discoveryComplete && (
                <div className="space-y-3" data-testid="publisher-discovery-results">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label>Publisher sources</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{detectedCategories.length} categor{detectedCategories.length === 1 ? "y" : "ies"}</Badge>
                      <Badge variant="secondary">{detectedChannels.length} social</Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="flex min-w-0 items-center gap-3 rounded-md border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Globe className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Publisher feed</div>
                        <div className="truncate text-xs text-muted-foreground">{websiteUrl}</div>
                      </div>
                      <Badge variant="outline">Required</Badge>
                    </div>

                    <div className="flex min-w-0 items-center gap-3 rounded-md border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Tags className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">News categories</div>
                        <div className="text-xs text-muted-foreground">{detectedCategories.filter((item) => item.selected).length} selected</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Choose news categories" disabled={detectedCategories.length === 0}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                          <DropdownMenuLabel>News categories</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {detectedCategories.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">No category sections detected</div>}
                          {detectedCategories.map((category) => (
                            <DropdownMenuCheckboxItem
                              key={category.category}
                              checked={category.selected}
                              onCheckedChange={(checked) => setDetectedCategories((current) => current.map((item) => item.category === category.category ? { ...item, selected: checked === true } : item))}
                              onSelect={(event) => event.preventDefault()}
                              data-testid={`category-${category.category}`}
                            >
                              <span className="min-w-0 flex-1 truncate">{category.label}</span>
                              <Badge variant="secondary" className="ml-2">{category.type === "rss" ? "RSS" : "Section"}</Badge>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex min-w-0 items-center gap-3 rounded-md border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Share2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Social channels</div>
                        <div className="text-xs text-muted-foreground">{detectedChannels.filter((item) => item.selected).length} selected</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Choose social channels" disabled={detectedChannels.length === 0}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                          <DropdownMenuLabel>Official social channels</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {detectedChannels.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">No official channels detected</div>}
                          {detectedChannels.map((channel) => {
                            const option = socialOption(channel.type);
                            const Icon = option.icon;
                            return (
                              <DropdownMenuCheckboxItem
                                key={channel.type}
                                checked={channel.selected}
                                onCheckedChange={(checked) => setDetectedChannels((current) => current.map((item) => item.type === channel.type ? { ...item, selected: checked === true } : item))}
                                onSelect={(event) => event.preventDefault()}
                              >
                                <Icon className={`mr-2 h-4 w-4 ${option.color}`} />
                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )}

              <SourceOptions
                settings={settings}
                onSettingsChange={setSettings}
                filterConfig={filterConfig}
                onFilterChange={setFilterConfig}
                collector={{ value: websiteCollectorConfig, onChange: setWebsiteCollectorConfig }}
              />
            </div>
          )}

          {method === "topic" && !showPreview && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="topic-keyword">Topic or keyword</Label>
                <Input
                  id="topic-keyword"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Iraqi oil"
                  data-testid="input-topic-keyword"
                />
              </div>

              <div className="space-y-3">
                <Label>Google News regions</Label>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Coverage regions</div>
                    <div className="text-xs text-muted-foreground">Choose one or more Google News editions</div>
                  </div>
                  <Badge variant={selectedRegions.length > 0 ? "default" : "secondary"}>{selectedRegions.length} selected</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Choose Google News regions">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80" data-testid="region-list">
                      <DropdownMenuLabel>Google News regions</DropdownMenuLabel>
                      <div className="px-2 pb-2">
                        <Input
                          value={regionSearch}
                          onChange={(event) => setRegionSearch(event.target.value)}
                          onKeyDown={(event) => event.stopPropagation()}
                          placeholder="Search 35 regions"
                          data-testid="input-region-search"
                        />
                      </div>
                      <DropdownMenuSeparator />
                      {filteredRegions.map((edition) => (
                        <DropdownMenuCheckboxItem
                          key={edition.code}
                          checked={selectedRegions.includes(edition.code)}
                          onCheckedChange={(checked) => setSelectedRegions((current) => checked === true
                            ? Array.from(new Set([...current, edition.code]))
                            : current.filter((code) => code !== edition.code))}
                          onSelect={(event) => event.preventDefault()}
                          data-testid={`region-${edition.code.toLowerCase()}`}
                        >
                          <span className="min-w-0 flex-1">{edition.name}</span>
                          <span className="ml-2 text-xs font-medium text-muted-foreground">{edition.code}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {selectedRegions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRegions.slice(0, 6).map((code) => <Badge key={code} variant="secondary">{getGoogleNewsEdition(code).name}</Badge>)}
                    {selectedRegions.length > 6 && <Badge variant="outline">+{selectedRegions.length - 6}</Badge>}
                  </div>
                )}
              </div>

              <SourceOptions settings={settings} onSettingsChange={setSettings} filterConfig={filterConfig} onFilterChange={setFilterConfig} />
            </div>
          )}

          {method === "social" && !showPreview && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Platform</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {SOCIAL_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const selected = socialType === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border p-3 text-center text-xs font-medium transition-colors ${selected ? "border-primary bg-primary/10" : "bg-card hover:bg-accent/40"}`}
                        onClick={() => {
                          setSocialType(option.type);
                          setSocialUrl("");
                        }}
                        data-testid={`social-platform-${option.type}`}
                      >
                        <Icon className={`h-5 w-5 ${option.color}`} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="social-name">Source name</Label>
                  <Input
                    id="social-name"
                    value={socialName}
                    onChange={(event) => setSocialName(event.target.value)}
                    placeholder="BBC Arabic"
                    data-testid="input-social-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="social-url">Channel URL</Label>
                  <Input
                    id="social-url"
                    value={socialUrl}
                    onChange={(event) => setSocialUrl(event.target.value)}
                    placeholder={socialOption(socialType).placeholder}
                    data-testid="input-social-url"
                  />
                </div>
              </div>
              <SourceOptions settings={settings} onSettingsChange={setSettings} filterConfig={filterConfig} onFilterChange={setFilterConfig} />
            </div>
          )}

          {showPreview && (
            <div className="grid gap-3 md:grid-cols-2" data-testid="source-preview-list">
              {previewEntries.map((entry) => (
                <div key={entry.draft.key} className="overflow-hidden rounded-md border">
                  <div className="flex items-center gap-3 bg-muted/30 px-4 py-3">
                    {entry.ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{entry.draft.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{entry.draft.url}</div>
                    </div>
                    {entry.draft.country && <Badge variant="outline">{entry.draft.country}</Badge>}
                    {entry.draft.category && <Badge variant="outline">{getSourceCategoryLabel(entry.draft.category)}</Badge>}
                    {entry.draft.type === "website" && entry.ready && <Badge variant="outline">{entry.result.method}</Badge>}
                    <Badge variant={entry.ready ? "secondary" : "destructive"}>
                      {entry.ready ? `${entry.result.articles.length} articles` : "Unavailable"}
                    </Badge>
                  </div>
                  {entry.ready && (
                    <div className="divide-y">
                      {entry.result.articles.slice(0, 3).map((article, index) => (
                        <div key={`${article.url}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1 truncate text-sm">{article.title}</div>
                          {article.url && (
                            <a href={article.url} target="_blank" rel="noreferrer" aria-label="Open article" className="text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!entry.ready && <div className="px-4 py-3 text-sm text-destructive">{entry.result.error || "No direct feed was found."}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {method && (
          <div className="flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {showPreview ? (
              <Button onClick={importSources} disabled={readyCount === 0 || isImporting} data-testid="button-import-sources">
                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add {readyCount} source{readyCount === 1 ? "" : "s"}
              </Button>
            ) : (
              <Button
                onClick={testAndPreview}
                disabled={buildDrafts().length === 0 || isTesting || (method === "website" && !discoveryComplete)}
                data-testid="button-test-source"
              >
                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Test & Preview
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
