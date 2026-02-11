import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { type Article } from "@shared/schema";

export function BreakingNewsBanner() {
  const { toast } = useToast();
  const seenIds = useRef<Set<number>>(new Set());

  const { data: urgentArticles } = useQuery<Article[]>({
    queryKey: ["/api/articles/urgent"],
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!urgentArticles) return;

    for (const article of urgentArticles) {
      if (!seenIds.current.has(article.id)) {
        seenIds.current.add(article.id);
        toast({
          variant: "destructive",
          title: `Breaking: ${article.title}`,
        });
      }
    }
  }, [urgentArticles, toast]);

  return null;
}
