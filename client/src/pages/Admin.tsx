import { useState, useCallback } from "react";
import { useSources, useCreateSource, useDeleteSource, useFetchSource, useFetchAllSources } from "@/hooks/use-sources";
import { useKeywords, useCreateKeyword, useDeleteKeyword } from "@/hooks/use-keywords";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";


import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Globe, Rss, Loader2, RefreshCw, Search, Newspaper, Hash, ChevronLeft, ArrowRight } from "lucide-react";
import { SiX, SiYoutube, SiFacebook, SiInstagram, SiTelegram, SiGooglenews } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

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

export default function Admin({ tab = "add" }: { tab?: "add" | "manage" | "keywords" }) {
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
      {tab === "manage" && <SourcesManager />}
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

function AddSourceView() {
  const { t } = useTranslation();
  const { mutate: createSource, isPending: isCreating } = useCreateSource();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WebsiteSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    url: "",
    type: "website",
    intervalMinutes: 15,
    maxArticlesPerFetch: 10,
    retentionDays: 7,
  });

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

  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;

    if (q.startsWith("http://") || q.startsWith("https://") || q.includes(".")) {
      setSelectedType("website");
      setFormData(prev => ({
        ...prev,
        name: q.replace(/https?:\/\/(www\.)?/, "").split("/")[0],
        url: q,
        type: "website",
      }));
    } else {
      setSelectedType("google_news");
      setFormData(prev => ({
        ...prev,
        name: q,
        url: q,
        type: "google_news",
      }));
    }
  };

  const selectSearchResult = (result: WebsiteSearchResult) => {
    setSelectedType(result.hasFeed ? "rss" : "website");
    setFormData(prev => ({
      ...prev,
      name: result.name,
      url: result.feedUrl || result.url,
      type: result.hasFeed ? "rss" : "website",
    }));
    setShowResults(false);
    setSearchQuery("");
  };

  const selectSourceType = (type: string) => {
    setSelectedType(type);
    setFormData(prev => ({
      ...prev,
      type,
      name: "",
      url: "",
    }));
    setShowResults(false);
    setSearchQuery("");
  };

  const selectTopic = (topic: string) => {
    setSelectedType("google_news");
    setFormData(prev => ({
      ...prev,
      name: topic,
      url: topic,
      type: "google_news",
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSource(formData, {
      onSuccess: () => {
        setSelectedType(null);
        setFormData({ name: "", url: "", type: "website", intervalMinutes: 15, maxArticlesPerFetch: 10, retentionDays: 7 });
        setSearchQuery("");
        setSearchResults([]);
        setShowResults(false);
      },
    });
  };

  const goBack = () => {
    setSelectedType(null);
    setFormData({ name: "", url: "", type: "website", intervalMinutes: 15, maxArticlesPerFetch: 10, retentionDays: 7 });
  };

  const isGoogleNews = formData.type === "google_news";

  if (selectedType) {
    const typeConfig = SOURCE_TYPES.find(s => s.type === selectedType);
    const TypeIcon = typeConfig?.icon || Globe;

    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-300">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover-elevate px-2 py-1 rounded-md transition-colors"
          data-testid="button-back-to-types"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("common.back")}
        </button>

        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${typeConfig?.color || ""}`}>
            <TypeIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t("admin.addNewSource")}</h2>
            <p className="text-sm text-muted-foreground">{typeConfig ? t(typeConfig.label as any) : selectedType}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">{t("admin.sourceName")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={isGoogleNews ? t("admin.googleNewsNamePlaceholder") : t("admin.sourceNamePlaceholder")}
                  required
                  data-testid="input-source-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">
                  {isGoogleNews ? t("admin.urlLabels.google_news") : t(`admin.urlLabels.${formData.type}` as any)}
                </Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder={isGoogleNews ? t("admin.urlPlaceholders.google_news") : t(`admin.urlPlaceholders.${formData.type}` as any)}
                  required
                  data-testid="input-source-url"
                />
                {isGoogleNews && (
                  <p className="text-xs text-muted-foreground">{t("admin.googleNewsHint")}</p>
                )}
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t("admin.postsPerFetch")}</Label>
                    <span className="text-sm font-medium text-muted-foreground" data-testid="text-posts-per-fetch">{formData.maxArticlesPerFetch}</span>
                  </div>
                  <Slider
                    value={[formData.maxArticlesPerFetch]}
                    onValueChange={([val]) => setFormData(prev => ({ ...prev, maxArticlesPerFetch: val }))}
                    min={1}
                    max={50}
                    step={1}
                    data-testid="slider-posts-per-fetch"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>50</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t("admin.articleLifespan")}</Label>
                    <span className="text-sm font-medium text-muted-foreground" data-testid="text-retention-days">
                      {formData.retentionDays} {t("admin.days")}
                    </span>
                  </div>
                  <Slider
                    value={[formData.retentionDays]}
                    onValueChange={([val]) => setFormData(prev => ({ ...prev, retentionDays: val }))}
                    min={1}
                    max={30}
                    step={1}
                    data-testid="slider-retention-days"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1 {t("admin.day")}</span>
                    <span>30 {t("admin.days")}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("admin.fetchInterval")}</Label>
                  <Select
                    value={String(formData.intervalMinutes)}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, intervalMinutes: parseInt(val) }))}
                  >
                    <SelectTrigger data-testid="select-fetch-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 {t("admin.minutes")}</SelectItem>
                      <SelectItem value="10">10 {t("admin.minutes")}</SelectItem>
                      <SelectItem value="15">15 {t("admin.minutes")}</SelectItem>
                      <SelectItem value="30">30 {t("admin.minutes")}</SelectItem>
                      <SelectItem value="60">1 {t("admin.hour")}</SelectItem>
                      <SelectItem value="120">2 {t("admin.hours")}</SelectItem>
                      <SelectItem value="360">6 {t("admin.hours")}</SelectItem>
                      <SelectItem value="720">12 {t("admin.hours")}</SelectItem>
                      <SelectItem value="1440">24 {t("admin.hours")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isCreating} data-testid="button-submit-source">
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />
                    {t("admin.addSource")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-2">
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
    </div>
  );
}

function SourcesManager() {
  const { t } = useTranslation();
  const { data: sources, isLoading } = useSources();
  const { mutate: deleteSource, isPending: isDeleting } = useDeleteSource();
  const { mutate: fetchSource, isPending: isFetchingOne, variables: fetchingSourceId } = useFetchSource();
  const { mutate: fetchAll, isPending: isFetchingAll } = useFetchAllSources();

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

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>{t("admin.newsSources")}</CardTitle>
          <CardDescription>{t("admin.sourcesDescription")}</CardDescription>
        </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.sourceName")}</TableHead>
                <TableHead>{t("admin.type")}</TableHead>
                <TableHead>{t("admin.postsPerFetch")}</TableHead>
                <TableHead>{t("admin.retention")}</TableHead>
                <TableHead>{t("admin.status")}</TableHead>
                <TableHead>{t("admin.lastFetched")}</TableHead>
                <TableHead className="text-right rtl:text-left">{t("admin.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources?.map((source) => {
                const Icon = getSourceIcon(source.type);
                return (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className={`w-3.5 h-3.5 ${getSourceColor(source.type)}`} />
                        <span className="text-muted-foreground">{sourceTypeLabels[source.type] || source.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.maxArticlesPerFetch ?? 10}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.retentionDays ?? 30} {t("admin.days")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={source.active ? "default" : "secondary"}>
                        {source.active ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.lastFetchedAt
                        ? formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true })
                        : t("common.never")}
                    </TableCell>
                    <TableCell className="text-right rtl:text-left">
                      <div className="flex items-center justify-end rtl:justify-start gap-1">
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
            </TableBody>
          </Table>
        )}
      </CardContent>
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
        <CardTitle>{t("admin.trackedKeywords")}</CardTitle>
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
