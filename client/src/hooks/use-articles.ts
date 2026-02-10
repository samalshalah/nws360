import { useQuery } from "@tanstack/react-query";
import { api, buildUrl, type ArticleQueryParams } from "@shared/routes";

export function useArticles(params?: ArticleQueryParams) {
  // Create a stable query key based on params
  const queryKey = [api.articles.list.path, JSON.stringify(params)];

  return useQuery({
    queryKey,
    queryFn: async () => {
      // Build query string
      const searchParams = new URLSearchParams();
      if (params) {
        if (params.search) searchParams.set("search", params.search);
        if (params.sourceId) searchParams.set("sourceId", params.sourceId.toString());
        if (params.sentiment) searchParams.set("sentiment", params.sentiment);
        if (params.page) searchParams.set("page", params.page.toString());
        if (params.limit) searchParams.set("limit", params.limit.toString());
      }
      
      const url = `${api.articles.list.path}?${searchParams.toString()}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error("Failed to fetch articles");
      return api.articles.list.responses[200].parse(await res.json());
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
