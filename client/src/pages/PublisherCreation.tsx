import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
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
import {
  PUBLISHER_ALIAS_TYPES,
  PUBLISHER_CHANNEL_TYPES,
  PUBLISHER_LIFECYCLE_STATUSES,
  PUBLISHER_OFFICIAL_STATUSES,
  PUBLISHER_ORGANIZATION_TYPES,
  PUBLISHER_OWNERSHIP_TYPES,
  PUBLISHER_SCOPE_TYPES,
  PUBLISHER_VERIFICATION_STATUSES,
} from "@shared/publisher-catalog";

type AliasDraft = { alias: string; languageCode: string; aliasType: string };
type ChannelDraft = { name: string; channelType: string; url: string; handle: string; externalId: string; languageCodes: string; verificationStatus: string; lifecycleStatus: string };

const emptyAlias = (): AliasDraft => ({ alias: "", languageCode: "", aliasType: "name" });
const emptyChannel = (): ChannelDraft => ({
  name: "",
  channelType: "website",
  url: "",
  handle: "",
  externalId: "",
  languageCodes: "en",
  verificationStatus: "unverified",
  lifecycleStatus: "draft",
});

function list(value: string) {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

export default function PublisherCreation() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const search = new URLSearchParams(window.location.search);
  const ownerClientId = search.get("clientId") ? Number(search.get("clientId")) : null;
  const [profile, setProfile] = useState({
    name: "",
    slug: "",
    legalName: "",
    organizationType: "digital_news",
    description: "",
    primaryDomain: "",
    websiteUrl: "",
    logoUrl: "",
    countryCode: "",
    operatingCountryCodes: "",
    languageCodes: "ar, ku, en",
    ownershipType: "unknown",
    parentOrganizationName: "",
    officialStatus: "unknown",
    verificationStatus: "unverified",
    scopeType: ownerClientId ? "client_private" : "global",
    ownerClientId: ownerClientId ? String(ownerClientId) : "",
    status: "draft",
  });
  const [aliases, setAliases] = useState<AliasDraft[]>([emptyAlias()]);
  const [channels, setChannels] = useState<ChannelDraft[]>([emptyChannel()]);
  const [preview, setPreview] = useState<any>(null);

  const payload = useMemo(() => ({
    profile: {
      ...profile,
      countryCode: profile.countryCode || null,
      ownerClientId: profile.scopeType === "client_private" ? Number(profile.ownerClientId) : null,
      operatingCountryCodes: list(profile.operatingCountryCodes).map((item) => item.toUpperCase()),
      languageCodes: list(profile.languageCodes),
    },
    aliases: aliases.filter((alias) => alias.alias.trim()).map((alias) => ({
      alias: alias.alias,
      languageCode: alias.languageCode || null,
      aliasType: alias.aliasType,
    })),
    channels: channels.filter((channel) => channel.url.trim() || channel.handle.trim() || channel.externalId.trim()).map((channel) => ({
      name: channel.name || null,
      channelType: channel.channelType,
      url: channel.url || null,
      handle: channel.handle || null,
      externalId: channel.externalId || null,
      languageCodes: list(channel.languageCodes),
      verificationStatus: channel.verificationStatus,
      lifecycleStatus: channel.lifecycleStatus,
    })),
  }), [profile, aliases, channels]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/publishers/preview", payload);
      return res.json();
    },
    onSuccess: (result) => setPreview(result),
    onError: (error) => toast({ variant: "destructive", title: "Preview failed", description: error instanceof Error ? error.message : "Please check the fields." }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/publishers", payload);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers"] });
      toast({ title: "Publisher created" });
      setLocation(`/admin/publishers/${result.profile.id}`);
    },
    onError: (error) => toast({ variant: "destructive", title: "Create failed", description: error instanceof Error ? error.message : "Please try again." }),
  });

  const setProfileField = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/publishers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Publisher</h1>
          <p className="mt-1 text-sm text-muted-foreground">Preview normalization and duplicates before the final catalog write.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <CardDescription>One profile per organization, not per URL or social account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <TextField label="Name" value={profile.name} onChange={(value) => setProfileField("name", value)} />
              <TextField label="Slug" value={profile.slug} onChange={(value) => setProfileField("slug", value)} />
              <TextField label="Legal name" value={profile.legalName} onChange={(value) => setProfileField("legalName", value)} />
              <SelectField label="Organization type" value={profile.organizationType} values={PUBLISHER_ORGANIZATION_TYPES} onChange={(value) => setProfileField("organizationType", value)} />
              <TextField label="Website" value={profile.websiteUrl} onChange={(value) => setProfileField("websiteUrl", value)} />
              <TextField label="Primary domain" value={profile.primaryDomain} onChange={(value) => setProfileField("primaryDomain", value)} />
              <TextareaField label="Description" value={profile.description} onChange={(value) => setProfileField("description", value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Geography and Languages</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <TextField label="Country code" value={profile.countryCode} onChange={(value) => setProfileField("countryCode", value.toUpperCase())} />
              <TextField label="Operating countries" value={profile.operatingCountryCodes} onChange={(value) => setProfileField("operatingCountryCodes", value)} />
              <TextField label="Languages" value={profile.languageCodes} onChange={(value) => setProfileField("languageCodes", value)} />
              <TextField label="Logo URL" value={profile.logoUrl} onChange={(value) => setProfileField("logoUrl", value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ownership and Verification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SelectField label="Ownership" value={profile.ownershipType} values={PUBLISHER_OWNERSHIP_TYPES} onChange={(value) => setProfileField("ownershipType", value)} />
              <SelectField label="Official status" value={profile.officialStatus} values={PUBLISHER_OFFICIAL_STATUSES} onChange={(value) => setProfileField("officialStatus", value)} />
              <SelectField label="Verification" value={profile.verificationStatus} values={PUBLISHER_VERIFICATION_STATUSES} onChange={(value) => setProfileField("verificationStatus", value)} />
              <SelectField label="Lifecycle" value={profile.status} values={PUBLISHER_LIFECYCLE_STATUSES} onChange={(value) => setProfileField("status", value)} />
              <SelectField label="Visibility" value={profile.scopeType} values={PUBLISHER_SCOPE_TYPES} onChange={(value) => setProfileField("scopeType", value)} />
              <TextField label="Owner client ID" value={profile.ownerClientId} onChange={(value) => setProfileField("ownerClientId", value.replace(/\D/g, ""))} />
              <TextField label="Parent organization" value={profile.parentOrganizationName} onChange={(value) => setProfileField("parentOrganizationName", value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Aliases</CardTitle>
                <CardDescription>Aliases keep language-specific names separate.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAliases((current) => [...current, emptyAlias()])}>
                <Plus className="mr-2 h-4 w-4" />
                Alias
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {aliases.map((alias, index) => (
                <div key={index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_120px_170px_40px]">
                  <Input placeholder="Alias" value={alias.alias} onChange={(event) => setAliases((current) => current.map((item, i) => i === index ? { ...item, alias: event.target.value } : item))} />
                  <Input placeholder="ar" value={alias.languageCode} onChange={(event) => setAliases((current) => current.map((item, i) => i === index ? { ...item, languageCode: event.target.value } : item))} />
                  <Select value={alias.aliasType} onValueChange={(value) => setAliases((current) => current.map((item, i) => i === index ? { ...item, aliasType: value } : item))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PUBLISHER_ALIAS_TYPES.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" onClick={() => setAliases((current) => current.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Initial Channels</CardTitle>
                <CardDescription>Google News is not a publisher-owned channel.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setChannels((current) => [...current, emptyChannel()])}>
                <Plus className="mr-2 h-4 w-4" />
                Channel
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {channels.map((channel, index) => (
                <div key={index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2">
                  <TextField label="Name" value={channel.name} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, name: value } : item))} />
                  <SelectField label="Type" value={channel.channelType} values={PUBLISHER_CHANNEL_TYPES} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, channelType: value } : item))} />
                  <TextField label="URL" value={channel.url} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, url: value } : item))} />
                  <TextField label="Handle" value={channel.handle} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, handle: value } : item))} />
                  <TextField label="External ID" value={channel.externalId} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, externalId: value } : item))} />
                  <TextField label="Languages" value={channel.languageCodes} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, languageCodes: value } : item))} />
                  <SelectField label="Verification" value={channel.verificationStatus} values={PUBLISHER_VERIFICATION_STATUSES} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, verificationStatus: value } : item))} />
                  <div className="flex items-end justify-between gap-3">
                    <SelectField label="Lifecycle" value={channel.lifecycleStatus} values={PUBLISHER_LIFECYCLE_STATUSES} onChange={(value) => setChannels((current) => current.map((item, i) => i === index ? { ...item, lifecycleStatus: value } : item))} />
                    <Button size="icon" variant="ghost" onClick={() => setChannels((current) => current.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Review and Create</CardTitle>
              <CardDescription>No records are written until Create Publisher is submitted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Preview
              </Button>
              <Button className="w-full justify-start" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Create Publisher
              </Button>
              {preview && (
                <Alert>
                  <AlertTitle>Preview complete</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">aliases {preview.creationPlan?.aliasCount || 0}</Badge>
                        <Badge variant="outline">channels {preview.creationPlan?.channelCount || 0}</Badge>
                        <Badge variant={preview.duplicateCandidates?.length ? "destructive" : "default"}>duplicates {preview.duplicateCandidates?.length || 0}</Badge>
                      </div>
                      {preview.warnings?.length > 0 && (
                        <ul className="list-disc space-y-1 pl-4 text-xs">
                          {preview.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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
    <div className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
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
