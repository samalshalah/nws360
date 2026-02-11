import { useQuery } from "@tanstack/react-query";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { Bookmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

export default function Saved() {
  const { t } = useTranslation();

  const { data: savedArticles = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/bookmarks/articles"],
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-saved-title">
          {t("nav.saved")}
        </h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-md" />
          ))}
        </div>
      ) : savedArticles.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-md border border-dashed border-border">
          <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold font-display text-foreground">{t("feed.noBookmarks")}</h3>
          <p className="text-muted-foreground mt-2">{t("feed.noBookmarksHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {savedArticles.map((article: any) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
