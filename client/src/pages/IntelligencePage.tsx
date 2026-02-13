import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Brain, Layers, BookOpen, AlertTriangle, Users, TrendingUp,
  MessageSquare, BarChart3, Eye, Shield, Clock, ChevronDown,
  ChevronUp, Send, Sparkles, Info, RefreshCw
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function TabInfo({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid="button-tab-info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="text-sm max-w-sm">
        {description}
      </PopoverContent>
    </Popover>
  );
}

interface StoryCluster {
  id: number;
  title: string;
  mainTopic: string;
  articleCount: number;
  sourceCount: number;
  importanceScore: number;
  avgSentiment: number;
  firstSeen: string;
  lastUpdated: string;
  narrativeVariations?: {
    variations: { source: string; framing: string; emphasis: string; tone: string }[];
    consensus: string;
    divergence: string;
  };
}

interface StoryDetail {
  id: number;
  title: string;
  articles: { id: number; title: string; sourceId: number; sourceName?: string | null; publishedAt: string; sentiment: string; url: string | null }[];
  narrativeVariations?: StoryCluster["narrativeVariations"];
}

interface Brief {
  id: number;
  date: string;
  content: string;
  majorDevelopments: { title: string; summary: string }[] | string[];
  emergingTopics: string[];
  toneShifts: { topic: string; direction: string; explanation: string }[] | string[];
  confidenceScore: number;
  articleCount: number;
  sourceCount: number;
}

interface DetectedEvent {
  id: number;
  type: string;
  topic: string;
  severity: string;
  explanation: string;
  acknowledged: boolean;
  createdAt: string;
}

interface Entity {
  entityName: string;
  entityType: string;
  mentionCount: number;
  avgSentiment: number;
}

interface EntityDetail {
  entityName: string;
  entityType: string;
  mentions: { id: number; entityName: string; entityType: string; articleId: number; mentionDate: string; context: string; sentimentScore: number }[];
  timeline: { date: string; mentionCount: number; avgSentiment: number }[];
}

interface Prediction {
  id: number;
  topic: string;
  predictionType: string;
  probability: number;
  reasoning: string;
  timeframe: string;
  confidenceScore: number;
  basedOnArticleCount: number;
  basedOnSourceDiversity: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  confidence?: number;
  basedOnArticleCount?: number;
  basedOnSourceDiversity?: number;
}

function useViewMode() {
  const [mode, setMode] = useState<"analyst" | "executive">(() => {
    return (localStorage.getItem("intelligence-view-mode") as "analyst" | "executive") || "analyst";
  });

  useEffect(() => {
    localStorage.setItem("intelligence-view-mode", mode);
  }, [mode]);

  return [mode, setMode] as const;
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase();
  if (s === "high") {
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20" data-testid={`badge-severity-${s}`}>{severity}</Badge>;
  }
  if (s === "medium") {
    return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" data-testid={`badge-severity-${s}`}>{severity}</Badge>;
  }
  return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20" data-testid={`badge-severity-${s}`}>{severity}</Badge>;
}

