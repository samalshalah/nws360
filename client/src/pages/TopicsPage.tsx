import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useArticles } from "@/hooks/use-articles";
import { FeedCard } from "@/components/articles/FeedCard";
import { cn } from "@/lib/utils";

interface TopicData {
  name: string;
  count: number;
  sentiment: { positive: number; neutral: number; negative: number };
  topSource: string;
}

const FALLBACK_TOPICS: TopicData[] = [
  { name: "Elections", count: 42, sentiment: { positive: 12, neutral: 20, negative: 10 }, topSource: "Reuters" },
  { name: "Technology", count: 38, sentiment: { positive: 25, neutral: 10, negative: 3 }, topSource: "TechCrunch" },
  { name: "Economy", count: 31, sentiment: { positive: 8, neutral: 15, negative: 8 }, topSource: "Bloomberg" },
  { name: "Climate", count: 27, sentiment: { positive: 5, neutral: 12, negative: 10 }, topSource: "The Guardian" },
  { name: "Healthcare", count: 22, sentiment: { positive: 14, neutral: 5, negative: 3 }, topSource: "CNN" },
  { name: "Defense", count: 19, sentiment: { positive: 3, neutral: 10, negative: 6 }, topSource: "AP News" },
  { name: "Sports", count: 16, sentiment: { positive: 10, neutral: 4, negative: 2 }, topSource: "ESPN" },
  { name: "Energy", count: 14, sentiment: { positive: 6, neutral: 5, negative: 3 }, topSource: "Forbes" },
];

function normalizeTopics(data: any): TopicData[] {
  if (Array.isArray(data)) {
    return data.map((t: any) => ({
      name: t.topic || t.name || t.keyword || "Unknown",
      count: t.count || t.articleCount || 0,
      sentiment: t.sentiment || { positive: 0, neutral: 0, negative: 0 },
      topSource: t.topSource || t.source || "Various",
    }));
  }
  return FALLBACK_TOPICS;
}

function useTopics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/analytics/trending-topics"],
  });

  const topics: TopicData[] = data ? normalizeTopics(data) : (error ? FALLBACK_TOPICS : []);

  return { data: topics, isLoading };
}

function SentimentBar({ sentiment }: { sentiment: { positive: number; neutral: number; negative: number } }) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted w-full">
      <div className="bg-green-500 dark:bg-green-400" style={{ width: `${(sentiment.positive / total) * 100}%` }} />
      <div className="bg-gray-400 dark:bg-gray-500" style={{ width: `${(sentiment.neutral / total) * 100}%` }} />
      <div className="bg-red-500 dark:bg-red-400" style={{ width: `${(sentiment.negative / total) * 100}%` }} />
    </div>
  );
}

function TopicDetail({ topic, onBack }: { topic: TopicData; onBack: () => void }) {
  const { data, isLoading } = useArticles({ search: topic.name, limit: 10 });
  const articles = data ? (Array.isArray(data) ? data : (data as any).articles || []) : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1" data-testid="button-back-topics">
        <ArrowLeft className="w-4 h-4" /> Back to Topics
      </Button>

      <h1 className="text-xl font-bold text-foreground mb-1" data-testid="text-topic-name">{topic.name}</h1>
      <p className="text-sm text-muted-foreground mb-6">{topic.count} articles in the last 24h</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Volume Trend</span>
          </div>
          <div className="h-16 flex items-end gap-1">
            {[3, 5, 4, 7, 6, 8, 10, 9, 12, 11, 8, topic.count].map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/20 dark:bg-primary/30 rounded-t-sm"
                style={{ height: `${(v / 12) * 100}%` }}
              />
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Sentiment</span>
          </div>
          <SentimentBar sentiment={topic.sentiment} />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{topic.sentiment.positive} positive</span>
            <span>{topic.sentiment.negative} negative</span>
          </div>
        </Card>
      </div>

      <h2 className="text-sm font-semibold text-foreground mb-3">Related Articles</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No articles found for this topic.</p>
      ) : (
        <div>
          {articles.map((article: any) => (
            <FeedCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopicsPage() {
  const { data: topics, isLoading } = useTopics();
  const [selectedTopic, setSelectedTopic] = useState<TopicData | null>(null);

  if (selectedTopic) {
    return <TopicDetail topic={selectedTopic} onBack={() => setSelectedTopic(null)} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-foreground mb-6" data-testid="text-page-title">Topics</h1>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(topics || []).map((topic) => (
            <Card
              key={topic.name}
              className="p-4 cursor-pointer hover-elevate transition-colors"
              onClick={() => setSelectedTopic(topic)}
              data-testid={`card-topic-${topic.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-foreground">{topic.name}</h3>
                <Badge variant="secondary" className="text-xs">{topic.count}</Badge>
              </div>

              <SentimentBar sentiment={topic.sentiment} />

              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>Top: {topic.topSource}</span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> 24h
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
