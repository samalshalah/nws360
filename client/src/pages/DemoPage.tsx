import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Newspaper,
  AlertTriangle,
  Users,
  TrendingUp,
  BookOpen,
  Sparkles,
  BarChart3,
  ArrowRight,
  Info,
  Zap,
} from "lucide-react";

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

interface DemoTopStory {
  title: string;
  mainTopic: string;
  articleCount: number;
  sourceCount: number;
  importanceScore: number;
  avgSentiment: number;
}

interface MajorDevelopment {
  title: string;
  summary: string;
}

interface DemoLatestBrief {
  date: string;
  content: string;
  majorDevelopments: MajorDevelopment[];
  emergingTopics: string[];
  confidenceScore: number;
}

interface DemoAlert {
  id: number;
  type: string;
  topic: string;
  severity: string;
  explanation: string;
  acknowledged: boolean;
}

interface DemoEntity {
  entityName: string;
  entityType: string;
  mentionCount: number;
  avgSentiment: number;
}

interface DemoUsage {
  seats: { used: number; max: number };
  keywords: { used: number; max: number };
  sources: { used: number; max: number };
  articlesProcessed: number;
}

interface DemoSnapshot {
  plan: string;
  topStory: DemoTopStory;
  latestBrief: DemoLatestBrief;
  alerts: DemoAlert[];
  topEntities: DemoEntity[];
  usage: DemoUsage;
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

function getImportanceBadgeClass(score: number): string {
  if (score >= 8) return "bg-red-500/15 text-red-700 dark:text-red-400";
  if (score >= 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-green-500/15 text-green-700 dark:text-green-400";
}

export default function DemoPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<DemoSnapshot>({
    queryKey: ["/api/demo/snapshot"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" data-testid="demo-page-loading">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <Skeleton className="h-48 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-36 w-full rounded-md" />
            <Skeleton className="h-36 w-full rounded-md" />
          </div>
          <Skeleton className="h-48 w-full rounded-md" />
          <Skeleton className="h-36 w-full rounded-md" />
        </div>
      </div>
    );
  }

  const topStory = data?.topStory;
  const latestBrief = data?.latestBrief;
  const alerts = data?.alerts ?? [];
  const topEntities = data?.topEntities ?? [];
  const usage = data?.usage;

  const briefParagraphs = latestBrief?.content
    ? latestBrief.content.split("\n").filter((p) => p.trim()).slice(0, 3)
    : [];

  return (
    <div className="min-h-screen bg-background" data-testid="demo-page">
      <div className="relative overflow-visible bg-gradient-to-br from-primary/20 via-primary/10 to-background py-16 px-6">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Sparkles className="w-8 h-8 text-primary" />
            <h1 className="text-3xl md:text-5xl font-bold text-foreground" data-testid="text-demo-title">
              NWS360 Demo
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-demo-subtitle">
            Experience AI-powered news intelligence
          </p>
          <Button
            size="lg"
            data-testid="button-hero-signup"
            onClick={() => setLocation("/login")}
          >
            Sign Up
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div
          className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3"
          data-testid="banner-demo-indicator"
        >
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            This is a demo with sample data
          </span>
        </div>

        {topStory && (
          <Card data-testid="card-demo-top-story">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Newspaper className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg" data-testid="text-demo-top-story-title">
                  {topStory.title}
                </CardTitle>
                <CardInfo description="Sample top story showing how the platform clusters related articles and scores importance automatically." />
              </div>
              <Badge
                className={`no-default-hover-elevate no-default-active-elevate shrink-0 ${getImportanceBadgeClass(topStory.importanceScore)}`}
                data-testid="badge-demo-importance"
              >
                {topStory.importanceScore.toFixed(1)}
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-demo-topic">
                  {topStory.mainTopic}
                </Badge>
                <span data-testid="text-demo-article-count">{topStory.articleCount} articles</span>
                <span data-testid="text-demo-source-count">{topStory.sourceCount} sources</span>
              </div>
            </CardContent>
          </Card>
        )}

        {latestBrief && (
          <Card data-testid="card-demo-latest-brief">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <BookOpen className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Latest Brief</CardTitle>
                <CardInfo description="Example AI-generated daily briefing showing major developments, emerging topics, and confidence scoring." />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground" data-testid="text-demo-brief-date">
                  {new Date(latestBrief.date).toLocaleDateString()}
                </span>
                <Badge
                  variant="outline"
                  className="no-default-hover-elevate no-default-active-elevate"
                  data-testid="badge-demo-confidence"
                >
                  {(latestBrief.confidenceScore * 100).toFixed(0)}% confidence
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="space-y-2">
                {briefParagraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-demo-brief-paragraph-${index}`}>
                    {paragraph}
                  </p>
                ))}
              </div>

              {latestBrief.majorDevelopments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground" data-testid="text-demo-major-developments-heading">
                    Major Developments
                  </h3>
                  {latestBrief.majorDevelopments.map((dev, index) => (
                    <div key={index} className="p-3 rounded-md bg-muted/50" data-testid={`card-demo-development-${index}`}>
                      <p className="text-sm font-medium text-foreground">{dev.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{dev.summary}</p>
                    </div>
                  ))}
                </div>
              )}

              {latestBrief.emergingTopics.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground" data-testid="text-demo-emerging-topics-heading">
                    Emerging Topics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {latestBrief.emergingTopics.map((topic, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="no-default-hover-elevate no-default-active-elevate"
                        data-testid={`badge-demo-emerging-topic-${index}`}
                      >
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {alerts.length > 0 && (
          <Card data-testid="card-demo-alerts">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <CardTitle className="text-lg">Active Alerts</CardTitle>
                <CardInfo description="Demonstration of the real-time alert system showing different severity levels and event types." />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                    data-testid={`card-demo-alert-${alert.id}`}
                  >
                    <Badge
                      className={`no-default-hover-elevate no-default-active-elevate shrink-0 ${getSeverityBadgeClass(alert.severity)}`}
                      data-testid={`badge-demo-alert-severity-${alert.id}`}
                    >
                      {alert.severity}
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-demo-alert-type-${alert.id}`}>
                          {alert.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {alert.topic}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1" data-testid={`text-demo-alert-explanation-${alert.id}`}>
                        {alert.explanation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {topEntities.length > 0 && (
          <Card data-testid="card-demo-entities">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Users className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Entity Tracking</CardTitle>
                <CardInfo description="Sample entity tracking showing how the platform monitors people, organizations, and locations across sources." />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {topEntities.map((entity, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="no-default-hover-elevate no-default-active-elevate"
                    data-testid={`badge-demo-entity-${index}`}
                  >
                    {entity.entityName}
                    <span className="ml-1 text-xs text-muted-foreground">{entity.mentionCount}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {usage && (
          <Card data-testid="card-demo-usage">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <BarChart3 className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Usage Overview</CardTitle>
                <CardInfo description="Example usage dashboard showing article counts, source tracking, and system utilization metrics." />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Seats</span>
                  <span className="font-medium tabular-nums" data-testid="text-demo-seats-count">
                    {usage.seats.used} / {usage.seats.max}
                  </span>
                </div>
                <Progress
                  value={(usage.seats.used / usage.seats.max) * 100}
                  className="h-2"
                  data-testid="progress-demo-seats"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Keywords</span>
                  <span className="font-medium tabular-nums" data-testid="text-demo-keywords-count">
                    {usage.keywords.used} / {usage.keywords.max}
                  </span>
                </div>
                <Progress
                  value={(usage.keywords.used / usage.keywords.max) * 100}
                  className="h-2"
                  data-testid="progress-demo-keywords"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Sources</span>
                  <span className="font-medium tabular-nums" data-testid="text-demo-sources-count">
                    {usage.sources.used} / {usage.sources.max}
                  </span>
                </div>
                <Progress
                  value={(usage.sources.used / usage.sources.max) * 100}
                  className="h-2"
                  data-testid="progress-demo-sources"
                />
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Articles Processed:
                </span>
                <span className="text-sm font-medium tabular-nums" data-testid="text-demo-articles-processed">
                  {usage.articlesProcessed.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center py-12 space-y-4" data-testid="section-demo-cta">
          <h2 className="text-2xl font-bold text-foreground">Ready to get started?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Unlock the full power of AI-driven news intelligence for your organization.
          </p>
          <Button
            size="lg"
            data-testid="button-cta-signup"
            onClick={() => setLocation("/login")}
          >
            Sign Up
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
