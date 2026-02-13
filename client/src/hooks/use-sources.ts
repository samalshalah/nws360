import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateSourceRequest, type UpdateSourceRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useSources() {
  return useQuery({
    queryKey: [api.sources.list.path],
    queryFn: async () => {
      const res = await fetch(api.sources.list.path);
      if (!res.ok) throw new Error("Failed to fetch sources");
      return api.sources.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateSourceRequest) => {
      const res = await fetch(api.sources.create.path, {
        method: api.sources.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message);
        }
        throw new Error("Failed to create source");
      }
      return api.sources.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      toast({ title: "Success", description: "Source created successfully" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });
}

export function useUpdateSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSourceRequest) => {
      const url = buildUrl(api.sources.update.path, { id });
      const res = await fetch(url, {
        method: api.sources.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update source");
      return api.sources.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      toast({ title: "Success", description: "Source updated successfully" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });
}

export function useFetchSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sources/${id}/fetch`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to fetch feed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });
      toast({ title: "Feed fetched", description: `${data.newArticles} new article(s) found` });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });
}

export function useFetchAllSources() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/fetch-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to fetch feeds");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });
      toast({ title: "All feeds fetched", description: `${data.totalNewArticles} new article(s) found` });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });
}

export function usePreviewSource() {
  return useMutation({
    mutationFn: async (data: { url: string; type: string; maxArticles?: number }) => {
      const res = await fetch("/api/sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Preview failed" }));
        throw new Error(error.error || "Preview failed");
      }
      return res.json();
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.sources.delete.path, { id });
      const res = await fetch(url, { method: api.sources.delete.method });
      if (!res.ok) throw new Error("Failed to delete source");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      toast({ title: "Success", description: "Source deleted successfully" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });
}
