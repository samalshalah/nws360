import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bell,
  Edit3,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ARTICLE_CATEGORIES, IRAQ_PROVINCES } from "@shared/article-taxonomy";
import { CAPS, type AlertRule, type Article, type Source } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useSources } from "@/hooks/use-sources";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AlertRuleArticle = Article & { source: Source | null };

type AlertRuleSummary = {
  ruleId: number;
  count: number;
  feedUrl: string;
  articles: AlertRuleArticle[];
};

type AlertOverviewResponse = {
  rules: AlertRule[];
  summaries: AlertRuleSummary[];
  totals: {
    rules: number;
    activeRules: number;
    matchedRules: number;
    matchedArticles: number;
    evaluatedRules: number;
  };
};

type AlertRuleForm = {
  name: string;
  description: string;
  ruleType: "keyword" | "source" | "category" | "province" | "combined";
  searchTerm: string;
  sourceId: string;
  sourceType: string;
  category: string;
  province: string;
  severity: "low" | "medium" | "high" | "critical";
  active: boolean;
  matchWindowHours: number;
};

type AlertRulePayload = {
  name: string;
  description: string | null;
  ruleType: AlertRuleForm["ruleType"];
  searchTerm: string | null;
  sourceId: number | null;
  sourceType: string | null;
  category: string | null;
  province: string | null;
  severity: AlertRuleForm["severity"];
  active: boolean;
  notifyInApp: boolean;
  matchWindowHours: number;
};

const SOURCE_TYPES = [
  { value: "rss", label: "RSS" },
  { value: "website", label: "Website" },
  { value: "google_news", label: "Google News" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
];

const RULE_TYPES = [
  { value: "keyword", label: "Keyword" },
  { value: "source", label: "Source" },
  { value: "category", label: "Category" },
  { value: "province", label: "Province" },
  { value: "combined", label: "Combined" },
] as const;

const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const INITIAL_FORM: AlertRuleForm = {
  name: "",
  description: "",
  ruleType: "keyword",
  searchTerm: "",
  sourceId: "all",
  sourceType: "all",
  category: "all",
  province: "all",
  severity: "medium",
  active: true,
  matchWindowHours: 24,
};

function clampHours(value: number) {
  if (!Number.isFinite(value)) return 24;
  return Math.min(720, Math.max(1, Math.round(value)));
}

function toPayload(form: AlertRuleForm): AlertRulePayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    ruleType: form.ruleType,
    searchTerm: form.searchTerm.trim() || null,
    sourceId: form.sourceId !== "all" ? Number(form.sourceId) : null,
    sourceType: form.sourceType !== "all" ? form.sourceType : null,
    category: form.category !== "all" ? form.category : null,
    province: form.province !== "all" ? form.province : null,
    severity: form.severity,
    active: form.active,
    notifyInApp: true,
    matchWindowHours: clampHours(form.matchWindowHours),
  };
}

function hasCondition(payload: AlertRulePayload) {
  return Boolean(payload.searchTerm || payload.sourceId || payload.sourceType || payload.category || payload.province);
}

