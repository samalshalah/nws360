import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Settings2, XCircle } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DEFAULT_OPERATIONAL_SETTINGS,
  OPERATIONAL_SETTINGS_LIMITS,
  addKeywordsToRule,
  canSaveOperationalSettings,
  normalizeFilterRule,
  normalizeOperationalPreview,
  normalizeOperationalSettingsRead,
  settingsEqual,
  settingsFromForm,
  settingsSnapshot,
  type NormalizedOperationalPreview,
  type OperationalSettingsReadResponse,
} from "@/lib/operational-source-settings";
import {
  OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS,
  OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES,
  type OperationalSourceSettings,
} from "@shared/operational-source-settings";
import type { SourceFilterField, SourceFilterRule } from "@shared/source-filter";

type AssignmentLike = {
  id: number;
  sourceId?: number | null;
  source?: { id?: number; name?: string; active?: boolean; publisherChannelId?: number | null } | null;
  publisher?: { name?: string } | null;
  channel?: { name?: string; channelType?: string } | null;
  status?: string;
  enabled?: boolean;
  testStatus?: string;
};

const SELECTOR_FIELDS: Array<{ key: keyof NonNullable<OperationalSourceSettings["collectorConfig"]["selectors"]>; label: string; help: string }> = [
  { key: "item", label: "Item", help: "Scopes each story card." },
  { key: "link", label: "Link", help: "Locates the article URL." },
  { key: "title", label: "Title", help: "Locates the headline." },
  { key: "summary", label: "Summary", help: "Optional article description." },
  { key: "image", label: "Image", help: "Optional image element." },
  { key: "date", label: "Date", help: "Optional publication date." },
];

const FIELD_LABELS: Record<SourceFilterField, string> = {
  title: "Title",
  description: "Description",
  link: "Link",
  imageTitle: "Image title",
};

function labelize(value: string | null | undefined) {
  return String(value || "unknown").replace(/_/g, " ");
}

function truncate(value: string | null | undefined, max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function parseError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Request failed");
  const statusMatch = raw.match(/^(\d+):\s*(.*)$/);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const body = statusMatch ? statusMatch[2] : raw;
  try {
    const parsed = JSON.parse(body);
    return {
      status,
      code: parsed.code ? String(parsed.code) : null,
      message: parsed.message ? String(parsed.message) : raw,
      details: parsed.details,
    };
  } catch {
    return { status, code: null, message: body || raw, details: null };
  }
}

function updateCollector(
  settings: OperationalSourceSettings,
  patch: Partial<OperationalSourceSettings["collectorConfig"]>,
): OperationalSourceSettings {
  return {
    ...settings,
    collectorConfig: {
      ...settings.collectorConfig,
      ...patch,
      renderJavascript: false,
    },
  };
}

function updateSelector(
  settings: OperationalSourceSettings,
  field: keyof NonNullable<OperationalSourceSettings["collectorConfig"]["selectors"]>,
  value: string,
): OperationalSourceSettings {
  const selectors = { ...(settings.collectorConfig.selectors || {}) };
  if (value.trim()) {
    selectors[field] = value;
  } else {
    delete selectors[field];
  }
  return updateCollector(settings, { selectors });
}

function updateRuleField(rule: SourceFilterRule, field: SourceFilterField, checked: boolean): SourceFilterRule {
  const next = checked ? [...rule.fields, field] : rule.fields.filter((item) => item !== field);
  return normalizeFilterRule({ ...rule, fields: next.length ? next : rule.fields });
}

function StateBadge({ label, state }: { label: string; state: "pass" | "warn" | "fail" | "neutral" }) {
  const variant = state === "fail" ? "destructive" : state === "pass" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="gap-1">
      {state === "pass" ? <CheckCircle2 className="h-3 w-3" /> : state === "fail" ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{value === null || value === undefined || value === "" ? "n/a" : String(value)}</div>
    </div>
  );
}

