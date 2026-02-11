import { useAnalytics } from "@/hooks/use-analytics";
import { useArticles } from "@/hooks/use-articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Card, CardContent } from "@/components/ui/card";
import { Newspaper, Rss, TrendingUp, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics();
  const { data: latestNews, isLoading: isLoadingNews } = useArticles({ limit: 4 });
  const { t } = useTranslation();

  if (isLoadingAnalytics || isLoadingNews) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: t("dashboard.totalArticles"),
      value: analytics?.totalArticles || 0,
      icon: Newspaper,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: t("dashboard.activeSources"),
      value: analytics?.sourcesCount || 0,
      icon: Rss,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      title: t("dashboard.trendingTopics"),
      value: analytics?.trendingKeywords?.length || 0,
      icon: TrendingUp,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-dashboard-title">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                <h3 className="text-3xl font-bold font-display">{stat.value}</h3>
              </div>
              <div className={`p-4 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-display">{t("dashboard.latestNews")}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
          {latestNews?.items.map((article: any) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      </div>
    </div>
  );
}
