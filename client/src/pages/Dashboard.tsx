import { useAnalytics } from "@/hooks/use-analytics";
import { useArticles } from "@/hooks/use-articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Card, CardContent } from "@/components/ui/card";
import { Newspaper, Rss, TrendingUp, AlertTriangle, Landmark, Cpu, FlaskConical, HeartPulse, Briefcase, Gamepad2, Clapperboard, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { UpdatedAt } from "@/components/UpdatedAt";
import { DashboardSuggestions } from "@/components/DashboardSuggestions";

const categories = [
  { key: "urgent", icon: AlertTriangle, color: "text-red-500 dark:text-red-400" },
  { key: "political", icon: Landmark, color: "text-blue-500 dark:text-blue-400" },
  { key: "business", icon: Briefcase, color: "text-emerald-500 dark:text-emerald-400" },
  { key: "tech", icon: Cpu, color: "text-violet-500 dark:text-violet-400" },
  { key: "entertainment", icon: Clapperboard, color: "text-pink-500 dark:text-pink-400" },
  { key: "sports", icon: Gamepad2, color: "text-orange-500 dark:text-orange-400" },
  { key: "health", icon: HeartPulse, color: "text-teal-500 dark:text-teal-400" },
  { key: "science", icon: FlaskConical, color: "text-cyan-500 dark:text-cyan-400" },
  { key: "general", icon: Layers, color: "text-muted-foreground" },
];

function CategoryRow({ category, icon: Icon, color }: { category: string; icon: any; color: string }) {
  const { data, isLoading } = useArticles({ category, limit: 4 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const articles = data?.items || [];
  if (articles.length === 0) return null;

  const label = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="space-y-3" data-testid={`category-section-${category}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-lg font-semibold">{label}</h2>
        <span className="text-xs text-muted-foreground">({articles.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {articles.map((article: any, index: number) => (
          <div key={article.id} className="animate-slide-up" style={{ animationDelay: `${index * 60}ms` }}>
            <ArticleCard article={article} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: analytics, isLoading: isLoadingAnalytics, dataUpdatedAt: analyticsUpdatedAt } = useAnalytics();
  const { t } = useTranslation();

  const stats = [
    {
      title: t("dashboard.totalArticles"),
      value: analytics?.totalArticles || 0,
      icon: Newspaper,
      color: "text-blue-500 dark:text-blue-400",
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
    },
    {
      title: t("dashboard.activeSources"),
      value: analytics?.sourcesCount || 0,
      icon: Rss,
      color: "text-orange-500 dark:text-orange-400",
      bg: "bg-orange-500/10 dark:bg-orange-500/20",
    },
    {
      title: t("dashboard.trendingTopics"),
      value: analytics?.trendingKeywords?.length || 0,
      icon: TrendingUp,
      color: "text-purple-500 dark:text-purple-400",
      bg: "bg-purple-500/10 dark:bg-purple-500/20",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-dashboard-title">{t("dashboard.title")}</h1>
          <UpdatedAt timestamp={analyticsUpdatedAt ? new Date(analyticsUpdatedAt) : null} />
        </div>
        <p className="text-muted-foreground text-sm">{t("dashboard.subtitle")}</p>
      </div>

      <DashboardSuggestions />

      {isLoadingAnalytics ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, index) => (
            <Card key={stat.title} className="hover-elevate" style={{ animationDelay: `${index * 60}ms` }}>
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                  <h3 className="text-2xl font-bold tabular-nums" data-testid={`metric-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>{stat.value.toLocaleString()}</h3>
                </div>
                <div className={`p-3 rounded-md ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {categories.map((cat) => (
          <CategoryRow key={cat.key} category={cat.key} icon={cat.icon} color={cat.color} />
        ))}
      </div>
    </div>
  );
}
