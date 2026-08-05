import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bot, FileText, Globe2, Landmark, Loader2, RefreshCw, Save, Settings, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions, CAPS } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import type { EmbassyProfile } from "@shared/article-taxonomy";

type ClientSettingsPayload = {
  clientId: number;
  clientName: string;
  defaultLanguage: string;
  feedLiveUpdateEnabled: boolean;
  feedLiveUpdateIntervalSeconds: number;
  feedLiveUpdateMode: "notify" | "auto_load";
  defaultFeedDateRange: "all" | "today" | "week" | "month";
  defaultArticleRetentionDays: number;
  defaultSourceIntervalMinutes: number;
  defaultMaxArticlesPerFetch: number;
  aiEnabled: boolean;
  dailyTokenBudget: number;
  dailyJobLimit: number;
  aiTokenBudgets: {
    analysis: number;
    translation: number;
    summaries: number;
  };
  aiUsageToday: {
    totalTokens: number;
    jobCount: number;
    analysisTokens: number;
    translationTokens: number;
    summariesTokens: number;
  };
  autoTranslationEnabled: boolean;
  defaultTargetLanguage: string;
  reportExportFormat: "txt" | "csv";
  reportIncludeSummaries: boolean;
  homeCountryCode: string | null;
  homeCountryName: string | null;
  homeCountryAliases: string[];
  embassyAliases: string[];
  ambassadorAliases: string[];
  bilateralCategoryLabel: string | null;
  embassyProfile?: EmbassyProfile | null;
  updatedAt: string | null;
};

function numberValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseAliasList(value: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  value
    .split(/[\n,]+/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        aliases.push(item);
      }
    });
  return aliases;
}

function aliasListValue(values?: string[] | null): string {
  return Array.isArray(values) ? values.join("\n") : "";
}

function nullableText(value: string | null | undefined): string | null {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  return cleaned || null;
}