function ruleConditions(rule: AlertRule, sourcesById: Map<number, Source>) {
  const conditions: string[] = [];
  if (rule.searchTerm) conditions.push(`Keyword: ${rule.searchTerm}`);
  if (rule.sourceId) {
    conditions.push(`Source: ${sourcesById.get(rule.sourceId)?.name || `#${rule.sourceId}`}`);
  }
  if (rule.sourceType) conditions.push(`Type: ${SOURCE_TYPES.find(item => item.value === rule.sourceType)?.label || rule.sourceType}`);
  if (rule.category) conditions.push(`Category: ${ARTICLE_CATEGORIES.find(item => item.code === rule.category)?.label || rule.category}`);
  if (rule.province) conditions.push(`Province: ${IRAQ_PROVINCES.find(item => item.code === rule.province)?.label || rule.province}`);
  return conditions;
}

function articleTime(article: AlertRuleArticle) {
  const raw = article.publishedAt || article.ingestedAt || article.createdAt;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

function sourceDisplay(article: AlertRuleArticle) {
  return article.subSource || article.source?.name || "Unknown source";
}

export default function ClientAlerts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { hasCap } = usePermissions();
  const canManageAlerts = hasCap(CAPS.ALERTS_MANAGE);
  const [form, setForm] = useState<AlertRuleForm>(INITIAL_FORM);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  const { data: overview, isLoading, isFetching, refetch } = useQuery<AlertOverviewResponse>({
    queryKey: ["/api/alerts/overview"],
  });

  const { data: sources = [] } = useSources();

  const sourcesById = useMemo(() => new Map((sources as Source[]).map(source => [source.id, source])), [sources]);
  const summaryByRuleId = useMemo(() => {
    const map = new Map<number, AlertRuleSummary>();
    (overview?.summaries || []).forEach(summary => map.set(summary.ruleId, summary));
    return map;
  }, [overview?.summaries]);

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/alerts/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/alerts/rules"] });
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingRuleId(null);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: AlertRulePayload) => {
      const res = await apiRequest("POST", "/api/alerts/rules", payload);
      return res.json() as Promise<AlertRule>;
    },
    onSuccess: () => {
      invalidateAlerts();
      resetForm();
      toast({ title: t("alerts.created", "Alert rule created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload, reset }: { id: number; payload: Partial<AlertRulePayload>; reset?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/alerts/rules/${id}`, payload);
      return { rule: await res.json() as AlertRule, reset };
    },
    onSuccess: ({ reset }) => {
      invalidateAlerts();
      if (reset) resetForm();
      toast({ title: t("alerts.updated", "Alert rule updated") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/rules/${id}`);
      return id;
    },
    onSuccess: (id) => {
      invalidateAlerts();
      if (editingRuleId === id) resetForm();
      toast({ title: t("alerts.deleted", "Alert rule deleted") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const submitRule = () => {
    const payload = toPayload(form);
    if (payload.name.length < 2) {
      toast({ variant: "destructive", title: t("alerts.nameRequired", "Rule name is required") });
      return;
    }
    if (!hasCondition(payload)) {
      toast({ variant: "destructive", title: t("alerts.conditionRequired", "Add at least one alert condition") });
      return;
    }
    if (editingRuleId) {
      updateMutation.mutate({ id: editingRuleId, payload, reset: true });
    } else {
      createMutation.mutate(payload);
    }
  };

  const editRule = (rule: AlertRule) => {
    setEditingRuleId(rule.id);
    setForm({
      name: rule.name,
      description: rule.description || "",
      ruleType: (RULE_TYPES.some(item => item.value === rule.ruleType) ? rule.ruleType : "keyword") as AlertRuleForm["ruleType"],
      searchTerm: rule.searchTerm || "",
      sourceId: rule.sourceId ? String(rule.sourceId) : "all",
      sourceType: rule.sourceType || "all",
      category: rule.category || "all",
      province: rule.province || "all",
      severity: (SEVERITIES.some(item => item.value === rule.severity) ? rule.severity : "medium") as AlertRuleForm["severity"],
      active: rule.active !== false,
      matchWindowHours: rule.matchWindowHours || 24,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const rules = overview?.rules || [];
  const totals = overview?.totals || { rules: 0, activeRules: 0, matchedRules: 0, matchedArticles: 0, evaluatedRules: 0 };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-md" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-client-alerts-title">
              {t("alerts.title", "Alerts")}
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("alerts.subtitle", "Monitor keywords, sources, categories, and provinces using tenant-scoped article data.")}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-alerts">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">{t("common.refresh", "Refresh")}</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("alerts.totalRules", "Rules")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.rules}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("alerts.activeRules", "Active")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.activeRules}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("alerts.matchedRules", "Matched rules")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.matchedRules}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("alerts.matchedArticles", "Matched articles")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.matchedArticles}</p>
        </div>
      </div>

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {editingRuleId ? <Edit3 className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
            {editingRuleId ? t("alerts.editRule", "Edit Alert Rule") : t("alerts.newRule", "New Alert Rule")}
          </CardTitle>
          <CardDescription>{t("alerts.ruleDescription", "A rule matches articles when all selected conditions are true.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-3">
              <Label htmlFor="alert-rule-name">{t("alerts.ruleName", "Rule name")}</Label>
              <Input
                id="alert-rule-name"
                value={form.name}
                onChange={(event) => setForm(current => ({ ...current, name: event.target.value }))}
                disabled={!canManageAlerts}
                data-testid="input-alert-rule-name"
              />
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label htmlFor="alert-search-term">{t("alerts.keyword", "Keyword/topic")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="alert-search-term"
                  value={form.searchTerm}
                  onChange={(event) => setForm(current => ({ ...current, searchTerm: event.target.value }))}
                  className="pl-9"
                  disabled={!canManageAlerts}
                  data-testid="input-alert-search-term"
                />
              </div>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("alerts.ruleType", "Rule type")}</Label>
              <Select
                value={form.ruleType}
                onValueChange={(value) => setForm(current => ({ ...current, ruleType: value as AlertRuleForm["ruleType"] }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-rule-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("alerts.severity", "Severity")}</Label>
              <Select
                value={form.severity}
                onValueChange={(value) => setForm(current => ({ ...current, severity: value as AlertRuleForm["severity"] }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="alert-window">{t("alerts.windowHours", "Window hours")}</Label>
              <Input
                id="alert-window"
                type="number"
                min={1}
                max={720}
                value={form.matchWindowHours}
                onChange={(event) => setForm(current => ({ ...current, matchWindowHours: clampHours(Number(event.target.value)) }))}
                disabled={!canManageAlerts}
                data-testid="input-alert-window-hours"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-3">
              <Label>{t("alerts.source", "Source")}</Label>
              <Select
                value={form.sourceId}
                onValueChange={(value) => setForm(current => ({ ...current, sourceId: value }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                  {(sources as Source[]).map(source => (
                    <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("alerts.sourceType", "Source type")}</Label>
              <Select
                value={form.sourceType}
                onValueChange={(value) => setForm(current => ({ ...current, sourceType: value }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-source-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                  {SOURCE_TYPES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("alerts.category", "Category")}</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm(current => ({ ...current, category: value }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                  {ARTICLE_CATEGORIES.map(item => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("alerts.province", "Province")}</Label>
              <Select
                value={form.province}
                onValueChange={(value) => setForm(current => ({ ...current, province: value }))}
                disabled={!canManageAlerts}
              >
                <SelectTrigger data-testid="select-alert-province"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                  {IRAQ_PROVINCES.map(item => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-between gap-3 lg:col-span-3">
              <div className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                <Switch
                  id="alert-active"
                  checked={form.active}
                  onCheckedChange={(checked) => setForm(current => ({ ...current, active: checked }))}
                  disabled={!canManageAlerts}
                  data-testid="switch-alert-active"
                />
                <Label htmlFor="alert-active" className="text-sm">{t("common.active", "Active")}</Label>
              </div>
              <div className="flex gap-2">
                {editingRuleId && (
                  <Button variant="outline" onClick={resetForm} disabled={saving} data-testid="button-cancel-alert-edit">
                    {t("common.cancel", "Cancel")}
                  </Button>
                )}
                <Button onClick={submitRule} disabled={!canManageAlerts || saving} data-testid="button-save-alert-rule">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span className="ml-2">{editingRuleId ? t("common.save", "Save") : t("common.create", "Create")}</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alert-description">{t("alerts.notes", "Notes")}</Label>
            <Textarea
              id="alert-description"
              value={form.description}
              onChange={(event) => setForm(current => ({ ...current, description: event.target.value }))}
              className="min-h-[72px]"
              disabled={!canManageAlerts}
              data-testid="textarea-alert-description"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3" data-testid="list-alert-rules">
        {rules.length > 0 ? rules.map(rule => {
          const summary = summaryByRuleId.get(rule.id);
          const conditions = ruleConditions(rule, sourcesById);
          return (
            <div key={rule.id} className="rounded-md border border-border/60 bg-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">{rule.name}</h2>
                    <Badge variant={rule.active ? "default" : "secondary"}>{rule.active ? t("common.active", "Active") : t("common.paused", "Paused")}</Badge>
                    <Badge variant={rule.severity === "critical" || rule.severity === "high" ? "destructive" : "outline"}>
                      {SEVERITIES.find(item => item.value === rule.severity)?.label || rule.severity}
                    </Badge>
                    <Badge variant="secondary">{rule.matchWindowHours}h</Badge>
                  </div>
                  {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    {conditions.map(condition => (
                      <Badge key={condition} variant="outline" className="max-w-full truncate">
                        <Filter className="mr-1 h-3 w-3" />
                        {condition}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-2 text-right">
                    <p className="text-lg font-bold tabular-nums">{summary?.count ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{t("alerts.matches", "matches")}</p>
                  </div>
                  {summary?.feedUrl && (
                    <Button variant="outline" size="sm" onClick={() => setLocation(summary.feedUrl)} data-testid={`button-open-alert-feed-${rule.id}`}>
                      <ExternalLink className="h-4 w-4" />
                      <span className="ml-2">{t("alerts.openFeed", "Open feed")}</span>
                    </Button>
                  )}
                  {canManageAlerts && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => editRule(rule)} data-testid={`button-edit-alert-${rule.id}`}>
                        <Edit3 className="h-4 w-4" />
                        <span className="ml-2">{t("common.edit", "Edit")}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: rule.id, payload: { active: rule.active === false }, reset: false })}
                        disabled={updateMutation.isPending}
                        data-testid={`button-toggle-alert-${rule.id}`}
                      >
                        {rule.active === false ? t("common.activate", "Activate") : t("common.pause", "Pause")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(t("alerts.deleteConfirm", "Delete this alert rule?"))) {
                            deleteMutation.mutate(rule.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-alert-${rule.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="ml-2">{t("common.delete", "Delete")}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {summary && summary.articles.length > 0 && (
                <div className="mt-4 divide-y divide-border/60 rounded-md border border-border/60">
                  {summary.articles.map(article => (
                    <button
                      key={article.id}
                      type="button"
                      className="flex w-full items-start justify-between gap-4 px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() => setLocation(`/feed?articleId=${article.id}`)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{article.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{sourceDisplay(article)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{articleTime(article)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center" data-testid="empty-alert-rules">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <h2 className="text-base font-semibold text-foreground">{t("alerts.emptyTitle", "No alert rules")}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t("alerts.emptyBody", "Create rules for the topics, sources, and coverage areas that need active monitoring.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
