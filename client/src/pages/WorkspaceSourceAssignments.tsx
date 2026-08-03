import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, FlaskConical, Loader2, PlayCircle, Plus, RadioTower, Settings2, ShieldCheck } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { OperationalSourceSettingsDialog } from "@/components/sources/OperationalSourceSettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES, WORKSPACE_SOURCE_ROLES } from "@shared/workspace-source-assignments";
import {
  normalizeWorkspaceSourceAssignmentResponse,
  type WorkspaceSourceAssignmentResponseDto,
} from "@shared/workspace-source-assignment-response";

function labelize(value: string | null | undefined) {
  return String(value || "").replace(/_/g, " ");
}

export default function WorkspaceSourceAssignments() {
  const [, params] = useRoute("/admin/clients/:clientId/workspaces/:workspaceId/sources");
  const clientId = Number(params?.clientId);
  const workspaceId = Number(params?.workspaceId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin, isPlatformScope } = usePermissions();
  const [form, setForm] = useState({
    publisherChannelId: "",
    existingSourceId: "auto",
    sourceUrl: "",
    priority: "standard",
    sourceRole: "primary",
    minimumDirectMatchRate: "0.5",
    maximumNoiseRate: "0.4",
    notes: "",
  });
  const [preview, setPreview] = useState<any>(null);
  const [settingsAssignment, setSettingsAssignment] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const basePath = `/api/admin/clients/${clientId}/workspaces/${workspaceId}/source-assignments`;
  const { data: rawData, isLoading } = useQuery<WorkspaceSourceAssignmentResponseDto>({
    queryKey: [basePath],
    enabled: Number.isInteger(clientId) && clientId > 0 && Number.isInteger(workspaceId) && workspaceId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", basePath);
      return res.json();
    },
  });
  const data = useMemo(() => normalizeWorkspaceSourceAssignmentResponse(rawData), [rawData]);
  const canOpenOperationalSettings = isAdmin && isPlatformScope;

  const eligibleChannels = useMemo(() => {
    return data.approvedPublishers.flatMap((item) =>
      item.channels.map((channel) => ({
        selection: item.selection,
        publisher: item.publisher,
        channel,
      })),
    );
  }, [data]);

  const selectedChannel = useMemo(() => {
    const channelId = Number(form.publisherChannelId);
    return eligibleChannels.find((item) => item.channel.id === channelId) || null;
  }, [eligibleChannels, form.publisherChannelId]);

  const payload = () => ({
    publisherChannelId: Number(form.publisherChannelId),
    existingSourceId: form.existingSourceId === "auto" ? null : Number(form.existingSourceId),
    source: {
      url: form.sourceUrl || null,
      reuseExisting: form.existingSourceId === "auto",
    },
    priority: form.priority,
    sourceRole: form.sourceRole,
    minimumDirectMatchRate: Number(form.minimumDirectMatchRate),
    maximumNoiseRate: Number(form.maximumNoiseRate),
    notes: form.notes || null,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${basePath}/preview`, payload());
      return res.json();
    },
    onSuccess: (result) => {
      setPreview(result);
      toast({ title: "Preview ready", description: "No source, assignment, article, or job was created." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Preview failed", description: error instanceof Error ? error.message : "Check the channel and source configuration." });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", basePath, payload());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [basePath] });
      setPreview(null);
      toast({ title: "Draft assignment created", description: "The source remains inactive until testing and activation." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Create failed", description: error instanceof Error ? error.message : "The assignment was not created." });
    },
  });

  const runTest = useMutation({
    mutationFn: async ({ assignmentId, type }: { assignmentId: number; type: "test-connectivity" | "test-relevance" | "test-full" }) => {
      const res = await apiRequest("POST", `${basePath}/${assignmentId}/${type}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [basePath] });
      toast({ title: "Test recorded", description: "No articles, appearances, rejected items, or jobs were created by the test." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Test failed", description: error instanceof Error ? error.message : "The test did not complete." });
    },
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!rawData) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Workspace source setup is unavailable.</CardContent></Card>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/admin/clients/${clientId}/setup`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <RadioTower className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Workspace Sources</h1>
              <Badge variant="outline">{data.workspace.name}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Publisher channels, operational sources, and workspace assignment testing stay separate.</p>
          </div>
        </div>
        <Badge variant={data.workspace.active ? "default" : "secondary"}>{data.workspace.status}</Badge>
      </div>

      {data.skippedMalformedPublisherCount > 0 && (
        <Card className="border-amber-300/70 bg-amber-50 text-amber-950">
          <CardContent className="py-3 text-sm">
            {data.skippedMalformedPublisherCount} malformed publisher {data.skippedMalformedPublisherCount === 1 ? "entry was" : "entries were"} skipped. Invalid records are not eligible for source assignment.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Create Assignment</CardTitle>
              <CardDescription>Preview first. Creating a draft does not activate ingestion.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Publisher channel</Label>
                <Select value={form.publisherChannelId} onValueChange={(publisherChannelId) => setForm((current) => ({ ...current, publisherChannelId }))}>
                  <SelectTrigger><SelectValue placeholder="Choose an approved channel" /></SelectTrigger>
                  <SelectContent>
                    {eligibleChannels.length === 0 ? (
                      <SelectItem value="none" disabled>No eligible channels</SelectItem>
                    ) : eligibleChannels.map((item) => (
                      <SelectItem key={item.channel.id} value={String(item.channel.id)}>
                        {item.publisher.name} / {labelize(item.channel.channelType)} / {item.channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Existing source</Label>
                <Select value={form.existingSourceId} onValueChange={(value) => setForm((current) => ({ ...current, existingSourceId: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto reuse or provision</SelectItem>
                    {data.operationalSources.map((source) => (
                      <SelectItem key={source.id} value={String(source.id)}>{source.name} ({source.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Operational source URL or RSS.app feed</Label>
                <Input value={form.sourceUrl} onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="Used only when a compatible source is not already available" />
              </div>
              <SelectField label="Priority" value={form.priority} values={WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES} onChange={(priority) => setForm((current) => ({ ...current, priority }))} />
              <SelectField label="Source role" value={form.sourceRole} values={WORKSPACE_SOURCE_ROLES} onChange={(sourceRole) => setForm((current) => ({ ...current, sourceRole }))} />
              <TextField label="Minimum relevance rate" value={form.minimumDirectMatchRate} onChange={(minimumDirectMatchRate) => setForm((current) => ({ ...current, minimumDirectMatchRate }))} />
              <TextField label="Maximum noise rate" value={form.maximumNoiseRate} onChange={(maximumNoiseRate) => setForm((current) => ({ ...current, maximumNoiseRate }))} />
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button onClick={() => previewMutation.mutate()} disabled={!form.publisherChannelId || previewMutation.isPending}>
                  {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Preview
                </Button>
                <Button variant="secondary" onClick={() => createMutation.mutate()} disabled={!preview || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Draft
                </Button>
              </div>
              {selectedChannel && (
                <div className="flex flex-wrap gap-1 text-xs text-muted-foreground md:col-span-2">
                  <Badge variant="outline">{selectedChannel.publisher.name}</Badge>
                  <Badge variant="outline">{labelize(selectedChannel.channel.channelType)}</Badge>
                  <Badge variant="outline">{selectedChannel.channel.verificationStatus || "unverified"}</Badge>
                  <Badge variant="outline">{selectedChannel.channel.validationStatus || "not_validated"}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>Preview Result</CardTitle>
                <CardDescription>writes:false, no article persistence and no job creation.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <Metric label="Writes" value={String(preview.writes)} />
                <Metric label="Provisionable" value={String(preview.provisionability?.provisionable)} />
                <Metric label="Create source" value={String(preview.creationPlan?.createSource)} />
                <Metric label="Duplicate" value={preview.duplicateAssignmentWarning || "none"} />
                <div className="md:col-span-4">
                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Warnings</div>
                  <div className="flex flex-wrap gap-1">
                    {(preview.validationWarnings || []).length === 0 ? <Badge variant="outline">none</Badge> : preview.validationWarnings.map((warning: string) => <Badge key={warning} variant="outline">{warning}</Badge>)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Assigned Sources</CardTitle>
              <CardDescription>Ready remains disabled. Active requires current tests plus active client and workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.assignments.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No workspace source assignments yet.</div>
              ) : data.assignments.map((assignment: any) => {
                const latestTest = assignment.latestTest || null;
                const connectivity = latestTest?.connectivityResult || {};
                const safeSamples = Array.isArray(latestTest?.safeSampleResults) ? latestTest.safeSampleResults : [];
                const sourceId = Number(assignment.source?.id || assignment.sourceId || 0);
                const assignmentChannelId = Number(assignment.publisherChannelId || 0);
                const sourceChannelId = Number(assignment.source?.publisherChannelId || 0);
                const sourceLinkedToAssignment = Boolean(
                  sourceId > 0 &&
                  assignment.source &&
                  (!assignmentChannelId || !sourceChannelId || assignmentChannelId === sourceChannelId),
                );
                const showOperationalSettings = canOpenOperationalSettings && sourceLinkedToAssignment;
                return (
                <div key={assignment.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{assignment.source?.name || `Source #${assignment.sourceId}`}</h3>
                        <Badge variant="outline">{assignment.status}</Badge>
                        <Badge variant={assignment.testStatus === "passed" ? "default" : "secondary"}>{assignment.testStatus}</Badge>
                        <Badge variant={assignment.enabled ? "default" : "secondary"}>{assignment.enabled ? "enabled" : "disabled"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{assignment.publisher?.name || "Unknown publisher"} / {labelize(assignment.channel?.channelType)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {showOperationalSettings && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSettingsAssignment(assignment);
                            setSettingsOpen(true);
                          }}
                          data-testid={`button-operational-settings-${assignment.id}`}
                        >
                          <Settings2 className="mr-2 h-4 w-4" />
                          Operational Settings
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => runTest.mutate({ assignmentId: assignment.id, type: "test-connectivity" })}>
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Connectivity
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => runTest.mutate({ assignmentId: assignment.id, type: "test-relevance" })}>
                        <FlaskConical className="mr-2 h-4 w-4" />
                        Relevance
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => runTest.mutate({ assignmentId: assignment.id, type: "test-full" })}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Full
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                    <Metric label="Priority" value={assignment.priority} />
                    <Metric label="Role" value={labelize(assignment.sourceRole)} />
                    <Metric label="Profile version" value={assignment.relevanceProfileVersion} />
                    <Metric label="Latest test" value={assignment.latestTestRunId || "none"} />
                  </div>
                  {latestTest && (
                    <div className="mt-4 rounded-md border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{latestTest.testType}</Badge>
                        <Badge variant={latestTest.status === "passed" ? "default" : latestTest.status === "failed" ? "destructive" : "secondary"}>{latestTest.status}</Badge>
                        <Badge variant="outline">sample {latestTest.sampleCount}</Badge>
                        <Badge variant="outline">profile v{latestTest.relevanceProfileVersion}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
                        <Metric label="Actual source" value={connectivity.finalUrl || connectivity.requestedUrl || assignment.source?.url || "unknown"} />
                        <Metric label="Collector" value={connectivity.collectorType || "unknown"} />
                        <Metric label="HTTP" value={connectivity.statusCode ?? "n/a"} />
                        <Metric label="Identity" value={(latestTest.sourceValidationIdentity || assignment.sourceValidationIdentity || "missing").slice(0, 12)} />
                        <Metric label="Direct" value={latestTest.directScopeMatchCount ?? 0} />
                        <Metric label="Contextual" value={latestTest.contextualCount ?? 0} />
                        <Metric label="Rejected" value={latestTest.notRelevantCount ?? 0} />
                        <Metric label="Needs review" value={latestTest.needsReviewCount ?? 0} />
                      </div>
                      {safeSamples.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="text-xs font-medium uppercase text-muted-foreground">Sample headlines</div>
                          {safeSamples.slice(0, 4).map((sample: any, index: number) => (
                            <div key={`${latestTest.id}-${index}`} className="line-clamp-1 text-xs text-muted-foreground">
                              {sample.headline || sample.title || "Untitled"} · {labelize(sample.relevanceClassification)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Readiness</CardTitle>
              <CardDescription>Source assignment readiness is separate from activation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Metric label="Configured assignments" value={data.readiness.sourceAssignmentsConfigured} />
              <Metric label="Passed tests" value={data.readiness.sourceAssignmentTestsPassed} />
              <Metric label="Stale tests" value={data.readiness.sourceAssignmentTestsStale} />
              <Metric label="Blocked assignments" value={data.readiness.sourceAssignmentsBlocked} />
              <div className="flex flex-wrap gap-1">
                {data.readiness.blockers.map((blocker) => <Badge key={blocker} variant="outline">{blocker}</Badge>)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approved Publishers</CardTitle>
              <CardDescription>Only approved publishers can be assigned.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.approvedPublishers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No approved publishers yet.</div>
              ) : data.approvedPublishers.map((item) => (
                <div key={item.selection.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium">{item.publisher.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{item.selection.status}</Badge>
                    <Badge variant="outline">{item.channelCount} channels</Badge>
                    <Badge variant="outline">{item.sourceLinkCount} sources</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item.channels || []).slice(0, 8).map((channel) => (
                      <Badge key={channel.id} variant="secondary">{channel.id}: {labelize(channel.channelType)}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <OperationalSourceSettingsDialog
        clientId={clientId}
        workspaceId={workspaceId}
        assignment={settingsAssignment}
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsAssignment(null);
        }}
        sourceAssignmentsQueryKey={basePath}
      />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{String(value)}</div>
    </div>
  );
}
