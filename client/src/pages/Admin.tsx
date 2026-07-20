import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSources, useCreateSource, useDeleteSource, useFetchSource, useFetchAllSources, useUpdateSource } from "@/hooks/use-sources";
import { useKeywords, useCreateKeyword, useDeleteKeyword } from "@/hooks/use-keywords";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";


import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Minus, Trash2, Globe, Rss, Loader2, RefreshCw, Search, Newspaper, Hash, ChevronLeft, ChevronDown, ChevronRight, ArrowRight, ThumbsUp, MessageCircle, Share2, Info, CheckCircle2, AlertTriangle, ExternalLink, Pencil, Upload } from "lucide-react";
import { SiX, SiYoutube, SiFacebook, SiInstagram, SiTelegram, SiGooglenews } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { CAPS, type Source } from "@shared/schema";
import { getSourceCategoryLabel } from "@shared/source-categories";
import { GlobalAddSourceDialog } from "@/components/sources/GlobalAddSourceDialog";
import { EditSourceDialog } from "@/components/sources/EditSourceDialog";
import { FeedImportDialog } from "@/components/sources/FeedImportDialog";

function CardInfo({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid="button-card-info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="text-sm max-w-sm">
        {description}
      </PopoverContent>
    </Popover>
  );
}

const SOURCE_TYPES = [
  { type: "website", icon: Globe, label: "admin.website", color: "text-blue-500" },
  { type: "rss", icon: Rss, label: "admin.rss", color: "text-orange-500" },
  { type: "google_news", icon: SiGooglenews, label: "admin.googleNews", color: "text-blue-600" },
  { type: "youtube", icon: SiYoutube, label: "admin.youtube", color: "text-red-500" },
  { type: "twitter", icon: SiX, label: "admin.twitter", color: "text-foreground" },
  { type: "facebook", icon: SiFacebook, label: "admin.facebook", color: "text-blue-600" },
  { type: "instagram", icon: SiInstagram, label: "admin.instagram", color: "text-pink-500" },
  { type: "telegram", icon: SiTelegram, label: "admin.telegram", color: "text-sky-500" },
];

const TOPIC_CATEGORIES = [
  {
    category: "technology",
    topics: ["Artificial Intelligence", "ChatGPT", "Cybersecurity", "Apps", "Gaming", "Virtual Reality"],
  },
  {
    category: "politics",
    topics: ["US Politics", "Geopolitics", "Congress", "Global News", "Elections", "Policy"],
  },
  {
    category: "business",
    topics: ["Startups", "Entrepreneurship", "Marketing", "Leadership", "E-Commerce", "Small Business"],
  },
  {
    category: "finance",
    topics: ["Stock Market", "Investing", "Personal Finance", "Economy", "Real Estate", "Cryptocurrency"],
  },
  {
    category: "sports",
    topics: ["Football", "Basketball", "Soccer", "Baseball", "Formula 1", "Tennis"],
  },
  {
    category: "health",
    topics: ["Mental Health", "Fitness", "Nutrition", "Weight Loss", "Wellness", "Healthy Eating"],
  },
  {
    category: "science",
    topics: ["Space", "NASA", "Astronomy", "Climate Change", "Sustainability", "Robotics"],
  },
  {
    category: "entertainment",
    topics: ["Movies", "Music", "TV Shows", "Celebrities", "Streaming", "Pop Culture"],
  },
  {
    category: "lifestyle",
    topics: ["Travel", "Fashion", "Food & Drink", "Home Decor", "Photography", "Beauty"],
  },
];

export default function Admin({
  tab = "manage",
  initialAddOpen = false,
}: {
  tab?: "add" | "manage" | "keywords";
  initialAddOpen?: boolean;
}) {
  const { t } = useTranslation();

  const titles: Record<string, { title: string; subtitle: string }> = {
    add: { title: t("admin.title"), subtitle: t("admin.subtitle") },
    manage: { title: t("admin.manageSources"), subtitle: t("admin.subtitle") },
    keywords: { title: t("admin.keywords"), subtitle: t("admin.keywordsDescription") },
  };

  const current = titles[tab] || titles.add;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-title">{current.title}</h1>
        <p className="text-muted-foreground">{current.subtitle}</p>
      </div>

      {tab === "add" && <AddSourceView />}
      {tab === "manage" && <SourcesManager initialAddOpen={initialAddOpen} />}
      {tab === "keywords" && <KeywordsManager />}
    </div>
  );
}

interface WebsiteSearchResult {
  name: string;
  url: string;
  feedUrl: string | null;
  hasFeed: boolean;
}

type PreviewArticle = {
  title: string;
  url: string;
  content: string;
  publishedAt: string;
  image?: string;
};

type PreviewResult = {
  success: boolean;
  method: string;
  articles: PreviewArticle[];
  feedUrl?: string;
  error?: string;
};

