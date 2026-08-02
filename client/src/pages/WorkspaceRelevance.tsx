import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Loader2, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Workspace = {
  id: number;
  name: string;
  description?: string | null;
  purpose?: string | null;
  scopeMode?: string | null;
  globalScope?: boolean | null;
  primaryCountryCodes?: string[];
  secondaryCountryCodes?: string[];
  regionCodes?: string[];
  subnationalAreas?: string[];
  preferredLanguages?: string[];
  active?: boolean | null;
};

type RelevanceProfile = {
  topics: string[];
  subtopics: string[];
  industries: string[];
  entities: string[];
  organizations: string[];
  people: string[];
  projects: string[];
  events: string[];
  multilingualAliases: Record<string, string[]> | string[];
  inclusionTerms: string[];
  exclusionTerms: string[];
  impactTerms: string[];
  contextualTerms: string[];
  minimumConfidence: number;
  includeContextualByDefault: boolean;
  contextualLabel: string;
  active: boolean;
};

type ReviewItem = {
  id: number;
  relevanceStatus: string;
  confidence: number;
  shortReason?: string | null;
  articleId: number;
  article: {
    id: number;
    title: string;
    summary?: string | null;
    url?: string | null;
    publishedAt?: string | null;
  };
};

const STATUS_OPTIONS = [
  "direct_scope_match",
  "material_scope_impact",
  "contextual",
  "not_relevant",
  "needs_review",
];

const emptyProfile: RelevanceProfile = {
  topics: [],
  subtopics: [],
  industries: [],
  entities: [],
  organizations: [],
  people: [],
  projects: [],
  events: [],
  multilingualAliases: [],
  inclusionTerms: [],
  exclusionTerms: [],
  impactTerms: [],
  contextualTerms: [],
  minimumConfidence: 60,
  includeContextualByDefault: false,
  contextualLabel: "Strategic Context",
  active: true,
};

