import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Settings, SlidersHorizontal, UserPlus, XCircle } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORGANIZATION_TYPES } from "@shared/client-enrollment";
import { WORKSPACE_PURPOSES, WORKSPACE_SCOPE_MODES } from "@shared/workspace-relevance";

type ClientSetupData = {
  client: {
    id: number;
    name: string;
    slug?: string | null;
    organizationType: string;
    defaultLanguage?: string | null;
    active?: boolean | null;
    lifecycleStatus?: string | null;
  } | null;
  organizationProfile: {
    representedCountryCode?: string | null;
    hostCountryCode?: string | null;
    headquartersCountryCode?: string | null;
    defaultTimezone?: string | null;
    defaultLanguages?: string[] | null;
    websiteUrl?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
  } | null;
  workspaces: Array<{
    id: number;
    name: string;
    description?: string | null;
    purpose?: string | null;
    scopeMode?: string | null;
    primaryCountryCodes?: string[] | null;
    secondaryCountryCodes?: string[] | null;
    regionCodes?: string[] | null;
    subnationalAreas?: string[] | null;
    preferredLanguages?: string[] | null;
    timezone?: string | null;
    status?: string | null;
    active?: boolean | null;
    relevanceProfile?: unknown | null;
  }>;
  readiness: {
    organizationConfigured: boolean;
    workspaceCount: number;
    activeWorkspaceCount: number;
    relevanceProfilesConfigured: number;
    publisherProfilesConfigured: number;
    sourceChannelsConfigured: number;
    sourceAssignmentsConfigured: number;
    monitoringReady: boolean;
    blockers: string[];
  };
};

const defaultWorkspaceForm = {
  name: "",
  description: "",
  purpose: "custom",
  scopeMode: "single_country",
  primaryCountryCodes: "",
  secondaryCountryCodes: "",
  regionCodes: "",
  subnationalAreas: "",
  preferredLanguages: "en",
  timezone: "UTC",
  relevanceProfile: {
    topics: [] as string[],
    entities: [] as string[],
    inclusionTerms: [] as string[],
    exclusionTerms: [] as string[],
  },
};

function list(values?: string[] | null) {
  return (values || []).join(", ") || "Not set";
}