export default function ClientSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasCap } = usePermissions();
  const canManageSettings = hasCap(CAPS.SETTINGS_MANAGE);
  const [form, setForm] = useState<ClientSettingsPayload | null>(null);

  const { data, isLoading, isFetching } = useQuery<ClientSettingsPayload>({
    queryKey: ["/api/client/settings"],
  });

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        defaultLanguage: "en",
        defaultTargetLanguage: "en",
        aiTokenBudgets: {
          analysis: data.aiTokenBudgets?.analysis ?? 0,
          translation: data.aiTokenBudgets?.translation ?? 0,
          summaries: data.aiTokenBudgets?.summaries ?? 0,
        },
        aiUsageToday: {
          totalTokens: data.aiUsageToday?.totalTokens ?? 0,
          jobCount: data.aiUsageToday?.jobCount ?? 0,
          analysisTokens: data.aiUsageToday?.analysisTokens ?? 0,
          translationTokens: data.aiUsageToday?.translationTokens ?? 0,
          summariesTokens: data.aiUsageToday?.summariesTokens ?? 0,
        },
      });
    }
  }, [data]);

  const dirty = useMemo(() => JSON.stringify(data || null) !== JSON.stringify(form || null), [data, form]);

  const updateField = <K extends keyof ClientSettingsPayload>(key: K, value: ClientSettingsPayload[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const updateAiBudget = (key: keyof ClientSettingsPayload["aiTokenBudgets"], value: number) => {
    setForm((current) => current ? {
      ...current,
      aiTokenBudgets: {
        ...current.aiTokenBudgets,
        [key]: numberValue(value, 0, 50_000_000),
      },
    } : current);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Settings are not loaded");
      const res = await apiRequest("PUT", "/api/client/settings", {
        defaultLanguage: "en",
        feedLiveUpdateEnabled: form.feedLiveUpdateEnabled,
        feedLiveUpdateIntervalSeconds: numberValue(form.feedLiveUpdateIntervalSeconds, 15, 300),
        feedLiveUpdateMode: form.feedLiveUpdateMode,
        defaultFeedDateRange: form.defaultFeedDateRange,
        defaultArticleRetentionDays: numberValue(form.defaultArticleRetentionDays, 1, 30),
        defaultSourceIntervalMinutes: numberValue(form.defaultSourceIntervalMinutes, 5, 1440),
        defaultMaxArticlesPerFetch: numberValue(form.defaultMaxArticlesPerFetch, 1, 100),
        aiEnabled: form.aiEnabled,
        dailyTokenBudget: numberValue(form.dailyTokenBudget, 0, 50_000_000),
        dailyJobLimit: numberValue(form.dailyJobLimit, 0, 100_000),
        aiTokenBudgets: {
          analysis: numberValue(form.aiTokenBudgets.analysis, 0, 50_000_000),
          translation: numberValue(form.aiTokenBudgets.translation, 0, 50_000_000),
          summaries: numberValue(form.aiTokenBudgets.summaries, 0, 50_000_000),
        },
        autoTranslationEnabled: form.autoTranslationEnabled,
        defaultTargetLanguage: "en",
        reportExportFormat: form.reportExportFormat,
        reportIncludeSummaries: form.reportIncludeSummaries,
        homeCountryCode: nullableText(form.homeCountryCode),
        homeCountryName: nullableText(form.homeCountryName),
        homeCountryAliases: form.homeCountryAliases || [],
        embassyAliases: form.embassyAliases || [],
        ambassadorAliases: form.ambassadorAliases || [],
        bilateralCategoryLabel: nullableText(form.bilateralCategoryLabel),
      });
      return res.json() as Promise<ClientSettingsPayload>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/client/settings"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: t("settings.saved", "Settings saved") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-client-settings-title">
              {t("settings.title", "Settings")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{form.clientName}</p>
            <Badge variant="secondary">Tenant #{form.clientId}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || !canManageSettings || saveMutation.isPending}
            data-testid="button-save-client-settings"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">{t("common.save", "Save")}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              {t("settings.feedBehavior", "Feed Behavior")}
            </CardTitle>
            <CardDescription>{t("settings.feedBehaviorDescription", "Client-wide defaults for live updates and the default feed window.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="feed-live-updates">{t("settings.liveUpdates", "Live updates")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.liveUpdatesHint", "Check for new articles while the feed is open.")}</p>
              </div>
              <Switch
                id="feed-live-updates"
                checked={form.feedLiveUpdateEnabled}
                onCheckedChange={(checked) => updateField("feedLiveUpdateEnabled", checked)}
                disabled={!canManageSettings}
                data-testid="switch-feed-live-updates"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feed-update-interval">{t("settings.checkInterval", "Check interval")}</Label>
                <Input
                  id="feed-update-interval"
                  type="number"
                  min={15}
                  max={300}
                  value={form.feedLiveUpdateIntervalSeconds}
                  onChange={(event) => updateField("feedLiveUpdateIntervalSeconds", numberValue(Number(event.target.value), 15, 300))}
                  disabled={!canManageSettings}
                  data-testid="input-feed-update-interval"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.updateMode", "Update mode")}</Label>
                <Select
                  value={form.feedLiveUpdateMode}
                  onValueChange={(value) => updateField("feedLiveUpdateMode", value as ClientSettingsPayload["feedLiveUpdateMode"])}
                  disabled={!canManageSettings}
                >
                  <SelectTrigger data-testid="select-feed-update-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notify">{t("settings.notifyOnly", "Notify only")}</SelectItem>
                    <SelectItem value="auto_load">{t("settings.autoLoad", "Auto-load")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("settings.defaultFeedWindow", "Default feed window")}</Label>
              <Select
                value={form.defaultFeedDateRange}
                onValueChange={(value) => updateField("defaultFeedDateRange", value as ClientSettingsPayload["defaultFeedDateRange"])}
                disabled={!canManageSettings}
              >
                <SelectTrigger data-testid="select-default-feed-date-range"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allTime", "All time")}</SelectItem>
                  <SelectItem value="today">{t("common.today", "Today")}</SelectItem>
                  <SelectItem value="week">{t("common.last7Days", "Last 7 days")}</SelectItem>
                  <SelectItem value="month">{t("common.last30Days", "Last 30 days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              {t("settings.embassyProfile", "Embassy Profile")}
            </CardTitle>
            <CardDescription>{t("settings.embassyProfileDescription", "Controls the tenant-specific bilateral relations label and non-AI classification terms.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="home-country-code">{t("settings.homeCountryCode", "Country code")}</Label>
                <Input
                  id="home-country-code"
                  value={form.homeCountryCode || ""}
                  onChange={(event) => updateField("homeCountryCode", event.target.value.toUpperCase())}
                  placeholder="US"
                  disabled={!canManageSettings}
                  data-testid="input-home-country-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="home-country-name">{t("settings.homeCountryName", "Home country")}</Label>
                <Input
                  id="home-country-name"
                  value={form.homeCountryName || ""}
                  onChange={(event) => updateField("homeCountryName", event.target.value)}
                  placeholder="United States"
                  disabled={!canManageSettings}
                  data-testid="input-home-country-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bilateral-label">{t("settings.bilateralCategoryLabel", "Bilateral label")}</Label>
                <Input
                  id="bilateral-label"
                  value={form.bilateralCategoryLabel || ""}
                  onChange={(event) => updateField("bilateralCategoryLabel", event.target.value)}
                  placeholder="Iraq in US News"
                  disabled={!canManageSettings}
                  data-testid="input-bilateral-category-label"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="home-country-aliases">{t("settings.homeCountryAliases", "Country aliases")}</Label>
                <Textarea
                  id="home-country-aliases"
                  value={aliasListValue(form.homeCountryAliases)}
                  onChange={(event) => updateField("homeCountryAliases", parseAliasList(event.target.value))}
                  placeholder={"United States\nU.S.\nAmerica"}
                  disabled={!canManageSettings}
                  className="min-h-32"
                  data-testid="textarea-home-country-aliases"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="embassy-aliases">{t("settings.embassyAliases", "Embassy aliases")}</Label>
                <Textarea
                  id="embassy-aliases"
                  value={aliasListValue(form.embassyAliases)}
                  onChange={(event) => updateField("embassyAliases", parseAliasList(event.target.value))}
                  placeholder={"U.S. Embassy Baghdad\nUnited States Embassy Baghdad"}
                  disabled={!canManageSettings}
                  className="min-h-32"
                  data-testid="textarea-embassy-aliases"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ambassador-aliases">{t("settings.ambassadorAliases", "Ambassador aliases")}</Label>
                <Textarea
                  id="ambassador-aliases"
                  value={aliasListValue(form.ambassadorAliases)}
                  onChange={(event) => updateField("ambassadorAliases", parseAliasList(event.target.value))}
                  placeholder={"Ambassador name\nArabic spelling"}
                  disabled={!canManageSettings}
                  className="min-h-32"
                  data-testid="textarea-ambassador-aliases"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              {t("settings.sourceDefaults", "Source Defaults")}
            </CardTitle>
            <CardDescription>{t("settings.sourceDefaultsDescription", "Used when adding new website, RSS, and social feed sources.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="default-source-interval">{t("settings.fetchEvery", "Fetch every")}</Label>
              <Input
                id="default-source-interval"
                type="number"
                min={5}
                max={1440}
                value={form.defaultSourceIntervalMinutes}
                onChange={(event) => updateField("defaultSourceIntervalMinutes", numberValue(Number(event.target.value), 5, 1440))}
                disabled={!canManageSettings}
                data-testid="input-default-source-interval"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-max-articles">{t("settings.postsPerFetch", "Posts/fetch")}</Label>
              <Input
                id="default-max-articles"
                type="number"
                min={1}
                max={100}
                value={form.defaultMaxArticlesPerFetch}
                onChange={(event) => updateField("defaultMaxArticlesPerFetch", numberValue(Number(event.target.value), 1, 100))}
                disabled={!canManageSettings}
                data-testid="input-default-max-articles"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-retention">{t("settings.retention", "Retention")}</Label>
              <Input
                id="default-retention"
                type="number"
                min={1}
                max={30}
                value={form.defaultArticleRetentionDays}
                onChange={(event) => updateField("defaultArticleRetentionDays", numberValue(Number(event.target.value), 1, 30))}
                disabled={!canManageSettings}
                data-testid="input-default-retention"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" />
              {t("settings.aiControls", "AI Controls")}
            </CardTitle>
            <CardDescription>{t("settings.aiControlsDescription", "Control AI activation, daily limits, and token budgets for analysis, translation, and summaries.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="ai-enabled">{t("settings.activateAi", "Activate AI")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings.activateAiHint", "Allow this client to use AI analysis, translation, and summaries.")}</p>
                </div>
                <Switch
                  id="ai-enabled"
                  checked={form.aiEnabled}
                  onCheckedChange={(checked) => updateField("aiEnabled", checked)}
                  disabled={!canManageSettings}
                  data-testid="switch-ai-enabled"
                />
              </div>
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{form.aiUsageToday.totalTokens.toLocaleString()} {t("settings.tokensUsedToday", "tokens used today")}</div>
                <div className="text-xs text-muted-foreground">{form.aiUsageToday.jobCount.toLocaleString()} {t("settings.aiJobsToday", "AI jobs completed today")}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily-token-budget">{t("settings.dailyTokenBudget", "Daily token budget")}</Label>
                <Input
                  id="daily-token-budget"
                  type="number"
                  min={0}
                  max={50000000}
                  value={form.dailyTokenBudget}
                  onChange={(event) => updateField("dailyTokenBudget", numberValue(Number(event.target.value), 0, 50_000_000))}
                  disabled={!canManageSettings}
                  data-testid="input-daily-token-budget"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-job-limit">{t("settings.dailyJobLimit", "Daily job limit")}</Label>
                <Input
                  id="daily-job-limit"
                  type="number"
                  min={0}
                  max={100000}
                  value={form.dailyJobLimit}
                  onChange={(event) => updateField("dailyJobLimit", numberValue(Number(event.target.value), 0, 100_000))}
                  disabled={!canManageSettings}
                  data-testid="input-daily-job-limit"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="analysis-token-budget">{t("settings.analysisTokenBudget", "Analysis tokens")}</Label>
                <Input
                  id="analysis-token-budget"
                  type="number"
                  min={0}
                  max={50000000}
                  value={form.aiTokenBudgets.analysis}
                  onChange={(event) => updateAiBudget("analysis", Number(event.target.value))}
                  disabled={!canManageSettings}
                  data-testid="input-analysis-token-budget"
                />
                <p className="text-xs text-muted-foreground">{form.aiUsageToday.analysisTokens.toLocaleString()} {t("settings.usedToday", "used today")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="translation-token-budget">{t("settings.translationTokenBudget", "Translation tokens")}</Label>
                <Input
                  id="translation-token-budget"
                  type="number"
                  min={0}
                  max={50000000}
                  value={form.aiTokenBudgets.translation}
                  onChange={(event) => updateAiBudget("translation", Number(event.target.value))}
                  disabled={!canManageSettings}
                  data-testid="input-translation-token-budget"
                />
                <p className="text-xs text-muted-foreground">{form.aiUsageToday.translationTokens.toLocaleString()} {t("settings.usedToday", "used today")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="summaries-token-budget">{t("settings.summariesTokenBudget", "Summary tokens")}</Label>
                <Input
                  id="summaries-token-budget"
                  type="number"
                  min={0}
                  max={50000000}
                  value={form.aiTokenBudgets.summaries}
                  onChange={(event) => updateAiBudget("summaries", Number(event.target.value))}
                  disabled={!canManageSettings}
                  data-testid="input-summaries-token-budget"
                />
                <p className="text-xs text-muted-foreground">{form.aiUsageToday.summariesTokens.toLocaleString()} {t("settings.usedToday", "used today")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-primary" />
              {t("settings.languageTranslation", "Language & Translation")}
            </CardTitle>
            <CardDescription>{t("settings.languageTranslationDescription", "Client-wide translation behavior. Workspace relevance rules stay under workspace setup.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.defaultLanguage", "Default language")}</Label>
                <Input value="English" disabled data-testid="input-default-language-english-only" />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.targetLanguage", "Target language")}</Label>
                <Input value="English" disabled data-testid="input-target-language-english-only" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="auto-translation">{t("settings.autoTranslation", "Auto translation")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.autoTranslationHint", "Queue translations when translated reading is enabled.")}</p>
              </div>
              <Switch
                id="auto-translation"
                checked={form.autoTranslationEnabled}
                onCheckedChange={(checked) => updateField("autoTranslationEnabled", checked)}
                disabled={!canManageSettings}
                data-testid="switch-auto-translation"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {t("settings.reportDefaults", "Report Defaults")}
            </CardTitle>
            <CardDescription>{t("settings.reportDefaultsDescription", "Defaults for non-AI report basket exports.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>{t("settings.exportFormat", "Export format")}</Label>
              <Select
                value={form.reportExportFormat}
                onValueChange={(value) => updateField("reportExportFormat", value as ClientSettingsPayload["reportExportFormat"])}
                disabled={!canManageSettings}
              >
                <SelectTrigger data-testid="select-report-export-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="txt">{t("settings.textReport", "Text report")}</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="report-summaries">{t("settings.includeSummaries", "Include summaries")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.includeSummariesHint", "Add article summaries to exported report basket files.")}</p>
              </div>
              <Switch
                id="report-summaries"
                checked={form.reportIncludeSummaries}
                onCheckedChange={(checked) => updateField("reportIncludeSummaries", checked)}
                disabled={!canManageSettings}
                data-testid="switch-report-include-summaries"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
