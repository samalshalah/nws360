import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Landmark, Search, Shield, Wifi, WifiOff } from "lucide-react";
import type { Source } from "@shared/schema";
import {
  getSourceCategoryLabel,
  OFFICIAL_SOURCE_CATEGORY_CODES,
  OFFICIAL_SOURCE_CATEGORIES,
} from "@shared/source-categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSources } from "@/hooks/use-sources";

const ALL_FILTER = "all";

function normalize(value: string | null | undefined): string {
  return (value || "").toLowerCase();
}

function isOfficialSource(source: Source): boolean {
  if (source.category && OFFICIAL_SOURCE_CATEGORY_CODES.includes(source.category)) return true;

  const text = normalize(`${source.name} ${source.url}`);
  return [
    "ministry",
    "government",
    "parliament",
    "presidency",
    "prime minister",
    "cabinet",
    "central bank",
    "cbi.iq",
    "mod.mil.iq",
    "moi.gov.iq",
    "uniraq",
    "un iraq",
    "united nations iraq",
    "بعثة الأمم المتحدة",
    "وزارة",
    "مجلس النواب",
    "رئاسة",
    "البنك المركزي",
  ].some((marker) => text.includes(marker.toLowerCase()));
}

function sourceOfficialCategory(source: Source): string {
  if (source.category && OFFICIAL_SOURCE_CATEGORY_CODES.includes(source.category)) {
    return source.category;
  }

  const text = normalize(`${source.name} ${source.url}`);
  if (text.includes("uniraq") || text.includes("un iraq") || text.includes("united nations") || text.includes("الأمم المتحدة")) return "official_un_io";
  if (text.includes("parliament") || text.includes("مجلس النواب")) return "official_parliament";
  if (text.includes("court") || text.includes("judiciary") || text.includes("القضاء")) return "official_judiciary";
  if (text.includes("defense") || text.includes("interior") || text.includes("security") || text.includes("mod.mil.iq") || text.includes("moi.gov.iq")) return "official_security";
  if (text.includes("central bank") || text.includes("cbi.iq") || text.includes("البنك المركزي")) return "official_economy";
  if (text.includes("ministry") || text.includes("وزارة")) return "official_ministry";
  return "official_government";
}

function sourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    rss: "RSS",
    website: "Website",
    facebook: "Facebook",
    telegram: "Telegram",
    twitter: "X",
    youtube: "YouTube",
    instagram: "Instagram",
    google_news: "Google News",
  };
  return labels[type] || type;
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-md" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function OfficialSources() {
  const [, setLocation] = useLocation();
  const { data: sources = [], isLoading } = useSources();
  const { data: articleCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/sources/article-counts"],
    queryFn: async () => {
      const res = await fetch("/api/sources/article-counts");
      if (!res.ok) return {};
      return res.json();
    },
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_FILTER);

  const officialSources = useMemo(() => {
    const search = normalize(query);
    return (sources as Source[])
      .filter(isOfficialSource)
      .map((source) => ({ ...source, officialCategory: sourceOfficialCategory(source) }))
      .filter((source) => category === ALL_FILTER || source.officialCategory === category)
      .filter((source) => {
        if (!search) return true;
        return normalize(`${source.name} ${source.url} ${source.type}`).includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [category, query, sources]);

  const activeCount = officialSources.filter((source) => source.active).length;
  const totalArticles = officialSources.reduce((sum, source) => sum + (articleCounts[source.id] || 0), 0);
  const ministryCount = officialSources.filter((source) => source.officialCategory === "official_ministry").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">Official Sources</h1>
          </div>
          <p className="max-w-3xl text-muted-foreground">
            Dedicated monitoring for Iraqi ministries, government organizations, parliament, judiciary, security bodies, Central Bank, and international organization channels.
          </p>
        </div>
        <Button onClick={() => setLocation("/sources/manage")} variant="outline">
          Manage sources
        </Button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Official channels</p>
                  <p className="text-2xl font-semibold">{officialSources.length}</p>
                </div>
                <Building2 className="h-8 w-8 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active channels</p>
                  <p className="text-2xl font-semibold">{activeCount}</p>
                </div>
                <Wifi className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ministry channels</p>
                  <p className="text-2xl font-semibold">{ministryCount}</p>
                </div>
                <Shield className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Stored articles</p>
                  <p className="text-2xl font-semibold">{totalArticles}</p>
                </div>
                <Landmark className="h-8 w-8 text-amber-600" />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 rounded-md border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search official sources"
                className="pl-9"
                data-testid="input-official-source-search"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={category === ALL_FILTER ? "default" : "outline"}
                onClick={() => setCategory(ALL_FILTER)}
              >
                All
              </Button>
              {OFFICIAL_SOURCE_CATEGORIES.map((item) => (
                <Button
                  key={item.code}
                  size="sm"
                  variant={category === item.code ? "default" : "outline"}
                  onClick={() => setCategory(item.code)}
                >
                  {item.label.replace("Official ", "")}
                </Button>
              ))}
            </div>
          </div>

          {officialSources.length === 0 ? (
            <div className="rounded-md border py-16 text-center text-muted-foreground">
              <Landmark className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">No official sources match the current filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {officialSources.map((source) => (
                <Card key={source.id} className="overflow-hidden">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="line-clamp-2 text-base">{source.name}</CardTitle>
                        <p className="truncate text-xs text-muted-foreground">{source.url}</p>
                      </div>
                      {source.active ? (
                        <Badge variant="secondary" className="bg-green-500/15 text-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <WifiOff className="mr-1 h-3 w-3" />
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{getSourceCategoryLabel(source.officialCategory)}</Badge>
                      <Badge variant="outline">{sourceTypeLabel(source.type)}</Badge>
                      <Badge variant="outline">{articleCounts[source.id] || 0} articles</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3 pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/feed?sourceId=${source.id}&sort=newest`)}
                    >
                      Open in feed
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(source.url, "_blank", "noopener,noreferrer")}
                      aria-label={`Open ${source.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
