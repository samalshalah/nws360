import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { ArticleQueryParams } from "@shared/schema";

export function useArticles(params?: ArticleQueryParams) {
  const queryKey = [api.articles.list.path, JSON.stringify(params)];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params) {
        if (params.search) searchParams.set("search", params.search);
        if (params.sourceId) searchParams.set("sourceId", params.sourceId.toString());
        if (params.sentiment) searchParams.set("sentiment", params.sentiment);
        if (params.category) searchParams.set("category", params.category);
        if (params.sourceType) searchParams.set("sourceType", params.sourceType);
        if (params.sourceName) searchParams.set("sourceName", params.sourceName);
        if (params.lang) searchParams.set("lang", params.lang);
        if (params.startDate) searchParams.set("startDate", params.startDate);
        if (params.endDate) searchParams.set("endDate", params.endDate);
        if (params.page) searchParams.set("page", params.page.toString());
        if (params.limit) searchParams.set("limit", params.limit.toString());
      }
      
      const url = `${api.articles.list.path}?${searchParams.toString()}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error("Failed to fetch articles");
      return res.json();
    },
  });
}

export function useArticle(id: number) {
  return useQuery({
    queryKey: [api.articles.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.articles.get.path, { id });
      const res = await fetch(url);
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch article");
      return api.articles.get.responses[200].parse(await res.json());
    },
  });
}
