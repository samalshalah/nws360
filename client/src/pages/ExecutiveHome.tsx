import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Newspaper,
  AlertTriangle,
  Users,
  TrendingUp,
  BookOpen,
  Clock,
  ArrowRight,
  Sparkles,
  Shield,
} from "lucide-react";

interface TopStory {
  id: number;
  title: string;
  mainTopic: string;
  articleCount: number;
  sourceCount: number;
  importanceScore: number;
  avgSentiment: number;
}

interface LatestBrief {
  id: number;
  date: string;
  content: string;
  majorDevelopments: string[];
  emergingTopics: string[];
  confidenceScore: number;
}

interface Alert {
  id: number;
  type: string;
  topic: string;
  severity: string;
  explanation: string;
  acknowledged: boolean;
  createdAt: string;
}

interface TopEntity {
  entityName: string;
  entityType: string;
  mentionCount: number;
  avgSentiment: number;
}

interface RecentArticle {
  id: number;
  title: string;
  publishedAt: string;
  sentimentLabel: string;
  category: string;
  source: string;
}

interface StoryCluster {
  id: number;
  title: string;
  mainTopic: string;
  articleCount: number;
  importanceScore: number;
}

interface ExecutiveSnapshot {
  topStory: TopStory | null;
  latestBrief: LatestBrief | null;
  alerts: Alert[];
  topEntities: TopEntity[];
  recentArticles: RecentArticle[];
  storyClusters: StoryCluster[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getImportanceBadgeClass(score: number): string {
  if (score >= 8) return "bg-red-500/15 text-red-700 dark:text-red-400";
  if (score >= 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-green-500/15 text-green-700 dark:text-green-400";
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "high":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "medium":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    default:
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  }
}

export default function ExecutiveHome() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<ExecutiveSnapshot>({
    queryKey: ["/api/executive/snapshot"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="executive-home-loading">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-36 w-full rounded-md" />
          <Skeleton className="h-36 w-full rounded-md" />
        </div>
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-36 w-full rounded-md" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
  }

  const topStory = data?.topStory ?? null;
  const latestBrief = data?.latestBrief ?? null;
  const alerts = (data?.alerts ?? []).filter((a) => !a.acknowledged).slice(0, 5);
  const topEntities = data?.topEntities ?? [];
  const recentArticles = data?.recentArticles ?? [];
  const emergingTopics = (latestBrief?.emergingTopics ?? []).map((t: any) =>
    typeof t === "string" ? t : (t?.topic || t?.name || String(t))
  );

  const sentimentCounts = recentArticles.reduce(
    (acc, article) => {
      const label = (article.sentimentLabel || "neutral").toLowerCase();
      if (label === "positive") acc.positive++;
      else if (label === "negative") acc.negative++;
      else acc.neutral++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );

  const briefParagraphs = latestBrief?.content
    ? latestBrief.content.split("\n").filter((p) => p.trim()).slice(0, 3)
    : [];

  return (
    <div className="space-y-6 animate-fade-in" data-testid="executive-home">
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <Sparkles className="w-6 h-6 text-amber-500 dark:text-amber-400" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-greeting">
            {getGreeting()}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground" data-testid="text-current-date">
            {formatDate()}
          </p>
        </div>
        <p className="text-muted-foreground text-sm" data-testid="text-subtitle">
          Your intelligence snapshot
        </p>
      </div>

      {topStory && (
        <Card
          className="hover-elevate cursor-pointer"
          data-testid="card-top-story"
          onClick={() => setLocation("/intelligence")}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Newspaper className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg" data-testid="text-top-story-title">
                {topStory.title}
              </CardTitle>
            </div>
            <Badge
              className={`no-default-hover-elevate no-default-active-elevate shrink-0 ${getImportanceBadgeClass(topStory.importanceScore)}`}
              data-testid="badge-importance-score"
            >
              {topStory.importanceScore.toFixed(1)}
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
              <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-top-story-topic">
                {topStory.mainTopic}
              </Badge>
              <span data-testid="text-article-count">{topStory.articleCount} articles</span>
              <span data-testid="text-source-count">{topStory.sourceCount} sources</span>
            </div>
            <div className="flex items-center gap-1 mt-3 text-sm text-primary">
              <span>View details</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-coverage-tone">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Coverage Tone</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Positive</span>
                </div>
                <span className="text-sm font-semibold tabular-nums" data-testid="text-positive-count">
                  {sentimentCounts.positive}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
                  <span className="text-sm">Neutral</span>
                </div>
                <span className="text-sm font-semibold tabular-nums" data-testid="text-neutral-count">
                  {sentimentCounts.neutral}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm">Negative</span>
                </div>
                <span className="text-sm font-semibold tabular-nums" data-testid="text-negative-count">
                  {sentimentCounts.negative}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-emerging-topics">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Emerging Topics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {emergingTopics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {emergingTopics.slice(0, 5).map((topic, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="cursor-pointer"
                    data-testid={`badge-emerging-topic-${index}`}
                    onClick={() => setLocation("/intelligence")}
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-emerging-topics">
                No emerging topics available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card data-testid="card-alerts">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <CardTitle className="text-base">Key Alerts</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              data-testid="link-view-all-alerts"
              onClick={() => setLocation("/intelligence")}
            >
              View all
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`alert-item-${alert.id}`}
                >
                  <Badge
                    className={`no-default-hover-elevate no-default-active-elevate shrink-0 ${getSeverityBadgeClass(alert.severity)}`}
                    data-testid={`badge-alert-severity-${alert.id}`}
                  >
                    {alert.severity}
                  </Badge>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid={`text-alert-type-${alert.id}`}>
                        {alert.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {alert.topic}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`text-alert-explanation-${alert.id}`}>
                      {alert.explanation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {latestBrief && (
        <Card data-testid="card-latest-briefing">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Latest Briefing</CardTitle>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground" data-testid="text-brief-date">
                {new Date(latestBrief.date).toLocaleDateString()}
              </span>
              <Badge
                variant="outline"
                className="no-default-hover-elevate no-default-active-elevate"
                data-testid="badge-confidence-score"
              >
                {(latestBrief.confidenceScore * 100).toFixed(0)}% confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {briefParagraphs.map((paragraph, index) => (
                <p key={index} className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-brief-paragraph-${index}`}>
                  {paragraph}
                </p>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              data-testid="link-read-full-briefing"
              onClick={() => setLocation("/intelligence")}
            >
              Read full briefing
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {topEntities.length > 0 && (
        <Card data-testid="card-top-entities">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Top Entities</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {topEntities.map((entity, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="cursor-pointer"
                  data-testid={`badge-entity-${index}`}
                  onClick={() => setLocation("/intelligence")}
                >
                  {entity.entityName}
                  <span className="ml-1 text-xs text-muted-foreground">{entity.mentionCount}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