const CHANNEL_OPTIONS = [
  { type: "website", icon: Globe, label: "Website", suffix: "", color: "text-blue-500", needsUrl: false, placeholder: "" },
  { type: "rss", icon: Rss, label: "RSS Feed", suffix: "-RSS", color: "text-orange-500", needsUrl: false, placeholder: "" },
  { type: "google_news", icon: SiGooglenews, label: "Google News", suffix: "-News", color: "text-blue-600", needsUrl: false, placeholder: "" },
  { type: "facebook", icon: SiFacebook, label: "Facebook", suffix: "-FB", color: "text-blue-600", needsUrl: true, placeholder: "https://facebook.com/pagename" },
  { type: "twitter", icon: SiX, label: "X / Twitter", suffix: "-X", color: "text-foreground", needsUrl: true, placeholder: "https://x.com/username" },
  { type: "youtube", icon: SiYoutube, label: "YouTube", suffix: "-YT", color: "text-red-500", needsUrl: true, placeholder: "https://youtube.com/@channel" },
  { type: "instagram", icon: SiInstagram, label: "Instagram", suffix: "-IG", color: "text-pink-500", needsUrl: true, placeholder: "https://instagram.com/username" },
  { type: "telegram", icon: SiTelegram, label: "Telegram", suffix: "-TG", color: "text-sky-500", needsUrl: true, placeholder: "https://t.me/channelname" },
];

type ChannelState = {
  enabled: boolean;
  url: string;
  previewResult?: PreviewResult;
  status: "idle" | "testing" | "success" | "failed";
  discovered?: boolean;
};

