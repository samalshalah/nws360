import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, Loader2, Plus, Search } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CLIENT_PUBLISHER_SELECTION_PRIORITIES, CLIENT_PUBLISHER_SELECTION_STATUSES } from "@shared/publisher-catalog";

type Publisher = {
  id: number;
  name: string;
  organizationType: string;
  countryCode?: string | null;
  normalizedPrimaryDomain?: string | null;
  verificationStatus: string;
  status: string;
  scopeType: string;
  ownerClientId?: number | null;
  channelCount: number;
  sourceLinkCount: number;
};

type Selection = {
  id: number;
  publisherProfileId: number;
  status: string;
  priority: string;
  notes?: string | null;
  publisher: Publisher;
  channelCount: number;
  sourceLinkCount: number;
};

type ClientPublisherSetupData = {
  client: { id: number; name: string; lifecycleStatus?: string | null };
  selections: Selection[];
  candidates: Publisher[];
  readiness: {
    publisherProfilesConfigured: number;
    sourceChannelsConfigured: number;
    sourceAssignmentsConfigured: number;
  };
};

function labelize(value: string | null | undefined) {
  return String(value || "-").replace(/_/g, " ");
}

export default function ClientPublisherSetup() {
  const [, params] = useRoute("/admin/clients/:clientId/publishers");
  const clientId = Number(params?.clientId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectionDraft, setSelectionDraft] = useState({ status: "approved", priority: "standard", notes: "" });

  const setupQueryKey = [`/api/admin/clients/${clientId}/publishers`];
  const { data, isLoading } = useQuery<ClientPublisherSetupData>({
    queryKey: setupQueryKey,
    enabled: Number.isInteger(clientId) && clientId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/clients/${clientId}/publishers`);
      return res.json();
    },
  });

  const selectedIds = new Set((data?.selections || []).map((selection) => selection.publisherProfileId));
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.candidates || []).filter((publisher) => {
      if (selectedIds.has(publisher.id)) return false;
      if (!term) return true;
      return [
        publisher.name,
        publisher.normalizedPrimaryDomain,
        publisher.countryCode,
        publisher.organizationType,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [data?.candidates, search, selectedIds]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: setupQueryKey });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/clients/${clientId}/setup`] });
  };

  const selectPublisher = useMutation({
    mutationFn: async (publisherProfileId: number) => {
      const res = await apiRequest("POST", `/api/admin/clients/${clientId}/publishers`, {
        publisherProfileId,
        status: selectionDraft.status,
        priority: selectionDraft.priority,
        notes: selectionDraft.notes || null,
      });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Publisher selected" }); },
    onError: (error) => toast({ variant: "destructive", title: "Selection failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  const updateSelection = useMutation({
    mutationFn: async ({ selectionId, status, priority }: { selectionId: number; status?: string; priority?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/clients/${clientId}/publishers/${selectionId}`, { status, priority });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Selection updated" }); },
    onError: (error) => toast({ variant: "destructive", title: "Update failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data?.client) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Client not found.</CardContent></Card>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/admin/clients/${clientId}/setup`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.client.name} Publisher Setup</h1>
            <p className="mt-1 text-sm text-muted-foreground">Publisher selection does not activate monitoring or create operational sources.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLocation(`/admin/publishers/new?clientId=${clientId}`)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Client-Private Publisher
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Selected Publishers</CardTitle>
              <CardDescription>Approved publishers count toward readiness. Source assignments remain a later step.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.selections.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No publishers selected for this client.</div>
              ) : data.selections.map((selection) => (
                <div key={selection.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{selection.publisher.name}</h3>
                        <Badge variant={selection.status === "approved" ? "default" : "secondary"}>{selection.status}</Badge>
                        <Badge variant="outline">{selection.priority}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{selection.publisher.normalizedPrimaryDomain || selection.publisher.organizationType}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setLocation(`/admin/publishers/${selection.publisher.id}`)}>Open</Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Metric label="Channels" value={selection.channelCount} />
                    <Metric label="Source links" value={selection.sourceLinkCount} />
                    <Metric label="Country" value={selection.publisher.countryCode || "-"} />
                    <Metric label="Scope" value={selection.publisher.scopeType === "global" ? "global" : "private"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select value={selection.status} onValueChange={(status) => updateSelection.mutate({ selectionId: selection.id, status })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{CLIENT_PUBLISHER_SELECTION_STATUSES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selection.priority} onValueChange={(priority) => updateSelection.mutate({ selectionId: selection.id, priority })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{CLIENT_PUBLISHER_SELECTION_PRIORITIES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Catalog Candidates</CardTitle>
              <CardDescription>Global publishers and this client's private publishers are visible here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
                <div className="space-y-2">
                  <Label>Search catalog</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, country, type" />
                  </div>
                </div>
                <SelectField label="Default status" value={selectionDraft.status} values={CLIENT_PUBLISHER_SELECTION_STATUSES} onChange={(status) => setSelectionDraft((current) => ({ ...current, status }))} />
                <SelectField label="Default priority" value={selectionDraft.priority} values={CLIENT_PUBLISHER_SELECTION_PRIORITIES} onChange={(priority) => setSelectionDraft((current) => ({ ...current, priority }))} />
              </div>
              <div className="space-y-2">
                <Label>Selection notes</Label>
                <Textarea value={selectionDraft.notes} onChange={(event) => setSelectionDraft((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              {candidates.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No available candidates match the current filter.</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {candidates.map((publisher) => (
                    <div key={publisher.id} className="rounded-md border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <h3 className="font-medium">{publisher.name}</h3>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{publisher.normalizedPrimaryDomain || labelize(publisher.organizationType)}</p>
                        </div>
                        <Badge variant="outline">{publisher.scopeType === "global" ? "global" : "private"}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Badge variant="secondary">{publisher.channelCount} channels</Badge>
                        <Badge variant={publisher.verificationStatus === "verified" ? "default" : "outline"}>{publisher.verificationStatus}</Badge>
                        <Badge variant="outline">{publisher.countryCode || "-"}</Badge>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setLocation(`/admin/publishers/${publisher.id}`)}>Open</Button>
                        <Button size="sm" onClick={() => selectPublisher.mutate(publisher.id)} disabled={selectPublisher.isPending}>Select</Button>
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
              <CardTitle>Readiness</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Metric label="Approved publishers" value={data.readiness.publisherProfilesConfigured} />
              <Metric label="Active or verified channels" value={data.readiness.sourceChannelsConfigured} />
              <Metric label="Source assignments" value={data.readiness.sourceAssignmentsConfigured} />
            </CardContent>
          </Card>
          <Alert>
            <AlertTitle>Monitoring remains inactive</AlertTitle>
            <AlertDescription>Workspace channel assignment and source creation are deferred to the next setup phase.</AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