function parseList(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function listValue(values?: string[] | null): string {
  return Array.isArray(values) ? values.join("\n") : "";
}

function aliasValue(value: RelevanceProfile["multilingualAliases"]): string {
  if (Array.isArray(value)) return listValue(value);
  if (value && typeof value === "object") {
    return Object.values(value).flat().join("\n");
  }
  return "";
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  if (value === "direct_scope_match" || value === "material_scope_impact") return "default";
  if (value === "not_relevant") return "destructive";
  if (value === "needs_review") return "outline";
  return "secondary";
}

export default function WorkspaceRelevance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [form, setForm] = useState<RelevanceProfile>(emptyProfile);
  const [previewArticle, setPreviewArticle] = useState({
    title: "",
    summary: "",
    content: "",
    url: "",
    sourceName: "",
  });
  const [previewResult, setPreviewResult] = useState<any>(null);

  const { data: workspaceData, isLoading: loadingWorkspaces } = useQuery<{ items: Workspace[]; total: number }>({
    queryKey: ["/api/workspaces"],
  });
  const workspaces = workspaceData?.items || [];

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(String(workspaces[0].id));
    }
  }, [selectedWorkspaceId, workspaces]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => String(workspace.id) === selectedWorkspaceId) || null,
    [selectedWorkspaceId, workspaces],
  );

  const { data: profileData, isFetching: loadingProfile } = useQuery<{ profile: Partial<RelevanceProfile> | null; effectiveProfile: any }>({
    queryKey: ["/api/workspaces", selectedWorkspaceId, "relevance-profile"],
    enabled: Boolean(selectedWorkspaceId),
  });

  useEffect(() => {
    if (profileData) {
      setForm({
        ...emptyProfile,
        ...(profileData.profile || {}),
      });
    }
  }, [profileData]);

  const { data: reviewData, isFetching: loadingReview } = useQuery<{ items: ReviewItem[]; total: number }>({
    queryKey: ["/api/workspaces", selectedWorkspaceId, "relevance", "review"],
    enabled: Boolean(selectedWorkspaceId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/workspaces/${selectedWorkspaceId}/relevance-profile`, form);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/workspaces", selectedWorkspaceId, "relevance-profile"], data);
      toast({ title: "Relevance profile saved" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Save failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workspaces/${selectedWorkspaceId}/relevance/preview`, previewArticle);
      return res.json();
    },
    onSuccess: (data) => setPreviewResult(data.relevance),
    onError: (error) => {
      toast({ variant: "destructive", title: "Preview failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ articleId, relevanceStatus }: { articleId: number; relevanceStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/workspaces/${selectedWorkspaceId}/articles/${articleId}/relevance`, {
        relevanceStatus,
        reviewNote: "Manual decision from workspace relevance review.",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", selectedWorkspaceId, "relevance", "review"] });
      toast({ title: "Manual decision saved" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Review failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  const updateList = (key: keyof RelevanceProfile, value: string) => {
    setForm((current) => ({ ...current, [key]: parseList(value) }));
  };

  if (loadingWorkspaces) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-md" />
          <Skeleton className="h-96 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workspace relevance</h1>
            <p className="text-sm text-muted-foreground">Create a client workspace before configuring relevance rules.</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No monitoring workspaces are available.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workspace relevance</h1>
            <p className="text-sm text-muted-foreground">Control what each monitoring workspace includes, reviews, and excludes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={String(workspace.id)}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !selectedWorkspaceId}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {selectedWorkspace && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Purpose</div>
              <div className="mt-1 text-sm font-medium">{selectedWorkspace.purpose || "custom"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Scope</div>
              <div className="mt-1 text-sm font-medium">{selectedWorkspace.scopeMode || "hybrid"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Countries</div>
              <div className="mt-1 text-sm font-medium">{(selectedWorkspace.primaryCountryCodes || []).join(", ") || "None"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Languages</div>
              <div className="mt-1 text-sm font-medium">{(selectedWorkspace.preferredLanguages || []).join(", ") || "Any"}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Relevance profile</CardTitle>
            <CardDescription>Lists are global to this workspace and apply to every assigned source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingProfile ? (
              <Skeleton className="h-80 w-full rounded-md" />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Topics" value={listValue(form.topics)} onChange={(value) => updateList("topics", value)} />
                  <Field label="Entities" value={listValue(form.entities)} onChange={(value) => updateList("entities", value)} />
                  <Field
                    label="Aliases"
                    value={aliasValue(form.multilingualAliases)}
                    onChange={(value) => setForm((current) => ({ ...current, multilingualAliases: parseList(value) }))}
                  />
                  <Field label="Organizations" value={listValue(form.organizations)} onChange={(value) => updateList("organizations", value)} />
                  <Field label="People" value={listValue(form.people)} onChange={(value) => updateList("people", value)} />
                  <Field label="Inclusion terms" value={listValue(form.inclusionTerms)} onChange={(value) => updateList("inclusionTerms", value)} />
                  <Field label="Exclusion terms" value={listValue(form.exclusionTerms)} onChange={(value) => updateList("exclusionTerms", value)} />
                  <Field label="Impact terms" value={listValue(form.impactTerms)} onChange={(value) => updateList("impactTerms", value)} />
                  <Field label="Contextual terms" value={listValue(form.contextualTerms)} onChange={(value) => updateList("contextualTerms", value)} />
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="contextual-label">Contextual section label</Label>
                    <Input
                      id="contextual-label"
                      value={form.contextualLabel}
                      onChange={(event) => setForm((current) => ({ ...current, contextualLabel: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum-confidence">Minimum confidence</Label>
                    <Input
                      id="minimum-confidence"
                      type="number"
                      min={0}
                      max={100}
                      value={form.minimumConfidence}
                      onChange={(event) => setForm((current) => ({ ...current, minimumConfidence: Number(event.target.value) }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">Include contextual content</div>
                    <div className="text-xs text-muted-foreground">Contextual items remain separate from direct coverage.</div>
                  </div>
                  <Switch
                    checked={form.includeContextualByDefault}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, includeContextualByDefault: checked }))}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Evaluate a sample without inserting anything.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Headline"
                value={previewArticle.title}
                onChange={(event) => setPreviewArticle((current) => ({ ...current, title: event.target.value }))}
              />
              <Textarea
                placeholder="Summary or description"
                value={previewArticle.summary}
                onChange={(event) => setPreviewArticle((current) => ({ ...current, summary: event.target.value }))}
              />
              <Input
                placeholder="Source name"
                value={previewArticle.sourceName}
                onChange={(event) => setPreviewArticle((current) => ({ ...current, sourceName: event.target.value }))}
              />
              <Button variant="secondary" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || !previewArticle.title.trim()}>
                {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Preview relevance
              </Button>
              {previewResult && (
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(previewResult.relevanceStatus)}>{statusLabel(previewResult.relevanceStatus)}</Badge>
                    <span className="text-muted-foreground">{previewResult.confidence}%</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{previewResult.shortReason}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(previewResult.supportingSignals || []).slice(0, 8).map((signal: any, index: number) => (
                      <Badge key={index} variant="outline">{signal.type}: {signal.term}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Needs review</CardTitle>
                <CardDescription>Manual decisions override automation until reopened.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/workspaces", selectedWorkspaceId, "relevance", "review"] })}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingReview ? (
                <Skeleton className="h-32 w-full rounded-md" />
              ) : (reviewData?.items || []).length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No items require review.
                </div>
              ) : (
                (reviewData?.items || []).map((item) => (
                  <div key={item.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium leading-snug">{item.article.title}</div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.shortReason || item.article.summary}</p>
                      </div>
                      <Badge variant={statusVariant(item.relevanceStatus)}>{statusLabel(item.relevanceStatus)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={status === item.relevanceStatus ? "default" : "outline"}
                          onClick={() => reviewMutation.mutate({ articleId: item.article.id, relevanceStatus: status })}
                        >
                          {status === item.relevanceStatus && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                          {statusLabel(status)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        className="min-h-28 resize-y"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="One item per line"
      />
    </div>
  );
}