function KeywordRuleEditor({
  kind,
  value,
  onChange,
}: {
  kind: "whitelist" | "blacklist";
  value: SourceFilterRule;
  onChange: (value: SourceFilterRule) => void;
}) {
  const [draft, setDraft] = useState("");
  const label = kind === "whitelist" ? "Whitelist filter" : "Blacklist filter";
  const addDraft = () => {
    if (!draft.trim()) return;
    onChange(addKeywordsToRule(value, draft));
    setDraft("");
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4" data-testid={`operational-${kind}-filter`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{kind === "whitelist" ? "Keep articles matching these terms." : "Reject articles matching these terms."}</div>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} data-testid={`switch-operational-${kind}`} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`operational-${kind}-keywords`}>Keywords</Label>
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
          {value.keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="max-w-full gap-1 pr-1 font-normal" dir="auto">
              <span className="max-w-48 truncate">{keyword}</span>
              <button
                type="button"
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => onChange({ ...value, keywords: value.keywords.filter((item) => item !== keyword) })}
                aria-label={`Remove ${keyword}`}
              >
                <XCircle className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            id={`operational-${kind}-keywords`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={addDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addDraft();
              }
            }}
            maxLength={OPERATIONAL_SETTINGS_LIMITS.keywordMaxLength}
            placeholder={value.keywords.length ? "Add keyword" : "Iraq, بغداد, هەولێر"}
            className="h-6 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
            dir="auto"
            data-testid={`input-operational-${kind}-keywords`}
          />
        </div>
        <div className="text-xs text-muted-foreground">{value.keywords.length}/{OPERATIONAL_SETTINGS_LIMITS.keywordMaxCount} keywords</div>
      </div>
      <div className="space-y-2">
        <Label>Apply to</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS.map((field) => (
            <label key={field} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={value.fields.includes(field)}
                onCheckedChange={(checked) => onChange(updateRuleField(value, field, checked === true))}
                data-testid={`checkbox-operational-${kind}-${field}`}
              />
              {FIELD_LABELS[field]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewResults({ preview }: { preview: NormalizedOperationalPreview }) {
  const quality = preview.quality;
  const sampleThresholdLabel = quality.minimumSampleCount > 0 ? `${quality.minimumSampleCount}+` : "configured";
  const relevanceThresholdLabel = quality.minimumDirectMatchRate > 0 ? `${quality.minimumDirectMatchRate}%` : "configured";
  const noiseThresholdLabel = quality.maximumNoiseRate > 0 ? `${quality.maximumNoiseRate}%` : "configured";
  return (
    <div className="space-y-4" data-testid="operational-preview-results">
      <div className="flex flex-wrap gap-2">
        <StateBadge label={preview.inspection.success ? "Technically valid" : "Technical failure"} state={preview.inspection.success ? "pass" : "fail"} />
        <StateBadge label={quality.passesMinimumSample ? `Minimum sample ${sampleThresholdLabel} ok` : `Below sample ${sampleThresholdLabel}`} state={quality.passesMinimumSample ? "pass" : "warn"} />
        <StateBadge label={quality.passesRelevance ? `Relevance ${relevanceThresholdLabel} ok` : `Below relevance ${relevanceThresholdLabel}`} state={quality.passesRelevance ? "pass" : "warn"} />
        <StateBadge label={quality.passesNoise ? `Noise <= ${noiseThresholdLabel}` : `Noise > ${noiseThresholdLabel}`} state={quality.passesNoise ? "pass" : "warn"} />
        <StateBadge label={preview.productionCandidate ? "Production candidate" : `Not production-ready: ${labelize(quality.outcomeReason)}`} state={preview.productionCandidate ? "pass" : "warn"} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Success" value={preview.inspection.success} />
        <Metric label="Collector type" value={preview.inspection.collectorType} />
        <Metric label="Structure" value={preview.inspection.structure} />
        <Metric label="HTTP status" value={preview.inspection.statusCode} />
        <Metric label="Requested URL" value={preview.inspection.requestedUrl} />
        <Metric label="Final URL" value={preview.inspection.finalUrl} />
        <Metric label="Bytes read" value={preview.inspection.bytesRead} />
        <Metric label="Declared content length" value={preview.inspection.declaredContentLength} />
        <Metric label="Response" value={preview.inspection.responseTruncated ? "truncated" : "complete"} />
        <Metric label="Raw items" value={preview.inspection.rawItemCount} />
        <Metric label="Accepted items" value={preview.inspection.acceptedItemCount} />
        <Metric label="Filtered-out items" value={preview.inspection.filteredOutCount} />
      </div>

      {(preview.inspection.warnings.length > 0 || preview.inspection.errorCode) && (
        <Alert variant={preview.inspection.success ? "default" : "destructive"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{preview.inspection.errorCode || "Warnings"}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-1">
              {preview.inspection.errorMessage && <Badge variant="outline">{truncate(preview.inspection.errorMessage, 160)}</Badge>}
              {preview.inspection.warnings.map((warning) => <Badge key={warning} variant="outline">{truncate(warning, 80)}</Badge>)}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Sample count" value={preview.relevanceCounts.sampleCount} />
        <Metric label="Direct matches" value={preview.relevanceCounts.directScopeMatchCount} />
        <Metric label="Material impact" value={preview.relevanceCounts.materialScopeImpactCount} />
        <Metric label="Contextual" value={preview.relevanceCounts.contextualCount} />
        <Metric label="Not relevant" value={preview.relevanceCounts.notRelevantCount} />
        <Metric label="Needs review" value={preview.relevanceCounts.needsReviewCount} />
        <Metric label="Direct-match rate" value={`${preview.directMatchRate}%`} />
        <Metric label="Relevant rate" value={`${preview.relevantRate}%`} />
        <Metric label="Noise rate" value={`${preview.noiseRate}%`} />
        <Metric label="Minimum sample" value={quality.minimumSampleCount} />
        <Metric label="Minimum relevance" value={`${quality.minimumDirectMatchRate}%`} />
        <Metric label="Maximum noise" value={`${quality.maximumNoiseRate}%`} />
        <Metric label="Preview expires" value={preview.previewExpiresAt || "missing"} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Safe samples</div>
        {preview.safeSamples.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No safe samples returned.</div>
        ) : (
          <div className="space-y-2">
            {preview.safeSamples.map((sample, index) => (
              <div key={`${sample.normalizedUrl || sample.headline}-${index}`} className="rounded-md border border-border p-3 text-sm" data-testid="operational-preview-safe-sample">
                <div className="font-medium" dir="auto">{truncate(sample.headline, 180)}</div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  <Badge variant="outline">{labelize(sample.relevanceClassification)}</Badge>
                  <Badge variant="outline">{sample.language || "und"}</Badge>
                  <Badge variant="outline">{sample.publicationTime || "no time"}</Badge>
                </div>
                {sample.normalizedUrl && (
                  <a className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs text-primary hover:underline" href={sample.normalizedUrl} target="_blank" rel="noreferrer noopener">
                    {truncate(sample.normalizedUrl, 180)}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
                {sample.matchedSignals.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sample.matchedSignals.map((signal) => <Badge key={signal} variant="secondary">{truncate(signal, 80)}</Badge>)}
                  </div>
                )}
                {sample.rejectionReason && <div className="mt-2 text-xs text-muted-foreground">{truncate(sample.rejectionReason, 180)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OperationalSourceSettingsDialog({
  clientId,
  workspaceId,
  assignment,
  open,
  onOpenChange,
  sourceAssignmentsQueryKey,
}: {
  clientId: number;
  workspaceId: number;
  assignment: AssignmentLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceAssignmentsQueryKey: string;
}) {
  const { toast } = useToast();
  const sourceId = Number(assignment?.source?.id || assignment?.sourceId || 0);
  const settingsPath = `/api/admin/clients/${clientId}/workspaces/${workspaceId}/sources/${sourceId}/settings`;
  const [formSettings, setFormSettings] = useState<OperationalSourceSettings>(DEFAULT_OPERATIONAL_SETTINGS);
  const [loadedSnapshot, setLoadedSnapshot] = useState<string | null>(null);
  const [preview, setPreview] = useState<NormalizedOperationalPreview | null>(null);
  const [previewSettingsSnapshot, setPreviewSettingsSnapshot] = useState<string | null>(null);
  const [previewSettingsForSave, setPreviewSettingsForSave] = useState<OperationalSourceSettings | null>(null);
  const [acknowledgeQuality, setAcknowledgeQuality] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const settingsQuery = useQuery<OperationalSettingsReadResponse>({
    queryKey: [settingsPath],
    enabled: open && Number.isInteger(sourceId) && sourceId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", settingsPath);
      return res.json();
    },
  });

  const normalizedRead = useMemo(() => normalizeOperationalSettingsRead(settingsQuery.data), [settingsQuery.data]);
  const currentSettings = useMemo(() => settingsFromForm(formSettings), [formSettings]);
  const dirty = loadedSnapshot ? settingsSnapshot(currentSettings) !== loadedSnapshot : false;
  const canSave = canSaveOperationalSettings({
    dirty,
    updateAllowed: normalizedRead.updateAllowed.allowed,
    identityError: normalizedRead.identityError,
    preview,
    currentSettings,
    previewSettingsSnapshot,
    acknowledgement: acknowledgeQuality,
    previewing: false,
    saving: false,
  });

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewSettingsSnapshot(null);
      setPreviewSettingsForSave(null);
      setAcknowledgeQuality(false);
      setLocalError(null);
      setConfirmOpen(false);
      return;
    }
    if (settingsQuery.data) {
      const next = normalizeOperationalSettingsRead(settingsQuery.data).settings;
      setFormSettings(next);
      setLoadedSnapshot(settingsSnapshot(next));
      setPreview(null);
      setPreviewSettingsSnapshot(null);
      setPreviewSettingsForSave(null);
      setAcknowledgeQuality(false);
      setLocalError(null);
    }
  }, [open, settingsQuery.data]);

  const setSettings = (updater: (current: OperationalSourceSettings) => OperationalSourceSettings) => {
    setFormSettings((current) => settingsFromForm(updater(current)));
    setPreview(null);
    setPreviewSettingsSnapshot(null);
    setPreviewSettingsForSave(null);
    setAcknowledgeQuality(false);
    setLocalError(null);
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const settings = settingsFromForm(formSettings);
      const res = await apiRequest("POST", `${settingsPath}/preview`, { settings });
      return { raw: await res.json(), settings };
    },
    onSuccess: ({ raw, settings }) => {
      const normalizedPreview = normalizeOperationalPreview(raw);
      setPreview(normalizedPreview);
      setPreviewSettingsSnapshot(settingsSnapshot(settings));
      setPreviewSettingsForSave(settings);
      setAcknowledgeQuality(false);
      setLocalError(null);
      toast({ title: "Preview ready", description: "No articles, logs, tests, jobs, or source changes were created." });
    },
    onError: (error) => {
      const parsed = parseError(error);
      setPreview(null);
      setPreviewSettingsSnapshot(null);
      setPreviewSettingsForSave(null);
      setLocalError(parsed.message);
      toast({ variant: "destructive", title: "Preview failed", description: parsed.message });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!preview?.previewFingerprint || !preview.previewExpiresAt || !previewSettingsForSave) throw new Error("Preview again before saving.");
      const res = await apiRequest("PATCH", settingsPath, {
        previewFingerprint: preview.previewFingerprint,
        previewExpiresAt: preview.previewExpiresAt,
        settings: previewSettingsForSave,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [settingsPath] });
      queryClient.invalidateQueries({ queryKey: [sourceAssignmentsQueryKey] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/workspaces/${workspaceId}/source-assignments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/setup`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/source-summaries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/workspaces/${workspaceId}/sources`] });
      toast({ title: "Operational settings saved", description: "Assignments are stale and disabled. No ingestion or activation started." });
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (error) => {
      const parsed = parseError(error);
      if (parsed.code === "operational_source_settings_preview_expired") {
        const message = "The source settings preview expired. Run Preview again before saving.";
        setPreviewSettingsSnapshot(null);
        setPreviewSettingsForSave(null);
        setLocalError(message);
        toast({ variant: "destructive", title: "Preview expired", description: message });
        return;
      }
      if (parsed.code === "stale_operational_source_settings_preview") {
        const message = "The source, assignment, channel, profile, or settings changed after preview. Run Preview again before saving.";
        setPreviewSettingsSnapshot(null);
        setPreviewSettingsForSave(null);
        setLocalError(message);
        toast({ variant: "destructive", title: "Preview is stale", description: message });
        return;
      }
      setLocalError(parsed.message);
      toast({ variant: "destructive", title: "Save failed", description: parsed.message });
    },
  });

  const effectiveCanSave = canSaveOperationalSettings({
    dirty,
    updateAllowed: normalizedRead.updateAllowed.allowed,
    identityError: normalizedRead.identityError,
    preview,
    currentSettings,
    previewSettingsSnapshot,
    acknowledgement: acknowledgeQuality,
    previewing: previewMutation.isPending,
    saving: saveMutation.isPending,
  });
  const previewMissingSinceEdit = dirty && !preview?.previewFingerprint;
  const qualityNeedsAck = Boolean(preview?.inspection.success && preview.previewFingerprint && !preview.productionCandidate);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-6xl gap-0 p-0" data-testid="dialog-operational-source-settings">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Operational Settings
            </DialogTitle>
            <DialogDescription>Preview extraction and relevance before saving source collection settings.</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(92vh-150px)]">
            <div className="space-y-5 px-6 py-5">
              {settingsQuery.isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : settingsQuery.error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Settings unavailable</AlertTitle>
                  <AlertDescription>{parseError(settingsQuery.error).message}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-4" data-testid="operational-settings-context">
                    <Metric label="Source" value={normalizedRead.source ? `${normalizedRead.source.name} #${normalizedRead.source.id}` : "missing"} />
                    <Metric label="Publisher" value={normalizedRead.publisher.name} />
                    <Metric label="Channel" value={`${normalizedRead.channel.name} / ${labelize(normalizedRead.channel.channelType)}`} />
                    <Metric label="Profile version" value={normalizedRead.relevanceProfileVersion} />
                    <Metric label="Source status" value={normalizedRead.currentState.sourceActive ? "active" : "inactive"} />
                    <Metric label="Assignment status" value={normalizedRead.assignment.status} />
                    <Metric label="Assignment test" value={normalizedRead.assignment.testStatus} />
                    <Metric label="Updating allowed" value={normalizedRead.updateAllowed.allowed ? "yes" : "no"} />
                  </div>

                  {normalizedRead.identityError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Missing identity</AlertTitle>
                      <AlertDescription>{normalizedRead.identityError}</AlertDescription>
                    </Alert>
                  )}

                  {!normalizedRead.updateAllowed.allowed && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Update currently blocked</AlertTitle>
                      <AlertDescription>
                        <div className="flex flex-wrap gap-1">
                          {normalizedRead.updateAllowed.reasons.length === 0 ? <Badge variant="outline">backend_not_allowed</Badge> : normalizedRead.updateAllowed.reasons.map((reason) => <Badge key={reason} variant="outline">{reason}</Badge>)}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {localError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Action required</AlertTitle>
                      <AlertDescription>{localError}</AlertDescription>
                    </Alert>
                  )}

                  <section className="space-y-3 rounded-md border border-border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Source URL</h3>
                      <p className="text-xs text-muted-foreground">This can be the publisher home page, a targeted category page, or a supported feed URL.</p>
                    </div>
                    <Input
                      type="url"
                      required
                      maxLength={OPERATIONAL_SETTINGS_LIMITS.urlMaxLength}
                      value={formSettings.url}
                      onChange={(event) => setSettings((current) => ({ ...current, url: event.target.value }))}
                      placeholder="https://publisher.example/news"
                      data-testid="input-operational-source-url"
                    />
                  </section>

                  <section className="space-y-4 rounded-md border border-border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Collection strategy</h3>
                      <p className="text-xs text-muted-foreground">Auto can discover feeds. RSS uses a feed. Scrape uses website selectors.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Strategy</Label>
                        <Select
                          value={formSettings.collectorConfig.strategy}
                          onValueChange={(strategy: OperationalSourceSettings["collectorConfig"]["strategy"]) => setSettings((current) => updateCollector(current, { strategy }))}
                        >
                          <SelectTrigger data-testid="select-operational-collector-strategy"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES.map((strategy) => (
                              <SelectItem key={strategy} value={strategy}>{labelize(strategy)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="operational-feed-url">Optional feed URL</Label>
                        <Input
                          id="operational-feed-url"
                          type="url"
                          maxLength={OPERATIONAL_SETTINGS_LIMITS.urlMaxLength}
                          value={formSettings.collectorConfig.feedUrl || ""}
                          onChange={(event) => setSettings((current) => updateCollector(current, { feedUrl: event.target.value || undefined }))}
                          placeholder="https://publisher.example/rss.xml"
                          data-testid="input-operational-feed-url"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                      <div>
                        <div className="text-sm font-medium">Render JavaScript</div>
                        <div className="text-xs text-muted-foreground">Unsupported in the current collector and always off.</div>
                      </div>
                      <Switch checked={false} disabled data-testid="switch-operational-render-javascript" />
                    </div>
                  </section>

                  <section className="space-y-4 rounded-md border border-border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Website selectors</h3>
                      <p className="text-xs text-muted-foreground">Item scopes each story card. Link locates the article URL. Title locates the headline. Other fields are optional.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {SELECTOR_FIELDS.map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={`operational-selector-${field.key}`}>{field.label}</Label>
                          <Input
                            id={`operational-selector-${field.key}`}
                            value={formSettings.collectorConfig.selectors?.[field.key] || ""}
                            onChange={(event) => setSettings((current) => updateSelector(current, field.key, event.target.value))}
                            maxLength={OPERATIONAL_SETTINGS_LIMITS.selectorMaxLength}
                            placeholder={field.key === "item" ? "article.card" : ""}
                            data-testid={`input-operational-selector-${field.key}`}
                          />
                          <div className="text-xs text-muted-foreground">{field.help}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <KeywordRuleEditor
                      kind="whitelist"
                      value={formSettings.filterConfig.whitelist}
                      onChange={(whitelist) => setSettings((current) => ({ ...current, filterConfig: { ...current.filterConfig, whitelist } }))}
                    />
                    <KeywordRuleEditor
                      kind="blacklist"
                      value={formSettings.filterConfig.blacklist}
                      onChange={(blacklist) => setSettings((current) => ({ ...current, filterConfig: { ...current.filterConfig, blacklist } }))}
                    />
                  </div>

                  <section className="space-y-4 rounded-md border border-border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Scheduling and retention</h3>
                      <p className="text-xs text-muted-foreground">These limits match the backend settings contract.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <NumberField label="Interval minutes" value={formSettings.intervalMinutes} min={OPERATIONAL_SETTINGS_LIMITS.intervalMinutes.min} max={OPERATIONAL_SETTINGS_LIMITS.intervalMinutes.max} testId="input-operational-interval" onChange={(intervalMinutes) => setSettings((current) => ({ ...current, intervalMinutes }))} />
                      <NumberField label="Max articles" value={formSettings.maxArticlesPerFetch} min={OPERATIONAL_SETTINGS_LIMITS.maxArticlesPerFetch.min} max={OPERATIONAL_SETTINGS_LIMITS.maxArticlesPerFetch.max} testId="input-operational-max-articles" onChange={(maxArticlesPerFetch) => setSettings((current) => ({ ...current, maxArticlesPerFetch }))} />
                      <NumberField label="Retention days" value={formSettings.retentionDays} min={OPERATIONAL_SETTINGS_LIMITS.retentionDays.min} max={OPERATIONAL_SETTINGS_LIMITS.retentionDays.max} testId="input-operational-retention" onChange={(retentionDays) => setSettings((current) => ({ ...current, retentionDays }))} />
                      <div className="space-y-2">
                        <Label>Refresh priority</Label>
                        <Select value={formSettings.refreshPriority} onValueChange={(refreshPriority: OperationalSourceSettings["refreshPriority"]) => setSettings((current) => ({ ...current, refreshPriority }))}>
                          <SelectTrigger data-testid="select-operational-refresh-priority"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-md border border-border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Preview and save</h3>
                        <p className="text-xs text-muted-foreground">Preview must match the current form before Save is enabled.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => previewMutation.mutate()} disabled={!dirty || previewMutation.isPending || saveMutation.isPending || Boolean(normalizedRead.identityError)} data-testid="button-preview-operational-settings">
                          {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Preview extraction
                        </Button>
                        <Button variant="secondary" disabled={!effectiveCanSave} onClick={() => setConfirmOpen(true)} data-testid="button-save-operational-settings">
                          Save settings
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge variant={dirty ? "secondary" : "outline"}>{dirty ? "dirty" : "no changes"}</Badge>
                      <Badge variant={previewMissingSinceEdit ? "secondary" : "outline"}>{previewMissingSinceEdit ? "preview required" : "preview current"}</Badge>
                      <Badge variant={preview?.previewFingerprint ? "default" : "outline"}>{preview?.previewFingerprint ? `fingerprint ${preview.previewFingerprint.slice(0, 12)}` : "no fingerprint"}</Badge>
                    </div>

                    {preview && (
                      <div className="space-y-3">
                        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
                          Saving will update operational collection settings, mark linked assignment tests stale, keep assignments disabled, keep sources inactive, and require new connectivity/full testing.
                          <div className="mt-2 flex flex-wrap gap-1">
                            {preview.changedFields.length === 0 ? <Badge variant="outline">no changed fields</Badge> : preview.changedFields.map((field) => <Badge key={field} variant="outline">{field}</Badge>)}
                            {preview.expectedImpact.affectedAssignmentIds.map((id) => <Badge key={id} variant="outline">assignment #{id}</Badge>)}
                          </div>
                        </div>
                        {qualityNeedsAck && (
                          <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm" data-testid="operational-quality-acknowledgement">
                            <Checkbox checked={acknowledgeQuality} onCheckedChange={(checked) => setAcknowledgeQuality(checked === true)} />
                            <span>I understand this preview does not currently meet all content-quality thresholds.</span>
                          </label>
                        )}
                        <PreviewResults preview={preview} />
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-confirm-operational-save">
          <AlertDialogHeader>
            <AlertDialogTitle>Save operational source settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Linked assignment tests will become stale, assignments will remain disabled, sources will remain inactive, and no ingestion starts automatically. The source must be retested afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-1 text-sm">
            {(preview?.changedFields || []).map((field) => <Badge key={field} variant="outline">{field}</Badge>)}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveMutation.mutate()} disabled={!effectiveCanSave || saveMutation.isPending} data-testid="button-confirm-save-operational-settings">
              {saveMutation.isPending ? "Saving..." : "Save settings"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        data-testid={testId}
      />
      <div className="text-xs text-muted-foreground">{min}-{max}</div>
    </div>
  );
}