function parseList(value: string) {
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

function labelize(value: string | null | undefined) {
  return String(value || "custom").replace(/_/g, " ");
}

export default function ClientSetup() {
  const [, params] = useRoute("/admin/clients/:clientId/setup");
  const clientId = Number(params?.clientId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingOrg, setEditingOrg] = useState(false);
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null);
  const [orgForm, setOrgForm] = useState({
    name: "",
    slug: "",
    organizationType: "media",
    defaultLanguage: "en",
    representedCountryCode: "",
    hostCountryCode: "",
    headquartersCountryCode: "",
    defaultTimezone: "UTC",
    defaultLanguages: "en",
    websiteUrl: "",
    contactName: "",
    contactEmail: "",
  });
  const [workspaceForm, setWorkspaceForm] = useState({ ...defaultWorkspaceForm });

  const { data, isLoading } = useQuery<ClientSetupData>({
    queryKey: [`/api/admin/clients/${clientId}/setup`],
    enabled: Number.isInteger(clientId) && clientId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/clients/${clientId}/setup`);
      return res.json();
    },
  });

  useEffect(() => {
    if (!data?.client) return;
    setOrgForm({
      name: data.client.name || "",
      slug: data.client.slug || "",
      organizationType: data.client.organizationType || "media",
      defaultLanguage: data.client.defaultLanguage || "en",
      representedCountryCode: data.organizationProfile?.representedCountryCode || "",
      hostCountryCode: data.organizationProfile?.hostCountryCode || "",
      headquartersCountryCode: data.organizationProfile?.headquartersCountryCode || "",
      defaultTimezone: data.organizationProfile?.defaultTimezone || "UTC",
      defaultLanguages: (data.organizationProfile?.defaultLanguages || [data.client.defaultLanguage || "en"]).join(", "),
      websiteUrl: data.organizationProfile?.websiteUrl || "",
      contactName: data.organizationProfile?.contactName || "",
      contactEmail: data.organizationProfile?.contactEmail || "",
    });
  }, [data]);

  const saveOrg = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/clients/${clientId}/setup`, {
        name: orgForm.name,
        slug: orgForm.slug,
        organizationType: orgForm.organizationType,
        defaultLanguage: orgForm.defaultLanguage,
        representedCountryCode: orgForm.representedCountryCode || null,
        hostCountryCode: orgForm.hostCountryCode || null,
        headquartersCountryCode: orgForm.headquartersCountryCode || null,
        defaultTimezone: orgForm.defaultTimezone || null,
        defaultLanguages: parseList(orgForm.defaultLanguages),
        websiteUrl: orgForm.websiteUrl || null,
        contactName: orgForm.contactName || null,
        contactEmail: orgForm.contactEmail || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/setup`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setEditingOrg(false);
      toast({ title: "Organization saved" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Save failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  const resetWorkspaceForm = () => {
    setWorkspaceForm({ ...defaultWorkspaceForm, relevanceProfile: { ...defaultWorkspaceForm.relevanceProfile } });
    setEditingWorkspaceId(null);
    setShowWorkspaceForm(false);
  };

  const startAddWorkspace = () => {
    setWorkspaceForm({ ...defaultWorkspaceForm, relevanceProfile: { ...defaultWorkspaceForm.relevanceProfile } });
    setEditingWorkspaceId(null);
    setShowWorkspaceForm(true);
  };

  const startEditWorkspace = (workspace: ClientSetupData["workspaces"][number]) => {
    setWorkspaceForm({
      ...defaultWorkspaceForm,
      name: workspace.name || "",
      description: workspace.description || "",
      purpose: workspace.purpose || "custom",
      scopeMode: workspace.scopeMode || "single_country",
      primaryCountryCodes: (workspace.primaryCountryCodes || []).join(", "),
      secondaryCountryCodes: (workspace.secondaryCountryCodes || []).join(", "),
      regionCodes: (workspace.regionCodes || []).join(", "),
      subnationalAreas: (workspace.subnationalAreas || []).join(", "),
      preferredLanguages: (workspace.preferredLanguages || []).join(", ") || "en",
      timezone: workspace.timezone || "UTC",
      relevanceProfile: { ...defaultWorkspaceForm.relevanceProfile },
    });
    setEditingWorkspaceId(workspace.id);
    setShowWorkspaceForm(true);
  };

  const saveWorkspace = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: workspaceForm.name,
        description: workspaceForm.description || null,
        purpose: workspaceForm.purpose,
        scopeMode: workspaceForm.scopeMode,
        primaryCountryCodes: parseList(workspaceForm.primaryCountryCodes).map((item) => item.toUpperCase()),
        secondaryCountryCodes: parseList(workspaceForm.secondaryCountryCodes).map((item) => item.toUpperCase()),
        regionCodes: parseList(workspaceForm.regionCodes),
        subnationalAreas: parseList(workspaceForm.subnationalAreas),
        preferredLanguages: parseList(workspaceForm.preferredLanguages),
        timezone: workspaceForm.timezone || "UTC",
      };
      if (!editingWorkspaceId) payload.relevanceProfile = workspaceForm.relevanceProfile;
      const url = editingWorkspaceId
        ? `/api/admin/clients/${clientId}/workspaces/${editingWorkspaceId}`
        : `/api/admin/clients/${clientId}/workspaces`;
      const method = editingWorkspaceId ? "PATCH" : "POST";
      const res = await apiRequest(method, url, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/setup`] });
      resetWorkspaceForm();
      toast({ title: editingWorkspaceId ? "Workspace saved" : "Draft workspace created" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Workspace failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.client) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Client not found.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{data.client.name}</h1>
              <Badge variant={data.client.active ? "default" : "destructive"}>{data.client.lifecycleStatus || "setup"}</Badge>
              <Badge variant="outline">Monitoring inactive</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Client setup, draft workspaces, readiness, and next setup actions.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditingOrg((current) => !current)}>
            <Settings className="mr-2 h-4 w-4" />
            Edit Organization
          </Button>
          <Button variant="outline" onClick={startAddWorkspace}>
            <Plus className="mr-2 h-4 w-4" />
            Add Another Workspace
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>Organization profile is separate from workspace monitoring scope.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingOrg ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField label="Name" value={orgForm.name} onChange={(value) => setOrgForm((current) => ({ ...current, name: value }))} />
                  <TextField label="Slug" value={orgForm.slug} onChange={(value) => setOrgForm((current) => ({ ...current, slug: value }))} />
                  <div className="space-y-2">
                    <Label>Organization type</Label>
                    <Select value={orgForm.organizationType} onValueChange={(value) => setOrgForm((current) => ({ ...current, organizationType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORGANIZATION_TYPES.map((type) => <SelectItem key={type} value={type}>{labelize(type)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <TextField label="Default language" value={orgForm.defaultLanguage} onChange={(value) => setOrgForm((current) => ({ ...current, defaultLanguage: value }))} />
                  <TextField label="Default timezone" value={orgForm.defaultTimezone} onChange={(value) => setOrgForm((current) => ({ ...current, defaultTimezone: value }))} />
                  <TextField label="Represented country" value={orgForm.representedCountryCode} onChange={(value) => setOrgForm((current) => ({ ...current, representedCountryCode: value.toUpperCase() }))} />
                  <TextField label="Host country" value={orgForm.hostCountryCode} onChange={(value) => setOrgForm((current) => ({ ...current, hostCountryCode: value.toUpperCase() }))} />
                  <TextField label="Headquarters country" value={orgForm.headquartersCountryCode} onChange={(value) => setOrgForm((current) => ({ ...current, headquartersCountryCode: value.toUpperCase() }))} />
                  <TextField label="Preferred languages" value={orgForm.defaultLanguages} onChange={(value) => setOrgForm((current) => ({ ...current, defaultLanguages: value }))} />
                  <TextField label="Website" value={orgForm.websiteUrl} onChange={(value) => setOrgForm((current) => ({ ...current, websiteUrl: value }))} />
                  <TextField label="Contact name" value={orgForm.contactName} onChange={(value) => setOrgForm((current) => ({ ...current, contactName: value }))} />
                  <TextField label="Contact email" value={orgForm.contactEmail} onChange={(value) => setOrgForm((current) => ({ ...current, contactEmail: value }))} />
                  <div className="flex items-end gap-2">
                    <Button onClick={() => saveOrg.mutate()} disabled={saveOrg.isPending}>
                      {saveOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Organization
                    </Button>
                    <Button variant="outline" onClick={() => setEditingOrg(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <Info label="Type" value={labelize(data.client.organizationType)} />
                  <Info label="Slug" value={data.client.slug || "Not set"} />
                  <Info label="Default language" value={data.client.defaultLanguage || "en"} />
                  <Info label="Represented country" value={data.organizationProfile?.representedCountryCode || "Not set"} />
                  <Info label="Host country" value={data.organizationProfile?.hostCountryCode || "Not set"} />
                  <Info label="Headquarters country" value={data.organizationProfile?.headquartersCountryCode || "Not set"} />
                  <Info label="Timezone" value={data.organizationProfile?.defaultTimezone || "UTC"} />
                  <Info label="Languages" value={list(data.organizationProfile?.defaultLanguages)} />
                  <Info label="Contact" value={data.organizationProfile?.contactEmail || data.organizationProfile?.contactName || "Not set"} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Monitoring Workspaces</CardTitle>
                <CardDescription>Draft workspaces do not enqueue monitoring jobs.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={startAddWorkspace}>
                <Plus className="mr-2 h-4 w-4" />
                Add Workspace
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {showWorkspaceForm && (
                <div className="rounded-md border border-border p-4">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium">{editingWorkspaceId ? "Edit Workspace" : "Add Draft Workspace"}</h3>
                    <p className="text-xs text-muted-foreground">Saving a workspace does not activate monitoring.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Workspace name" value={workspaceForm.name} onChange={(value) => setWorkspaceForm((current) => ({ ...current, name: value }))} />
                    <TextField label="Timezone" value={workspaceForm.timezone} onChange={(value) => setWorkspaceForm((current) => ({ ...current, timezone: value }))} />
                    <div className="space-y-2">
                      <Label>Purpose</Label>
                      <Select value={workspaceForm.purpose} onValueChange={(value) => setWorkspaceForm((current) => ({ ...current, purpose: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{WORKSPACE_PURPOSES.map((purpose) => <SelectItem key={purpose} value={purpose}>{labelize(purpose)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Scope mode</Label>
                      <Select value={workspaceForm.scopeMode} onValueChange={(value) => setWorkspaceForm((current) => ({ ...current, scopeMode: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{WORKSPACE_SCOPE_MODES.map((mode) => <SelectItem key={mode} value={mode}>{labelize(mode)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <TextField label="Primary countries" value={workspaceForm.primaryCountryCodes} onChange={(value) => setWorkspaceForm((current) => ({ ...current, primaryCountryCodes: value }))} />
                    <TextField label="Regions" value={workspaceForm.regionCodes} onChange={(value) => setWorkspaceForm((current) => ({ ...current, regionCodes: value }))} />
                    <TextField label="Preferred languages" value={workspaceForm.preferredLanguages} onChange={(value) => setWorkspaceForm((current) => ({ ...current, preferredLanguages: value }))} />
                    <TextareaField label="Description" value={workspaceForm.description} onChange={(value) => setWorkspaceForm((current) => ({ ...current, description: value }))} />
                    <div className="flex gap-2 md:col-span-2">
                      <Button onClick={() => saveWorkspace.mutate()} disabled={saveWorkspace.isPending}>
                        {saveWorkspace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingWorkspaceId ? "Save Workspace" : "Create Draft Workspace"}
                      </Button>
                      <Button variant="outline" onClick={resetWorkspaceForm}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}

              {data.workspaces.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No monitoring workspaces have been created.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.workspaces.map((workspace) => (
                    <div key={workspace.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">{workspace.name}</h3>
                            <Badge variant="outline">{workspace.status || "draft"}</Badge>
                            <Badge variant={workspace.active ? "default" : "secondary"}>{workspace.active ? "active" : "inactive"}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{workspace.description || "No description"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setLocation(`/admin/clients/${clientId}/workspaces/${workspace.id}/relevance`)}>
                            <SlidersHorizontal className="mr-2 h-4 w-4" />
                            Configure Relevance Rules
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => startEditWorkspace(workspace)}>
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Workspace
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                        <Info label="Purpose" value={labelize(workspace.purpose)} />
                        <Info label="Scope" value={labelize(workspace.scopeMode)} />
                        <Info label="Countries" value={list(workspace.primaryCountryCodes)} />
                        <Info label="Languages" value={list(workspace.preferredLanguages)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Readiness Checklist</CardTitle>
              <CardDescription>Monitoring remains inactive until publisher and source setup exists.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ChecklistItem label="Organization configured" done={data.readiness.organizationConfigured} />
              <ChecklistItem label={`Workspaces created: ${data.readiness.workspaceCount}`} done={data.readiness.workspaceCount > 0} />
              <ChecklistItem label={`Relevance profiles: ${data.readiness.relevanceProfilesConfigured}`} done={data.readiness.relevanceProfilesConfigured > 0} />
              <ChecklistItem label="Publisher profiles configured" done={data.readiness.publisherProfilesConfigured > 0} />
              <ChecklistItem label="Source channels configured" done={data.readiness.sourceChannelsConfigured > 0} />
              <ChecklistItem label="Source assignments configured" done={data.readiness.sourceAssignmentsConfigured > 0} />
              <ChecklistItem label="Monitoring ready" done={data.readiness.monitoringReady} />
              {data.readiness.blockers.length > 0 && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Blockers</div>
                  <div className="flex flex-wrap gap-1">
                    {data.readiness.blockers.map((blocker) => <Badge key={blocker} variant="outline">{blocker}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next Actions</CardTitle>
              <CardDescription>Publisher setup prepares the catalog before workspace source assignment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="outline" onClick={() => setLocation("/users")}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
              <Button className="w-full justify-start" variant="secondary" onClick={() => setLocation(`/admin/clients/${clientId}/publishers`)}>
                Continue to Publisher Setup
              </Button>
              <p className="text-xs text-muted-foreground">
                Publisher selection does not create sources or activate monitoring.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <span className="text-sm">{label}</span>
      {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
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

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