function AddSourceView({ onImported }: { onImported?: () => void }) {
  const { t } = useTranslation();
  const { mutate: createSource, isPending: isCreating } = useCreateSource();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WebsiteSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [showChannelDialog, setShowChannelDialog] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [channels, setChannels] = useState<Record<string, ChannelState>>(() => {
    const init: Record<string, ChannelState> = {};
    CHANNEL_OPTIONS.forEach(ch => {
      init[ch.type] = { enabled: ch.type === "website", url: "", status: "idle" };
    });
    return init;
  });
  const [settings, setSettings] = useState({
    intervalMinutes: 15,
    maxArticlesPerFetch: 10,
    retentionDays: 7,
  });
  const [step, setStep] = useState<"channels" | "preview">("channels");
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryDone, setDiscoveryDone] = useState(false);

  const searchWebsites = useCallback(async (query: string) => {
    if (query.length < 2) return;
    setIsSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(`/api/search-websites?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const openChannelDialog = (name: string, url: string) => {
    setSourceName(name);
    setSourceUrl(url);
    const init: Record<string, ChannelState> = {};
    CHANNEL_OPTIONS.forEach(ch => {
      init[ch.type] = { enabled: ch.type === "website", url: "", status: "idle" };
    });
    setChannels(init);
    setStep("channels");
    setDiscoveryDone(false);
    setShowChannelDialog(true);

    if (url && (url.includes(".") || url.startsWith("http"))) {
      discoverChannels(url, init);
    }
  };

  const discoverChannels = async (url: string, currentChannels?: Record<string, ChannelState>) => {
    setIsDiscovering(true);
    try {
      const res = await fetch("/api/sources/discover-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        const discovered = data.channels || {};
        setChannels(prev => {
          const base = currentChannels || prev;
          const updated: Record<string, ChannelState> = {};
          for (const [type, state] of Object.entries(base)) {
            updated[type] = { ...state, discovered: false };
          }
          for (const [type, info] of Object.entries(discovered) as [string, { url: string; confidence: string }][]) {
            if (updated[type]) {
              updated[type] = {
                ...updated[type],
                enabled: true,
                url: info.url,
                discovered: true,
                status: "idle",
              };
            }
          }
          return updated;
        });
      }
    } catch {}
    setIsDiscovering(false);
    setDiscoveryDone(true);
  };

  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (q.startsWith("http://") || q.startsWith("https://") || q.includes(".")) {
      const name = q.replace(/https?:\/\/(www\.)?/, "").split("/")[0].split(".")[0];
      const capitalName = name.charAt(0).toUpperCase() + name.slice(1);
      openChannelDialog(capitalName, q);
    } else {
      openChannelDialog(q, q);
    }
  };

  const selectSearchResult = (result: WebsiteSearchResult) => {
    openChannelDialog(result.name, result.feedUrl || result.url);
    setShowResults(false);
    setSearchQuery("");
  };

  const selectSourceType = (type: string) => {
    openChannelDialog("", "");
    const init: Record<string, ChannelState> = {};
    CHANNEL_OPTIONS.forEach(ch => {
      init[ch.type] = { enabled: ch.type === type, url: "", status: "idle" };
    });
    setChannels(init);
  };

  const selectTopic = (topic: string) => {
    openChannelDialog(topic, topic);
    const init: Record<string, ChannelState> = {};
    CHANNEL_OPTIONS.forEach(ch => {
      init[ch.type] = { enabled: ch.type === "google_news", url: "", status: "idle" };
    });
    setChannels(init);
  };

  const toggleChannel = (type: string) => {
    setChannels(prev => ({
      ...prev,
      [type]: { ...prev[type], enabled: !prev[type].enabled, status: "idle", previewResult: undefined, discovered: !prev[type].enabled ? prev[type].discovered : false },
    }));
  };

  const setChannelUrl = (type: string, url: string) => {
    setChannels(prev => ({
      ...prev,
      [type]: { ...prev[type], url, discovered: false },
    }));
  };

  const enabledChannels = CHANNEL_OPTIONS.filter(ch => channels[ch.type]?.enabled);

  const handleTestAll = async () => {
    if (!sourceName.trim()) return;
    setIsTesting(true);

    const updated = { ...channels };
    for (const ch of enabledChannels) {
      updated[ch.type] = { ...updated[ch.type], status: "testing" };
    }
    setChannels({ ...updated });

    for (const ch of enabledChannels) {
      const testUrl = ch.needsUrl ? channels[ch.type].url : sourceUrl;
      if (!testUrl.trim()) {
        updated[ch.type] = { ...updated[ch.type], status: "failed", previewResult: { success: false, method: "none", articles: [], error: "No URL provided" } };
        setChannels({ ...updated });
        continue;
      }
      try {
        const res = await fetch("/api/sources/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: testUrl, type: ch.type, maxArticles: settings.maxArticlesPerFetch }),
        });
        const data: PreviewResult = await res.json();
        const isGoogleFallback = data.method === "google_news_fallback";
        const isNativeFeed = !isGoogleFallback;
        if (data.success && data.articles.length > 0 && isNativeFeed) {
          updated[ch.type] = { ...updated[ch.type], status: "success", previewResult: data };
        } else {
          const failReason = isGoogleFallback
            ? { ...data, success: false, error: ch.type === "website" ? "No RSS feed found for this website" : `Could not connect to ${ch.label || ch.type} feed directly` }
            : data;
          updated[ch.type] = { ...updated[ch.type], status: "failed", previewResult: failReason };
        }
      } catch {
        updated[ch.type] = { ...updated[ch.type], status: "failed", previewResult: { success: false, method: "none", articles: [], error: "Connection failed" } };
      }
      setChannels({ ...updated });
    }

    setIsTesting(false);
    setStep("preview");
  };

  const successfulChannels = enabledChannels.filter(ch => channels[ch.type]?.status === "success");

  const handleConfirmImport = async () => {
    if (successfulChannels.length === 0) return;
    setIsImporting(true);

    for (const ch of successfulChannels) {
      const preview = channels[ch.type].previewResult;
      const suffix = successfulChannels.length > 1 ? ch.suffix : "";
      const finalName = `${sourceName.trim()}${suffix}`;
      let finalUrl = ch.needsUrl ? channels[ch.type].url : sourceUrl;
      let finalType = ch.type;

      if (preview?.method === "rss" && preview?.feedUrl) {
        finalType = "rss";
        finalUrl = preview.feedUrl;
      }

      await new Promise<void>((resolve) => {
        createSource(
          {
            name: finalName,
            url: finalUrl,
            type: finalType,
            intervalMinutes: settings.intervalMinutes,
            maxArticlesPerFetch: settings.maxArticlesPerFetch,
            retentionDays: settings.retentionDays,
          },
          { onSuccess: () => resolve(), onError: () => resolve() }
        );
      });
    }

    setIsImporting(false);
    setShowChannelDialog(false);
    setSourceName("");
    setSourceUrl("");
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    onImported?.();
  };

  const resetDialog = () => {
    setShowChannelDialog(false);
    setStep("channels");
    setSourceName("");
    setSourceUrl("");
    setDiscoveryDone(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    searchWebsites(searchQuery);
                    handleSearchSubmit();
                  }
                }
              }}
              placeholder={t("admin.searchPlaceholder")}
              className="pl-10"
              data-testid="input-search-websites"
            />
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              if (searchQuery.trim()) {
                searchWebsites(searchQuery);
                handleSearchSubmit();
              }
            }}
            disabled={!searchQuery.trim()}
            data-testid="button-search-websites"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.generate")}
          </Button>
        </div>

        {showResults && searchResults.length > 0 && (
          <Card className="mt-3">
            <CardContent className="p-0">
              <div className="max-h-64 overflow-y-auto">
                {searchResults.map((result, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSearchResult(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover-elevate transition-colors border-b border-border/50 last:border-b-0"
                    data-testid={`search-result-${idx}`}
                  >
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{result.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{result.url}</div>
                    </div>
                    {result.hasFeed && (
                      <Badge variant="secondary" className="shrink-0">
                        <Rss className="w-3 h-3 mr-1" />
                        RSS
                      </Badge>
                    )}
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("admin.selectSourceType")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {SOURCE_TYPES.map(({ type, icon: Icon, label, color }) => (
            <button
              key={type}
              onClick={() => selectSourceType(type)}
              className="flex items-center gap-3 p-4 rounded-md border border-border bg-card hover-elevate transition-all text-left"
              data-testid={`source-type-${type}`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${color}`} />
              <span className="text-sm font-medium truncate">{t(label as any)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("admin.topicsByIndustry")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOPIC_CATEGORIES.map(({ category, topics }) => (
            <Card key={category} className="overflow-visible">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  {t(`admin.topicCategories.${category}` as any)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {topics.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => selectTopic(topic)}
                      className="flex items-center gap-2 w-full text-left text-sm py-1.5 px-2 rounded-md hover-elevate transition-colors text-muted-foreground"
                      data-testid={`topic-${topic.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Hash className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="truncate">{topic}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showChannelDialog} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          {step === "channels" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Add New Source
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Enter source details and select import channels
                </p>
              </DialogHeader>

              <div className="space-y-4 flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Source Name</Label>
                    <Input
                      value={sourceName}
                      onChange={e => setSourceName(e.target.value)}
                      placeholder="e.g. CNN, BBC, Al Jazeera"
                      data-testid="input-channel-source-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Website URL</Label>
                    <Input
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      placeholder="e.g. cnn.com"
                      data-testid="input-channel-source-url"
                    />
                    <p className="text-xs text-muted-foreground">Used for Website, RSS, and Google News channels</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <Label>Import Channels</Label>
                      <p className="text-xs text-muted-foreground">Select channels to import from. Each creates a separate source.</p>
                    </div>
                    {isDiscovering && (
                      <Badge variant="secondary" data-testid="badge-discovering">
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        Finding channels...
                      </Badge>
                    )}
                    {discoveryDone && !isDiscovering && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sourceUrl && discoverChannels(sourceUrl)}
                        disabled={!sourceUrl.trim() || isDiscovering}
                        data-testid="button-rediscover-channels"
                      >
                        <Search className="w-3 h-3 mr-1" />
                        Re-scan
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {CHANNEL_OPTIONS.map((ch) => {
                      const Icon = ch.icon;
                      const state = channels[ch.type];
                      const suffix = ch.suffix;
                      const displayName = sourceName.trim() ? `${sourceName.trim()}${suffix}` : ch.label;
                      return (
                        <div key={ch.type} className="space-y-2">
                          <div
                            className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${state.discovered ? "border-green-500/50 bg-green-500/5" : state.enabled ? "border-primary/50 bg-primary/5" : "border-border"}`}
                          >
                            <Switch
                              checked={state.enabled}
                              onCheckedChange={() => toggleChannel(ch.type)}
                              data-testid={`switch-channel-${ch.type}`}
                            />
                            <Icon className={`w-4 h-4 shrink-0 ${ch.color}`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{ch.label}</span>
                              {state.enabled && sourceName.trim() && suffix && (
                                <span className="text-xs text-muted-foreground ml-2">({displayName})</span>
                              )}
                            </div>
                            {state.discovered && (
                              <Badge variant="secondary" className="shrink-0" data-testid={`badge-discovered-${ch.type}`}>
                                <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                                Found
                              </Badge>
                            )}
                          </div>
                          {state.enabled && ch.needsUrl && (
                            <div className="ml-10">
                              <Input
                                value={state.url}
                                onChange={e => setChannelUrl(ch.type, e.target.value)}
                                placeholder={ch.placeholder}
                                className={`text-sm ${state.discovered ? "border-green-500/30" : ""}`}
                                data-testid={`input-channel-url-${ch.type}`}
                              />
                              {state.discovered && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-1" data-testid={`text-discovered-hint-${ch.type}`}>
                                  Auto-detected from website. You can edit if needed.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Posts per fetch</Label>
                      <span className="text-sm font-medium text-muted-foreground" data-testid="text-channel-posts-per-fetch">{settings.maxArticlesPerFetch}</span>
                    </div>
                    <Slider
                      value={[settings.maxArticlesPerFetch]}
                      onValueChange={([val]) => setSettings(prev => ({ ...prev, maxArticlesPerFetch: val }))}
                      min={1} max={50} step={1}
                      data-testid="slider-channel-posts-per-fetch"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Article lifespan</Label>
                      <span className="text-sm font-medium text-muted-foreground" data-testid="text-channel-retention">{settings.retentionDays} days</span>
                    </div>
                    <Slider
                      value={[settings.retentionDays]}
                      onValueChange={([val]) => setSettings(prev => ({ ...prev, retentionDays: val }))}
                      min={1} max={30} step={1}
                      data-testid="slider-channel-retention"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fetch interval</Label>
                    <Select
                      value={String(settings.intervalMinutes)}
                      onValueChange={(val) => setSettings(prev => ({ ...prev, intervalMinutes: parseInt(val) }))}
                    >
                      <SelectTrigger data-testid="select-channel-interval">
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
              </div>

              <div className="pt-3 border-t">
                <Button
                  className="w-full"
                  disabled={!sourceName.trim() || enabledChannels.length === 0 || isTesting}
                  onClick={handleTestAll}
                  data-testid="button-test-channels"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Testing {enabledChannels.length} channel{enabledChannels.length !== 1 ? "s" : ""}...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Test & Preview ({enabledChannels.length} channel{enabledChannels.length !== 1 ? "s" : ""})
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Preview Results
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {successfulChannels.length} of {enabledChannels.length} channel{enabledChannels.length !== 1 ? "s" : ""} ready to import
                </p>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0" data-testid="preview-channels-list">
                {enabledChannels.map((ch) => {
                  const Icon = ch.icon;
                  const state = channels[ch.type];
                  const suffix = enabledChannels.length > 1 ? ch.suffix : "";
                  const displayName = `${sourceName.trim()}${suffix}`;
                  const articles = state.previewResult?.articles || [];

                  return (
                    <div key={ch.type} className="rounded-md border" data-testid={`preview-channel-${ch.type}`}>
                      <div className={`flex items-center gap-3 p-3 ${state.status === "success" ? "bg-green-500/5" : state.status === "failed" ? "bg-destructive/5" : "bg-muted/30"}`}>
                        <Icon className={`w-4 h-4 shrink-0 ${ch.color}`} />
                        <span className="text-sm font-medium flex-1">{displayName}</span>
                        {state.status === "testing" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        {state.status === "success" && (
                          <Badge variant="secondary" data-testid={`badge-channel-success-${ch.type}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                            {articles.length} article{articles.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {state.status === "failed" && (
                          <Badge variant="secondary" data-testid={`badge-channel-failed-${ch.type}`}>
                            <AlertTriangle className="w-3 h-3 mr-1 text-destructive" />
                            Failed
                          </Badge>
                        )}
                      </div>
                      {state.status === "success" && articles.length > 0 && (
                        <div className="border-t max-h-48 overflow-y-auto">
                          {articles.slice(0, 5).map((article, idx) => (
                            <div key={idx} className="flex gap-3 px-3 py-2 border-b border-border/30 last:border-b-0" data-testid={`preview-article-${ch.type}-${idx}`}>
                              {article.image && (
                                <img
                                  src={article.image}
                                  alt=""
                                  className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-tight line-clamp-1">{article.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {article.publishedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      {(() => {
                                        try { return formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }); }
                                        catch { return ""; }
                                      })()}
                                    </span>
                                  )}
                                  {article.url && (
                                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground flex items-center gap-1 hover-elevate rounded px-1" data-testid={`link-preview-${ch.type}-${idx}`}>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {articles.length > 5 && (
                            <p className="text-xs text-muted-foreground text-center py-1.5">+{articles.length - 5} more</p>
                          )}
                        </div>
                      )}
                      {state.status === "failed" && state.previewResult?.error && (
                        <div className="border-t px-3 py-2">
                          <p className="text-xs text-destructive">{state.previewResult.error}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <Button variant="outline" onClick={() => setStep("channels")} data-testid="button-back-to-channels">
                  Back
                </Button>
                <Button variant="outline" className="flex-1" onClick={resetDialog} data-testid="button-cancel-import">
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleConfirmImport}
                  disabled={successfulChannels.length === 0 || isImporting}
                  data-testid="button-confirm-import"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Import {successfulChannels.length} Source{successfulChannels.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <GlobalAddSourceDialog open={open} onOpenChange={onOpenChange} />;
}

function SourcesManager({ initialAddOpen = false }: { initialAddOpen?: boolean }) {
  const { t } = useTranslation();
  const { hasCap } = usePermissions();
  const { data: sources, isLoading } = useSources();
  const { mutate: deleteSource, isPending: isDeleting } = useDeleteSource();
  const { mutate: fetchSource, isPending: isFetchingOne, variables: fetchingSourceId } = useFetchSource();
  const { mutate: fetchAll, isPending: isFetchingAll } = useFetchAllSources();
  const { mutate: updateSource } = useUpdateSource();
  const { data: articleCounts } = useQuery<Record<number, number>>({
    queryKey: ["/api/sources/article-counts"],
    queryFn: async () => {
      const res = await fetch("/api/sources/article-counts");
      if (!res.ok) return {};
      return res.json();
    },
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewingSource, setViewingSource] = useState<{ id: number; name: string } | null>(null);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(initialAddOpen);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { data: sourceArticles, isLoading: isLoadingArticles } = useQuery<any[]>({
    queryKey: ["/api/articles", { sourceId: viewingSource?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/articles?sourceId=${viewingSource!.id}&limit=50`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || data;
    },
    enabled: !!viewingSource,
  });

  const sourceTypeLabels: Record<string, string> = {
    rss: t("admin.rss"),
    website: t("admin.website"),
    twitter: t("admin.twitter"),
    youtube: t("admin.youtube"),
    facebook: t("admin.facebook"),
    instagram: t("admin.instagram"),
    telegram: t("admin.telegram"),
    google_news: t("admin.googleNews"),
  };

  const getSourceIcon = (type: string) => {
    const config = SOURCE_TYPES.find(s => s.type === type);
    if (!config) return Globe;
    return config.icon;
  };

  const getSourceColor = (type: string) => {
    const config = SOURCE_TYPES.find(s => s.type === type);
    return config?.color || "";
  };

  const socialSuffixes: Record<string, string[]> = {
    facebook: ["Facebook", "FB"],
    twitter: ["X", "Twitter"],
    youtube: ["YouTube", "YT"],
    instagram: ["Instagram", "IG"],
    telegram: ["Telegram", "TG"],
    rss: ["RSS", "News"],
  };
  const sourceVariantLabel = (source: any): string => {
    if (source.category) return getSourceCategoryLabel(source.category);
    const suffixes = socialSuffixes[source.type] || [];
    const suffix = suffixes.find((item) => source.name.endsWith(` - ${item}`) || source.name.endsWith(`-${item}`));
    return suffix || sourceTypeLabels[source.type] || source.type;
  };
  const getGroupName = (source: any): string => {
    const variant = sourceVariantLabel(source);
    for (const suffix of [` - ${variant}`, `-${variant}`]) {
      if (source.name.endsWith(suffix)) return source.name.slice(0, -suffix.length);
    }
    return source.name;
  };

  const sourceGroups = (sources || []).reduce((acc, source) => {
    const key = getGroupName(source);
    if (!acc[key]) acc[key] = [];
    acc[key].push(source);
    return acc;
  }, {} as Record<string, typeof sources extends (infer T)[] | undefined ? T[] : never[]>);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const channelShortLabels: Record<string, string> = {
    website: "W",
    rss: "RSS",
    google_news: "GN",
    youtube: "YT",
    twitter: "X",
    facebook: "FB",
    instagram: "IG",
    telegram: "TG",
  };

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">{t("admin.newsSources")}<CardInfo description="Add and manage RSS feeds, websites, and social media accounts to monitor. Configure fetch frequency and auto-discovery for each source." /></CardTitle>
          <CardDescription>{t("admin.sourcesDescription")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {hasCap(CAPS.SOURCES_ADD) && (
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setIsImportOpen(true)}
                data-testid="button-import-feeds"
              >
                <Upload className="w-4 h-4" />
                Import Feeds
              </Button>
              <Button
                className="gap-2"
                onClick={() => setIsAddSourceOpen(true)}
                data-testid="button-add-source"
              >
                <Plus className="w-4 h-4" />
                {t("admin.addSource")}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fetchAll()}
            disabled={isFetchingAll}
            data-testid="button-fetch-all"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingAll ? "animate-spin" : ""}`} />
            {isFetchingAll ? t("admin.fetching") : t("admin.fetchAll")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sources?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("admin.noSources")}</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{t("admin.sourceName")}</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Articles</TableHead>
                    <TableHead>{t("admin.status")}</TableHead>
                    <TableHead>{t("admin.lastFetched")}</TableHead>
                    <TableHead className="text-right rtl:text-left">{t("admin.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(sourceGroups).map(([groupName, groupSources]) => {
                    const isExpanded = expandedGroups.has(groupName);
                    const totalArticles = groupSources.reduce((sum, s) => sum + (articleCounts?.[s.id] ?? 0), 0);
                    const allActive = groupSources.every(s => s.active);
                    const latestFetch = groupSources
                      .filter(s => s.lastFetchedAt)
                      .sort((a, b) => new Date(b.lastFetchedAt!).getTime() - new Date(a.lastFetchedAt!).getTime())[0];
                    const isSingle = groupSources.length === 1;

                    return (
                      <React.Fragment key={groupName}>
                      <TableRow
                        className={isExpanded ? "border-b-0" : ""}
                        data-testid={`source-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <TableCell className="w-8 px-2">
                          {!isSingle && (
                            <button
                              onClick={() => toggleGroup(groupName)}
                              className="p-1 rounded-md hover-elevate cursor-pointer"
                              data-testid={`button-expand-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{groupName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {groupSources.map((s) => {
                              const Icon = getSourceIcon(s.type);
                              const shortLabel = channelShortLabels[s.type] || s.type;
                              return (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-border/50 bg-muted/30"
                                  title={`${sourceTypeLabels[s.type] || s.type}: ${(articleCounts?.[s.id] ?? 0)} articles`}
                                  data-testid={`channel-badge-${s.type}-${s.id}`}
                                >
                                  <Icon className={`w-3 h-3 ${getSourceColor(s.type)}`} />
                                  <span className="text-muted-foreground font-medium">{shortLabel}</span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            className="tabular-nums font-medium text-primary underline-offset-4 hover:underline cursor-pointer"
                            onClick={() => {
                              if (isSingle) {
                                setViewingSource({ id: groupSources[0].id, name: groupName });
                              } else {
                                toggleGroup(groupName);
                              }
                            }}
                            data-testid={`button-article-count-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {totalArticles.toLocaleString()}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={allActive}
                            onCheckedChange={(checked) => {
                              groupSources.forEach(s => updateSource({ id: s.id, active: checked }));
                            }}
                            data-testid={`switch-group-active-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {latestFetch?.lastFetchedAt
                            ? formatDistanceToNow(new Date(latestFetch.lastFetchedAt), { addSuffix: true })
                            : t("common.never")}
                        </TableCell>
                        <TableCell className="text-right rtl:text-left">
                          <div className="flex items-center justify-end rtl:justify-start gap-1">
                            {isSingle && hasCap(CAPS.SOURCES_EDIT) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingSource(groupSources[0])}
                                aria-label={`Edit ${groupName}`}
                                title="Edit source"
                                data-testid={`button-edit-source-${groupSources[0].id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => groupSources.forEach(s => fetchSource(s.id))}
                              disabled={isFetchingOne}
                              data-testid={`button-fetch-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              <RefreshCw className={`w-4 h-4 ${isFetchingOne && groupSources.some(s => fetchingSourceId === s.id) ? "animate-spin" : ""}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                groupSources.forEach(s => deleteSource(s.id));
                              }}
                              disabled={isDeleting}
                              data-testid={`button-delete-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded per-channel rows */}
                      {isExpanded && groupSources.map((source) => {
                        const Icon = getSourceIcon(source.type);
                        return (
                          <TableRow key={`detail-${source.id}`} className="bg-muted/20" data-testid={`source-channel-row-${source.id}`}>
                            <TableCell></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm pl-2">
                                <Icon className={`w-3.5 h-3.5 ${getSourceColor(source.type)}`} />
                                <span className="text-muted-foreground">{sourceVariantLabel(source)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <span>{t("admin.postsPerFetch")}:</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={50}
                                    className="w-16 h-8 text-center text-sm"
                                    defaultValue={source.maxArticlesPerFetch ?? 10}
                                    key={`posts-${source.id}-${source.maxArticlesPerFetch}`}
                                    onBlur={(e) => {
                                      const val = Math.min(50, Math.max(1, parseInt(e.target.value) || 1));
                                      if (val !== (source.maxArticlesPerFetch ?? 10)) {
                                        updateSource({ id: source.id, maxArticlesPerFetch: val });
                                      }
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    data-testid={`input-posts-${source.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span>{t("admin.retention")}:</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={30}
                                    className="w-16 h-8 text-center text-sm"
                                    defaultValue={source.retentionDays ?? 7}
                                    key={`retention-${source.id}-${source.retentionDays}`}
                                    onBlur={(e) => {
                                      const val = Math.min(30, Math.max(1, parseInt(e.target.value) || 1));
                                      if (val !== (source.retentionDays ?? 7)) {
                                        updateSource({ id: source.id, retentionDays: val });
                                      }
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    data-testid={`input-retention-${source.id}`}
                                  />
                                  <span>{t("admin.days")}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                className="tabular-nums text-sm text-primary underline-offset-4 hover:underline cursor-pointer"
                                onClick={() => setViewingSource({ id: source.id, name: `${groupName} (${sourceVariantLabel(source)})` })}
                                data-testid={`button-article-count-${source.id}`}
                              >
                                {(articleCounts?.[source.id] ?? 0).toLocaleString()}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={source.active !== false}
                                onCheckedChange={(checked) => updateSource({ id: source.id, active: checked })}
                                data-testid={`switch-source-active-${source.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {source.lastFetchedAt
                                ? formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true })
                                : t("common.never")}
                            </TableCell>
                            <TableCell className="text-right rtl:text-left">
                              <div className="flex items-center justify-end rtl:justify-start gap-1">
                                {hasCap(CAPS.SOURCES_EDIT) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingSource(source)}
                                    aria-label={`Edit ${source.name}`}
                                    title="Edit source"
                                    data-testid={`button-edit-source-${source.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => fetchSource(source.id)}
                                  disabled={isFetchingOne && fetchingSourceId === source.id}
                                  data-testid={`button-fetch-source-${source.id}`}
                                >
                                  <RefreshCw className={`w-4 h-4 ${isFetchingOne && fetchingSourceId === source.id ? "animate-spin" : ""}`} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  onClick={() => deleteSource(source.id)}
                                  disabled={isDeleting}
                                  data-testid={`button-delete-source-${source.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {Object.entries(sourceGroups).map(([groupName, groupSources]) => {
                const isExpanded = expandedGroups.has(groupName);
                const totalArticles = groupSources.reduce((sum, s) => sum + (articleCounts?.[s.id] ?? 0), 0);
                const allActive = groupSources.every(s => s.active);
                const isSingle = groupSources.length === 1;

                return (
                  <div key={groupName} className="border border-border rounded-md p-4 space-y-3" data-testid={`mobile-source-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {!isSingle && (
                          <button onClick={() => toggleGroup(groupName)} className="p-0.5 cursor-pointer" data-testid={`button-expand-group-mobile-${groupName.replace(/\s+/g, '-').toLowerCase()}`}>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        )}
                        <span className="font-medium truncate">{groupName}</span>
                      </div>
                      <Switch
                        checked={allActive}
                        onCheckedChange={(checked) => {
                          groupSources.forEach(s => updateSource({ id: s.id, active: checked }));
                        }}
                        data-testid={`switch-group-active-mobile-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {groupSources.map((s) => {
                        const Icon = getSourceIcon(s.type);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-border/50 bg-muted/30"
                            title={sourceTypeLabels[s.type] || s.type}
                            data-testid={`channel-badge-mobile-${s.type}-${s.id}`}
                          >
                            <Icon className={`w-3 h-3 ${getSourceColor(s.type)}`} />
                            <span className="text-muted-foreground font-medium">{channelShortLabels[s.type] || s.type}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <button
                        className="text-primary underline-offset-4 hover:underline cursor-pointer"
                        onClick={() => {
                          if (isSingle) setViewingSource({ id: groupSources[0].id, name: groupName });
                          else toggleGroup(groupName);
                        }}
                        data-testid={`button-article-count-mobile-group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        {totalArticles.toLocaleString()} articles
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        {groupSources.map((source) => {
                          const Icon = getSourceIcon(source.type);
                          return (
                            <div key={source.id} className="bg-muted/20 rounded-md p-3 space-y-2" data-testid={`mobile-channel-detail-${source.id}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Icon className={`w-3.5 h-3.5 ${getSourceColor(source.type)}`} />
                                  <span className="text-sm">{sourceVariantLabel(source)}</span>
                                  <span className="text-xs text-muted-foreground">({(articleCounts?.[source.id] ?? 0)} articles)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {hasCap(CAPS.SOURCES_EDIT) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setEditingSource(source)}
                                      aria-label={`Edit ${source.name}`}
                                      title="Edit source"
                                      data-testid={`button-edit-source-mobile-${source.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Switch
                                    checked={source.active !== false}
                                    onCheckedChange={(checked) => updateSource({ id: source.id, active: checked })}
                                    data-testid={`switch-source-active-mobile-${source.id}`}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">{t("admin.postsPerFetch")}:</span>
                                  <Input
                                    type="number" min={1} max={50}
                                    className="w-16 h-8 text-center text-sm"
                                    defaultValue={source.maxArticlesPerFetch ?? 10}
                                    key={`m-posts-${source.id}-${source.maxArticlesPerFetch}`}
                                    onBlur={(e) => {
                                      const val = Math.min(50, Math.max(1, parseInt(e.target.value) || 1));
                                      if (val !== (source.maxArticlesPerFetch ?? 10)) updateSource({ id: source.id, maxArticlesPerFetch: val });
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    data-testid={`input-posts-mobile-${source.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">{t("admin.retention")}:</span>
                                  <Input
                                    type="number" min={1} max={30}
                                    className="w-16 h-8 text-center text-sm"
                                    defaultValue={source.retentionDays ?? 7}
                                    key={`m-retention-${source.id}-${source.retentionDays}`}
                                    onBlur={(e) => {
                                      const val = Math.min(30, Math.max(1, parseInt(e.target.value) || 1));
                                      if (val !== (source.retentionDays ?? 7)) updateSource({ id: source.id, retentionDays: val });
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    data-testid={`input-retention-mobile-${source.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">{t("admin.days")}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
                      {isSingle && hasCap(CAPS.SOURCES_EDIT) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingSource(groupSources[0])}
                          aria-label={`Edit ${groupName}`}
                          title="Edit source"
                          data-testid={`button-edit-source-mobile-${groupSources[0].id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => groupSources.forEach(s => fetchSource(s.id))}
                        disabled={isFetchingOne}
                        data-testid={`button-fetch-group-mobile-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isFetchingOne && groupSources.some(s => fetchingSourceId === s.id) ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => groupSources.forEach(s => deleteSource(s.id))}
                        disabled={isDeleting}
                        data-testid={`button-delete-group-mobile-${groupName.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <EditSourceDialog
        source={editingSource}
        open={!!editingSource}
        onOpenChange={(open) => !open && setEditingSource(null)}
      />

      <FeedImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} />

      <Dialog open={!!viewingSource} onOpenChange={(open) => !open && setViewingSource(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewingSource?.name} — Articles</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1">
            {isLoadingArticles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !sourceArticles?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No articles found</p>
            ) : (
              sourceArticles.map((article: any) => (
                <div
                  key={article.id}
                  className="flex items-start gap-3 p-3 rounded-md hover-elevate"
                  data-testid={`article-row-${article.id}`}
                >
                  {article.imageUrl && (
                    <img
                      src={article.imageUrl}
                      alt=""
                      className="w-16 h-12 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium leading-tight hover:underline line-clamp-2"
                    >
                      {article.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {article.category && (
                        <Badge variant="secondary" className="text-[10px]">{article.category}</Badge>
                      )}
                      {article.sentimentLabel && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            article.sentimentLabel === "positive" ? "text-green-600 border-green-600/30" :
                            article.sentimentLabel === "negative" ? "text-red-500 border-red-500/30" :
                            "text-muted-foreground"
                          }`}
                        >
                          {article.sentimentLabel}
                        </Badge>
                      )}
                      {(article.engagementLikes != null || article.engagementComments != null || article.engagementShares != null) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {article.engagementLikes != null && (
                            <span className="flex items-center gap-0.5" data-testid={`engagement-likes-${article.id}`}>
                              <ThumbsUp className="w-3 h-3" /> {article.engagementLikes.toLocaleString()}
                            </span>
                          )}
                          {article.engagementComments != null && (
                            <span className="flex items-center gap-0.5" data-testid={`engagement-comments-${article.id}`}>
                              <MessageCircle className="w-3 h-3" /> {article.engagementComments.toLocaleString()}
                            </span>
                          )}
                          {article.engagementShares != null && (
                            <span className="flex items-center gap-0.5" data-testid={`engagement-shares-${article.id}`}>
                              <Share2 className="w-3 h-3" /> {article.engagementShares.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                      {article.publishedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AddSourceDialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen} />
    </Card>
  );
}

function KeywordsManager() {
  const { t } = useTranslation();
  const { data: keywords, isLoading } = useKeywords();
  const { mutate: createKeyword, isPending: isCreating } = useCreateKeyword();
  const { mutate: deleteKeyword, isPending: isDeleting } = useDeleteKeyword();

  const [term, setTerm] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    createKeyword({ term }, { onSuccess: () => setTerm("") });
  };

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{t("admin.trackedKeywords")}<CardInfo description="Define keywords and phrases to monitor across all sources. Tracked keywords help filter and prioritize relevant coverage." /></CardTitle>
        <CardDescription>{t("admin.keywordsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <Input
            placeholder={t("admin.enterKeyword")}
            value={term}
            onChange={e => setTerm(e.target.value)}
            className="flex-1"
            data-testid="input-keyword"
          />
          <Button type="submit" disabled={isCreating || !term} data-testid="button-add-keyword">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t("admin.addKeyword")}</>}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {keywords?.map((keyword) => (
            <div
              key={keyword.id}
              className="flex items-center gap-2 bg-muted/50 border border-border px-3 py-1.5 rounded-full text-sm font-medium"
            >
              {keyword.term}
              <button
                onClick={() => deleteKeyword(keyword.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                disabled={isDeleting}
                data-testid={`button-delete-keyword-${keyword.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {keywords?.length === 0 && (
            <p className="text-muted-foreground text-sm italic">{t("admin.noKeywords")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
