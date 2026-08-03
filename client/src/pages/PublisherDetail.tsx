import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Loader2, Plus, RadioTower, Save, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CHANNEL_VALIDATION_STATUSES, PUBLISHER_ALIAS_TYPES, PUBLISHER_CHANNEL_TYPES, PUBLISHER_LIFECYCLE_STATUSES, PUBLISHER_VERIFICATION_STATUSES } from "@shared/publisher-catalog";

type PublisherDetailData = {
  id: number;
  name: string;
  slug: string;
  organizationType: string;
  countryCode?: string | null;
  normalizedPrimaryDomain?: string | null;
  websiteUrl?: string | null;
  ownershipType: string;
  officialStatus: string;
  verificationStatus: string;
  scopeType: string;
  ownerClientId?: number | null;
  status: string;
  aliases: any[];
  channels: any[];
  counts: {
    aliases: number;
    channels: number;
    clientSelections: number;
    sourceLinks: number;
    articleAppearances: number;
  };
};

function labelize(value: string | null | undefined) {
  return String(value || "-").replace(/_/g, " ");
}

export default function PublisherDetail() {
  const [, params] = useRoute("/admin/publishers/:publisherId");
  const publisherId = Number(params?.publisherId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [aliasDraft, setAliasDraft] = useState({ alias: "", languageCode: "", aliasType: "name" });
  const [channelDraft, setChannelDraft] = useState({ name: "", channelType: "website", url: "", handle: "", externalId: "", languageCodes: "en", verificationStatus: "unverified", lifecycleStatus: "draft" });

  const detailQueryKey = [`/api/admin/publishers/${publisherId}`];
  const { data, isLoading } = useQuery<PublisherDetailData>({
    queryKey: detailQueryKey,
    enabled: Number.isInteger(publisherId) && publisherId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/publishers/${publisherId}`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: detailQueryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers"] });
  };

  const lifecycleMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/admin/publishers/${publisherId}/lifecycle`, { status });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Lifecycle updated" }); },
    onError: (error) => toast({ variant: "destructive", title: "Lifecycle failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  const addAlias = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/publishers/${publisherId}/aliases`, {
        alias: aliasDraft.alias,
        languageCode: aliasDraft.languageCode || null,
        aliasType: aliasDraft.aliasType,
      });
      return res.json();
    },
    onSuccess: () => { setAliasDraft({ alias: "", languageCode: "", aliasType: "name" }); invalidate(); toast({ title: "Alias added" }); },
    onError: (error) => toast({ variant: "destructive", title: "Alias failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  const archiveAlias = useMutation({
    mutationFn: async (aliasId: number) => {
      await apiRequest("DELETE", `/api/admin/publishers/${publisherId}/aliases/${aliasId}`);
    },
    onSuccess: () => { invalidate(); toast({ title: "Alias archived" }); },
  });

  const addChannel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/publishers/${publisherId}/channels`, {
        ...channelDraft,
        languageCodes: channelDraft.languageCodes.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
        name: channelDraft.name || null,
        url: channelDraft.url || null,
        handle: channelDraft.handle || null,
        externalId: channelDraft.externalId || null,
      });
      return res.json();
    },
    onSuccess: () => { setChannelDraft({ name: "", channelType: "website", url: "", handle: "", externalId: "", languageCodes: "en", verificationStatus: "unverified", lifecycleStatus: "draft" }); invalidate(); toast({ title: "Channel added" }); },
    onError: (error) => toast({ variant: "destructive", title: "Channel failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  const channelLifecycle = useMutation({
    mutationFn: async ({ channelId, status }: { channelId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/publishers/${publisherId}/channels/${channelId}/lifecycle`, { status });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Channel lifecycle updated" }); },
  });

  const channelValidation = useMutation({
    mutationFn: async ({ channelId, validationStatus }: { channelId: number; validationStatus: string }) => {
      const res = await apiRequest("POST", `/api/admin/publishers/${publisherId}/channels/${channelId}/validate`, { validationStatus });
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Channel validation saved" }); },
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Publisher not found.</CardContent></Card>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/publishers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
              <Badge variant="outline">{data.scopeType === "global" ? "global" : `client #${data.ownerClientId}`}</Badge>
              <Badge variant={data.verificationStatus === "verified" ? "default" : "secondary"}>{data.verificationStatus}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{data.normalizedPrimaryDomain || data.websiteUrl || data.slug}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PUBLISHER_LIFECYCLE_STATUSES.map((status) => (
            <Button key={status} size="sm" variant={data.status === status ? "default" : "outline"} onClick={() => lifecycleMutation.mutate(status)}>
              {labelize(status)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Profile Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Info label="Organization" value={labelize(data.organizationType)} />
              <Info label="Country" value={data.countryCode || "-"} />
              <Info label="Ownership" value={labelize(data.ownershipType)} />
              <Info label="Official status" value={labelize(data.officialStatus)} />
              <Info label="Lifecycle" value={labelize(data.status)} />
              <Info label="Website" value={data.websiteUrl || "-"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Aliases</CardTitle>
                <CardDescription>Language-aware publisher names and abbreviations.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_100px_170px_40px]">
                <Input placeholder="Alias" value={aliasDraft.alias} onChange={(event) => setAliasDraft((current) => ({ ...current, alias: event.target.value }))} />
                <Input placeholder="ar" value={aliasDraft.languageCode} onChange={(event) => setAliasDraft((current) => ({ ...current, languageCode: event.target.value }))} />
                <Select value={aliasDraft.aliasType} onValueChange={(aliasType) => setAliasDraft((current) => ({ ...current, aliasType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PUBLISHER_ALIAS_TYPES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" onClick={() => addAlias.mutate()} disabled={!aliasDraft.alias.trim() || addAlias.isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {data.aliases.length === 0 ? <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No aliases.</div> : data.aliases.map((alias) => (
                  <div key={alias.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div>
                      <div className="font-medium">{alias.alias}</div>
                      <div className="text-xs text-muted-foreground">{alias.languageCode || "any"} · {labelize(alias.aliasType)}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => archiveAlias.mutate(alias.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardDescription>Official channels can exist before any source is created.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2">
                <TextField label="Name" value={channelDraft.name} onChange={(name) => setChannelDraft((current) => ({ ...current, name }))} />
                <SelectField label="Type" value={channelDraft.channelType} values={PUBLISHER_CHANNEL_TYPES} onChange={(channelType) => setChannelDraft((current) => ({ ...current, channelType }))} />
                <TextField label="URL" value={channelDraft.url} onChange={(url) => setChannelDraft((current) => ({ ...current, url }))} />
                <TextField label="Handle" value={channelDraft.handle} onChange={(handle) => setChannelDraft((current) => ({ ...current, handle }))} />
                <TextField label="External ID" value={channelDraft.externalId} onChange={(externalId) => setChannelDraft((current) => ({ ...current, externalId }))} />
                <TextField label="Languages" value={channelDraft.languageCodes} onChange={(languageCodes) => setChannelDraft((current) => ({ ...current, languageCodes }))} />
                <SelectField label="Verification" value={channelDraft.verificationStatus} values={PUBLISHER_VERIFICATION_STATUSES} onChange={(verificationStatus) => setChannelDraft((current) => ({ ...current, verificationStatus }))} />
                <div className="flex items-end">
                  <Button onClick={() => addChannel.mutate()} disabled={addChannel.isPending}>
                    {addChannel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Add Channel
                  </Button>
                </div>
              </div>

              {data.channels.length === 0 ? <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No channels.</div> : data.channels.map((channel) => (
                <div key={channel.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <RadioTower className="h-4 w-4 text-primary" />
                        <h3 className="font-medium">{channel.name}</h3>
                      </div>
                      <p className="mt-1 break-all text-sm text-muted-foreground">{channel.normalizedUrl || channel.handle || channel.externalId || "No URL identity"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{labelize(channel.channelType)}</Badge>
                      <Badge variant={channel.lifecycleStatus === "active" ? "default" : "secondary"}>{channel.lifecycleStatus}</Badge>
                      <Badge variant={channel.validationStatus === "valid" ? "default" : "outline"}>{channel.validationStatus}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select value={channel.lifecycleStatus} onValueChange={(status) => channelLifecycle.mutate({ channelId: channel.id, status })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{PUBLISHER_LIFECYCLE_STATUSES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={channel.validationStatus} onValueChange={(validationStatus) => channelValidation.mutate({ channelId: channel.id, validationStatus })}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{CHANNEL_VALIDATION_STATUSES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Catalog Counts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Info label="Aliases" value={String(data.counts.aliases)} />
              <Info label="Channels" value={String(data.counts.channels)} />
              <Info label="Client selections" value={String(data.counts.clientSelections)} />
              <Info label="Source links" value={String(data.counts.sourceLinks)} />
              <Info label="Article appearances" value={String(data.counts.articleAppearances)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
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
        <SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