function StoriesTab({ mode }: { mode: string }) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: stories, isLoading } = useQuery<StoryCluster[]>({
    queryKey: ["/api/stories"],
  });

  const { data: storyDetail, isLoading: detailLoading } = useQuery<StoryDetail>({
    queryKey: ["/api/stories", expandedId],
    enabled: !!expandedId,
  });

  const narrativeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/stories/${id}/narratives`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Narrative analysis complete" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <TabInfo description="AI-clustered story groups that combine related articles from multiple sources. See how different outlets cover the same event, compare narrative framings, and gauge overall story importance." />
      {stories?.map((story) => (
        <Card key={story.id} data-testid={`card-story-${story.id}`}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <button
                    className="text-left w-full"
                    onClick={() => setExpandedId(expandedId === story.id ? null : story.id)}
                    data-testid={`button-expand-story-${story.id}`}
                  >
                    <h3 className="font-semibold text-sm">{story.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{story.mainTopic}</p>
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" data-testid={`badge-articles-${story.id}`}>{story.articleCount} articles</Badge>
                  <Badge variant="secondary" data-testid={`badge-sources-${story.id}`}>{story.sourceCount} sources</Badge>
                  {expandedId === story.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {mode === "analyst" && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span data-testid={`text-importance-${story.id}`}>Importance: {story.importanceScore?.toFixed(0)}%</span>
                  <span data-testid={`text-sentiment-${story.id}`}>Sentiment: {story.avgSentiment?.toFixed(2)}</span>
                  <span><Clock className="w-3 h-3 inline mr-1" />{new Date(story.firstSeen).toLocaleDateString()}</span>
                  <span>Updated: {new Date(story.lastUpdated).toLocaleDateString()}</span>
                </div>
              )}

              {expandedId === story.id && (
                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => narrativeMutation.mutate(story.id)}
                      disabled={narrativeMutation.isPending}
                      data-testid={`button-analyze-narratives-${story.id}`}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Analyze Narratives
                    </Button>
                  </div>

                  {detailLoading && <Skeleton className="h-20 w-full" />}

                  {storyDetail && storyDetail.id === story.id && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Articles</p>
                      {storyDetail.articles && storyDetail.articles.length > 0 ? (
                        storyDetail.articles.map((article, idx) => (
                          <div key={article.id || idx} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 text-xs">
                            <div className="flex-1 min-w-0">
                              {article.url ? (
                                <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-medium truncate block text-primary hover:underline" data-testid={`link-article-${article.id}`}>{article.title}</a>
                              ) : (
                                <p className="font-medium truncate">{article.title}</p>
                              )}
                              <p className="text-muted-foreground">{article.sourceName || `Source ${article.sourceId}`} &middot; {new Date(article.publishedAt).toLocaleDateString()}</p>
                            </div>
                            <Badge variant="secondary">{article.sentimentLabel || "neutral"}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">Articles for this cluster are not yet linked. New clusters will have articles linked automatically.</p>
                      )}
                    </div>
                  )}

                  {(storyDetail?.narrativeVariations || story.narrativeVariations) && (
                    <NarrativeDisplay narratives={storyDetail?.narrativeVariations || story.narrativeVariations} mode={mode} />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {stories?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No story clusters found</p>
      )}
    </div>
  );
}

function NarrativeDisplay({ narratives, mode }: { narratives: StoryCluster["narrativeVariations"]; mode: string }) {
  if (!narratives) return null;

  return (
    <div className="space-y-3" data-testid="narrative-display">
      {narratives.consensus && (
        <div>
          <p className={`font-semibold ${mode === "executive" ? "text-base" : "text-xs"} text-muted-foreground`}>Consensus</p>
          <p className={mode === "executive" ? "text-sm" : "text-xs"}>{narratives.consensus}</p>
        </div>
      )}
      {narratives.divergence && (
        <div>
          <p className={`font-semibold ${mode === "executive" ? "text-base" : "text-xs"} text-muted-foreground`}>Divergence</p>
          <p className={mode === "executive" ? "text-sm" : "text-xs"}>{narratives.divergence}</p>
        </div>
      )}
      {mode === "analyst" && narratives.variations && narratives.variations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Variations</p>
          {narratives.variations.map((v, i) => (
            <Card key={i}>
              <CardContent className="p-3 text-xs space-y-1">
                <p><span className="font-medium">Source:</span> {v.source}</p>
                <p><span className="font-medium">Framing:</span> {v.framing}</p>
                <p><span className="font-medium">Emphasis:</span> {v.emphasis}</p>
                <p><span className="font-medium">Tone:</span> {v.tone}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefsTab({ mode }: { mode: string }) {
  const { data: briefs, isLoading } = useQuery<Brief[]>({
    queryKey: ["/api/briefs"],
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>;
  }

  const sorted = briefs?.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <div className="space-y-4">
      <TabInfo description="Automated daily intelligence summaries highlighting major developments, emerging topics, and tone shifts across your monitored sources. Includes confidence scoring for each briefing." />
      {sorted.map((brief, idx) => (
        <Card key={brief.id} data-testid={`card-brief-${brief.id}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <BookOpen className="w-4 h-4" />
              {new Date(brief.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {idx === 0 && <Badge variant="secondary">Latest</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={mode === "executive" ? "text-base leading-relaxed" : "text-sm"} data-testid={`text-brief-content-${brief.id}`}>
              {brief.content}
            </div>

            {brief.majorDevelopments && brief.majorDevelopments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Major Developments</p>
                <ul className="space-y-1">
                  {brief.majorDevelopments.map((d, i) => (
                    <li key={i} className={`${mode === "executive" ? "text-sm" : "text-xs"}`}>
                      &bull; {typeof d === "string" ? d : `${d.title}: ${d.summary}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.emergingTopics && brief.emergingTopics.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Emerging Topics</p>
                <div className="flex gap-1.5 flex-wrap">
                  {brief.emergingTopics.map((t, i) => (
                    <Badge key={i} variant="secondary">{typeof t === "string" ? t : String(t)}</Badge>
                  ))}
                </div>
              </div>
            )}

            {brief.toneShifts && brief.toneShifts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Tone Shifts</p>
                <ul className="space-y-1">
                  {brief.toneShifts.map((s, i) => (
                    <li key={i} className="text-xs">
                      &bull; {typeof s === "string" ? s : `${s.topic}: ${s.direction} - ${s.explanation}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mode === "analyst" && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t flex-wrap">
                <span data-testid={`text-brief-confidence-${brief.id}`}>Confidence: {brief.confidenceScore}%</span>
                <span>{brief.articleCount} articles</span>
                <span>{brief.sourceCount} sources</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No daily briefs available</p>
      )}
    </div>
  );
}

function EventsTab({ mode }: { mode: string }) {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data: events, isLoading } = useQuery<DetectedEvent[]>({
    queryKey: ["/api/events"],
  });

  const ackMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/events/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event acknowledged" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  const eventTypes = Array.from(new Set(events?.map(e => e.type) || []));
  const severities = Array.from(new Set(events?.map(e => e.severity) || []));

  const filtered = events?.filter(e => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    return true;
  }) || [];

  return (
    <div className="space-y-4">
      <TabInfo description="Real-time detection of significant events and breaking developments. Filter by type and severity to focus on what matters most — from political shifts to security alerts." />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Type:</span>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={typeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter("all")}
              data-testid="button-filter-type-all"
            >All</Button>
            {eventTypes.map(t => (
              <Button
                key={t}
                variant={typeFilter === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter(t)}
                data-testid={`button-filter-type-${t}`}
              >{t.replace(/_/g, " ")}</Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Severity:</span>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={severityFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSeverityFilter("all")}
              data-testid="button-filter-severity-all"
            >All</Button>
            {severities.map(s => (
              <Button
                key={s}
                variant={severityFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSeverityFilter(s)}
                data-testid={`button-filter-severity-${s}`}
              >{s}</Button>
            ))}
          </div>
        </div>
      </div>

      {filtered.map((event) => (
        <Card key={event.id} data-testid={`card-event-${event.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{event.type.replace(/_/g, " ")}</Badge>
                  <SeverityBadge severity={event.severity} />
                  {event.acknowledged && <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">Acknowledged</Badge>}
                </div>
                <p className="font-semibold text-sm" data-testid={`text-event-topic-${event.id}`}>{event.topic}</p>
                <p className={`${mode === "executive" ? "text-sm" : "text-xs"} text-muted-foreground`}>{event.explanation}</p>
                <p className="text-xs text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{new Date(event.createdAt).toLocaleString()}</p>
              </div>
              {!event.acknowledged && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => ackMutation.mutate(event.id)}
                  disabled={ackMutation.isPending}
                  data-testid={`button-ack-event-${event.id}`}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Acknowledge
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No events found</p>
      )}
    </div>
  );
}

function EntitiesTab({ mode }: { mode: string }) {
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const { data: entities, isLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
  });

  const { data: entityDetail, isLoading: detailLoading } = useQuery<EntityDetail>({
    queryKey: ["/api/entities", selectedEntity],
    enabled: !!selectedEntity,
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <TabInfo description="Track people, organizations, and locations mentioned across your news sources. See mention frequency, average sentiment, and drill into recent articles for any entity." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entities?.map((entity) => (
          <Card
            key={entity.entityName}
            className={`cursor-pointer hover-elevate ${selectedEntity === entity.entityName ? "ring-2 ring-primary" : ""}`}
            data-testid={`card-entity-${entity.entityName}`}
          >
            <CardContent className="p-4" onClick={() => setSelectedEntity(selectedEntity === entity.entityName ? null : entity.entityName)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" data-testid={`text-entity-name-${entity.entityName}`}>{entity.entityName}</p>
                  <p className="text-xs text-muted-foreground">{entity.entityType}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" data-testid={`text-entity-mentions-${entity.entityName}`}>{entity.mentionCount}</p>
                  <p className="text-xs text-muted-foreground">mentions</p>
                </div>
              </div>
              {mode === "analyst" && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Avg Sentiment: {entity.avgSentiment?.toFixed(2) ?? "N/A"}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {entities?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No entities tracked yet</p>
      )}

      {selectedEntity && (
        <Card data-testid="card-entity-detail">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              {selectedEntity} - Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : entityDetail && entityDetail.timeline && entityDetail.timeline.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={entityDetail.timeline.map(d => ({
                    ...d,
                    dateLabel: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                  }))}>
                    <defs>
                      <linearGradient id="gradMentions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradSentiment" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                    <Area yAxisId="left" type="monotone" dataKey="mentionCount" name="Mentions" stroke="hsl(var(--primary))" fill="url(#gradMentions)" strokeWidth={2} />
                    <Area yAxisId="right" type="monotone" dataKey="avgSentiment" name="Sentiment" stroke="#22c55e" fill="url(#gradSentiment)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No timeline data available</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PredictionsTab({ mode }: { mode: string }) {
  const { data: predictions, isLoading } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions"],
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <TabInfo description="AI-generated predictions about how stories and topics will develop. Each prediction includes a confidence score and tracks whether the forecast proved accurate over time." />
      {predictions?.map((pred) => (
        <Card key={pred.id} data-testid={`card-prediction-${pred.id}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-semibold text-sm" data-testid={`text-prediction-topic-${pred.id}`}>{pred.topic}</p>
                  <Badge variant="secondary">{pred.predictionType}</Badge>
                </div>
                <p className={`${mode === "executive" ? "text-sm" : "text-xs"} text-muted-foreground`}>{pred.reasoning}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold" data-testid={`text-prediction-prob-${pred.id}`}>{(pred.probability * 100).toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">{pred.timeframe}</p>
              </div>
            </div>
            <div>
              <Progress value={pred.probability * 100} className="h-2" data-testid={`progress-prediction-${pred.id}`} />
            </div>
            {mode === "analyst" && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>Confidence: {pred.confidenceScore}%</span>
                <span>Based on {pred.basedOnArticleCount} articles</span>
                <span>Source diversity: {(pred.basedOnSourceDiversity * 100).toFixed(0)}%</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {predictions?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No predictions available</p>
      )}
    </div>
  );
}

function AiAssistantTab() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const suggestedQuestions = [
    "Why is this topic trending?",
    "What changed today?",
    "How is media tone shifting?",
  ];

  const queryMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/ai/query", { question });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer || data.content || "No response received.",
        sources: data.sources,
        confidence: data.confidence,
        basedOnArticleCount: data.basedOnArticleCount,
        basedOnSourceDiversity: data.basedOnSourceDiversity,
      }]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error processing your question.",
      }]);
    },
  });

  const handleSubmit = () => {
    if (!input.trim()) return;
    const question = input.trim();
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    queryMutation.mutate(question);
  };

  const handleSuggestion = (q: string) => {
    setMessages(prev => [...prev, { role: "user", content: q }]);
    queryMutation.mutate(q);
  };

  return (
    <div className="space-y-4">
      <TabInfo description="A conversational AI assistant that can answer questions about your news data. Ask about trends, summarize coverage on any topic, or request analysis across your monitored sources." />
      {messages.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="p-3 rounded-full bg-primary/10 inline-flex">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Ask me anything about your news data</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              {suggestedQuestions.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestion(q)}
                  disabled={queryMutation.isPending}
                  data-testid={`button-suggestion-${i}`}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {q}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <Card className={`max-w-[85%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : ""}`} data-testid={`card-message-${idx}`}>
              <CardContent className="p-3 space-y-2">
                <p className={`${msg.role === "user" ? "text-sm" : "text-sm"}`}>{msg.content}</p>
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Sources</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {msg.sources.map((s, i) => (
                        <Badge key={i} variant="secondary">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {msg.role === "assistant" && msg.confidence != null && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>Confidence: {msg.confidence}%</span>
                    {msg.basedOnArticleCount != null && <span>{msg.basedOnArticleCount} articles</span>}
                    {msg.basedOnSourceDiversity != null && <span>Diversity: {(msg.basedOnSourceDiversity * 100).toFixed(0)}%</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
        {queryMutation.isPending && (
          <div className="flex justify-start">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded-full" />
                  <Skeleton className="w-32 h-4" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your news data..."
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          disabled={queryMutation.isPending}
          data-testid="input-ai-question"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!input.trim() || queryMutation.isPending}
          data-testid="button-send-question"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {messages.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {suggestedQuestions.map((q, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              onClick={() => handleSuggestion(q)}
              disabled={queryMutation.isPending}
              data-testid={`button-followup-${i}`}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {q}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IntelligencePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useViewMode();

  const refreshIntelligence = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/run-intelligence");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Intelligence pipeline started", description: "Story clusters, briefs, and events are being rebuilt. This may take a minute." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/briefs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
        queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      }, 5000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const refreshAnalytics = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/compute-analytics");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Analytics refresh started", description: "Dashboard stats and trends are being recalculated." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      }, 3000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-intelligence-title">
            Intelligence Hub
          </h1>
          <p className="text-muted-foreground text-sm">AI-powered news intelligence and analysis</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAnalytics.mutate()}
            disabled={refreshAnalytics.isPending}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshAnalytics.isPending ? "animate-spin" : ""}`} />
            {refreshAnalytics.isPending ? "Refreshing..." : "Refresh Analytics"}
          </Button>
          <Button
            size="sm"
            onClick={() => refreshIntelligence.mutate()}
            disabled={refreshIntelligence.isPending}
            data-testid="button-build-intelligence"
          >
            <Brain className={`w-4 h-4 mr-1 ${refreshIntelligence.isPending ? "animate-spin" : ""}`} />
            {refreshIntelligence.isPending ? "Building..." : "Build Intelligence"}
          </Button>
          <div className="flex items-center gap-2" data-testid="toggle-view-mode">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Executive</span>
            <Switch
              checked={mode === "analyst"}
              onCheckedChange={(checked) => setMode(checked ? "analyst" : "executive")}
              data-testid="switch-view-mode"
            />
            <span className="text-xs font-medium text-muted-foreground">Analyst</span>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      <Tabs defaultValue="stories" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1" data-testid="tabs-intelligence">
          <TabsTrigger value="stories" data-testid="tab-stories">
            <Layers className="w-4 h-4 mr-1" />
            Stories
          </TabsTrigger>
          <TabsTrigger value="briefs" data-testid="tab-briefs">
            <BookOpen className="w-4 h-4 mr-1" />
            Daily Brief
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Events
          </TabsTrigger>
          <TabsTrigger value="entities" data-testid="tab-entities">
            <Users className="w-4 h-4 mr-1" />
            Entities
          </TabsTrigger>
          <TabsTrigger value="predictions" data-testid="tab-predictions">
            <TrendingUp className="w-4 h-4 mr-1" />
            Predictions
          </TabsTrigger>
          <TabsTrigger value="assistant" data-testid="tab-assistant">
            <MessageSquare className="w-4 h-4 mr-1" />
            AI Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stories">
          <StoriesTab mode={mode} />
        </TabsContent>
        <TabsContent value="briefs">
          <BriefsTab mode={mode} />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab mode={mode} />
        </TabsContent>
        <TabsContent value="entities">
          <EntitiesTab mode={mode} />
        </TabsContent>
        <TabsContent value="predictions">
          <PredictionsTab mode={mode} />
        </TabsContent>
        <TabsContent value="assistant">
          <AiAssistantTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
