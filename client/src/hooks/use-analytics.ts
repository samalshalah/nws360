import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useAnalytics() {
  return useQuery({
    queryKey: [api.analytics.stats.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.stats.path);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return api.analytics.stats.responses[200].parse(await res.json());
    },
  });
}

export function useKeywords() {
  return useQuery({
    queryKey: [api.keywords.list.path],
    queryFn: async () => {
      const res = await fetch(api.keywords.list.path);
      if (!res.ok) throw new Error("Failed to fetch keywords");
      return api.keywords.list.responses[200].parse(await res.json());
    },
  });
}
