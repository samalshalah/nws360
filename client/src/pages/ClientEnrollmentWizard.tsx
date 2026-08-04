import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ORGANIZATION_TYPES,
  isDiplomaticOrganizationType,
  normalizeSlug,
  type OrganizationType,
} from "@shared/client-enrollment";
import { WORKSPACE_PURPOSES, WORKSPACE_SCOPE_MODES } from "@shared/workspace-relevance";

type EnrollmentForm = {
  enrollmentKey: string;
  organization: {
    name: string;
    slug: string;
    organizationType: OrganizationType;
    defaultLanguage: string;
    websiteUrl: string;
    contactName: string;
    contactEmail: string;
  };
  organizationContext: {
    representedCountryCode: string;
    hostCountryCode: string;
    headquartersCountryCode: string;
    defaultTimezone: string;
    defaultLanguages: string[];
  };
  workspace: {
    name: string;
    description: string;
    purpose: string;
    scopeMode: string;
    globalScope: boolean;
    primaryCountryCodes: string[];
    secondaryCountryCodes: string[];
    regionCodes: string[];
    subnationalAreas: string[];
    preferredLanguages: string[];
    timezone: string;
    taxonomyTemplateCode: string;
    relevanceProfileCode: string;
    reportingTemplateCode: string;
  };
  relevanceProfile: {
    topics: string[];
    subtopics: string[];
    industries: string[];
    entities: string[];
    organizations: string[];
    people: string[];
    projects: string[];
    events: string[];
    multilingualAliases: string[];
    inclusionTerms: string[];
    exclusionTerms: string[];
    impactTerms: string[];
    contextualTerms: string[];
    minimumConfidence: number;
    includeContextualByDefault: boolean;
    contextualLabel: string;
    active: boolean;
  };
};

type PreviewResult = {
  writes: false;
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestedDefaults: Record<string, unknown>;
  creationPlan: string[];
  normalized?: EnrollmentForm;
};

const steps = [
  "Organization",
  "Organization Context",
  "First Monitoring Workspace",
  "Relevance Profile",
  "Review and Create",
];

function createEnrollmentKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `enroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyForm(): EnrollmentForm {
  return {
    enrollmentKey: createEnrollmentKey(),
    organization: {
      name: "",
      slug: "",
      organizationType: "media",
      defaultLanguage: "en",
      websiteUrl: "",
      contactName: "",
      contactEmail: "",
    },
    organizationContext: {
      representedCountryCode: "",
      hostCountryCode: "",
      headquartersCountryCode: "",
      defaultTimezone: "UTC",
      defaultLanguages: ["en"],
    },
    workspace: {
      name: "",
      description: "",
      purpose: "custom",
      scopeMode: "single_country",
      globalScope: false,
      primaryCountryCodes: [],
      secondaryCountryCodes: [],
      regionCodes: [],
      subnationalAreas: [],
      preferredLanguages: ["en"],
      timezone: "UTC",
      taxonomyTemplateCode: "",
      relevanceProfileCode: "",
      reportingTemplateCode: "",
    },
    relevanceProfile: {
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
    },
  };
}

function listToText(values: string[]) {
  return values.join(", ");
}

function textToList(value: string) {
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

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

export default function ClientEnrollmentWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EnrollmentForm>(() => emptyForm());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const diplomatic = isDiplomaticOrganizationType(form.organization.organizationType);
  const canGoBack = step > 0;
  const canGoNext = step < steps.length - 1;
  const monitoringSummary = useMemo(() => {
    if (form.workspace.globalScope || form.workspace.scopeMode === "global") return "Global";
    const countries = form.workspace.primaryCountryCodes.join(", ");
    const regions = form.workspace.regionCodes.join(", ");
    return countries || regions || "Not selected";
  }, [form.workspace.globalScope, form.workspace.primaryCountryCodes, form.workspace.regionCodes, form.workspace.scopeMode]);

  const englishOnlyForm = (): EnrollmentForm => ({
    ...form,
    organization: { ...form.organization, defaultLanguage: "en" },
    organizationContext: { ...form.organizationContext, defaultLanguages: ["en"] },
    workspace: { ...form.workspace, preferredLanguages: ["en"] },
  });

  const setOrganizationField = (key: keyof EnrollmentForm["organization"], value: string) => {
    setForm((current) => {
      const organization = { ...current.organization, [key]: value };
      if (key === "name" && (!current.organization.slug || current.organization.slug === normalizeSlug(current.organization.name))) {
        organization.slug = normalizeSlug(value);
      }
      if (key === "slug") organization.slug = normalizeSlug(value);
      return { ...current, organization };
    });
  };

  const setOrganizationType = (organizationType: OrganizationType) => {
    setForm((current) => ({
      ...current,
      organization: { ...current.organization, organizationType },
    }));
  };

  const setContextField = (key: keyof EnrollmentForm["organizationContext"], value: string | string[]) => {
    setForm((current) => ({
      ...current,
      organizationContext: { ...current.organizationContext, [key]: value },
    }));
  };

  const setWorkspaceField = (key: keyof EnrollmentForm["workspace"], value: string | string[] | boolean) => {
    setForm((current) => ({
      ...current,
      workspace: { ...current.workspace, [key]: value },
    }));
  };

  const setRelevanceField = (key: keyof EnrollmentForm["relevanceProfile"], value: string[] | string | number | boolean) => {
    setForm((current) => ({
      ...current,
      relevanceProfile: { ...current.relevanceProfile, [key]: value },
    }));
  };

  const runPreview = async () => {
    setIsPreviewing(true);
    try {
      const res = await apiRequest("POST", "/api/admin/client-enrollments/preview", englishOnlyForm());
      const data = await res.json();
      setPreview(data);
      return data as PreviewResult;
    } catch (error: any) {
      let message = error.message || "Preview failed";
      try {
        const payload = JSON.parse(String(message).replace(/^\d+:\s*/, ""));
        if (payload?.errors) {
          setPreview(payload);
          message = payload.errors.join("; ");
        }
      } catch {
        // Keep the API error text.
      }
      toast({ variant: "destructive", title: "Preview failed", description: message });
      return null;
    } finally {
      setIsPreviewing(false);
    }
  };

  const submitEnrollment = async () => {
    setIsSubmitting(true);
    try {
      const checked = preview?.valid ? preview : await runPreview();
      if (!checked?.valid) {
        setStep(4);
        return;
      }
      const res = await apiRequest("POST", "/api/admin/client-enrollments", englishOnlyForm());
      const data = await res.json();
      const clientId = data?.client?.id;
      toast({ title: data?.idempotent ? "Enrollment already exists" : "Client enrolled" });
      setLocation(clientId ? `/admin/clients/${clientId}/setup` : "/admin");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Enrollment failed", description: error.message || "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Enroll Client</h1>
            <p className="text-sm text-muted-foreground">
              Create the organization, first draft workspace, relevance rules, and audit record in one transaction.
            </p>
          </div>
        </div>
        <Badge variant="outline">No sources activated</Badge>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {steps.map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${index === step ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
          >
            <span className="block text-xs">Step {index + 1}</span>
            <span className="font-medium">{item}</span>
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>The client is the legal or operating organization. Monitoring targets are configured in workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Organization name" value={form.organization.name} onChange={(value) => setOrganizationField("name", value)} />
            <TextField label="Slug" value={form.organization.slug} onChange={(value) => setOrganizationField("slug", value)} />
            <div className="space-y-2">
              <Label>Organization type</Label>
              <Select value={form.organization.organizationType} onValueChange={(value) => setOrganizationType(value as OrganizationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORGANIZATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{labelize(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default language</Label>
              <Input value="English" disabled data-testid="input-default-language-english-only" />
            </div>
            <TextField label="Website" value={form.organization.websiteUrl} onChange={(value) => setOrganizationField("websiteUrl", value)} />
            <TextField label="Contact name" value={form.organization.contactName} onChange={(value) => setOrganizationField("contactName", value)} />
            <TextField label="Contact email" value={form.organization.contactEmail} onChange={(value) => setOrganizationField("contactEmail", value)} />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Organization Context</CardTitle>
            <CardDescription>Organization country is not the same as monitoring scope. The workspace controls what is watched.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {diplomatic ? (
              <>
                <TextField label="Represented country code" value={form.organizationContext.representedCountryCode} onChange={(value) => setContextField("representedCountryCode", value.toUpperCase())} placeholder="US" />
                <TextField label="Host country code" value={form.organizationContext.hostCountryCode} onChange={(value) => setContextField("hostCountryCode", value.toUpperCase())} placeholder="IQ" />
              </>
            ) : (
              <>
                <TextField label="Headquarters country code" value={form.organizationContext.headquartersCountryCode} onChange={(value) => setContextField("headquartersCountryCode", value.toUpperCase())} placeholder="GB" />
                <TextField label="Represented country code (optional)" value={form.organizationContext.representedCountryCode} onChange={(value) => setContextField("representedCountryCode", value.toUpperCase())} />
              </>
            )}
            <TextField label="Organization timezone" value={form.organizationContext.defaultTimezone} onChange={(value) => setContextField("defaultTimezone", value)} />
            <div className="space-y-2">
              <Label>Preferred organization languages</Label>
              <Input value="English" disabled data-testid="input-organization-languages-english-only" />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>First Monitoring Workspace</CardTitle>
            <CardDescription>This workspace starts as draft and inactive. Monitoring cannot start until publisher and source setup is complete.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField label="Workspace name" value={form.workspace.name} onChange={(value) => setWorkspaceField("name", value)} />
            <TextField label="Timezone" value={form.workspace.timezone} onChange={(value) => setWorkspaceField("timezone", value)} />
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={form.workspace.purpose} onValueChange={(value) => setWorkspaceField("purpose", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKSPACE_PURPOSES.map((purpose) => (
                    <SelectItem key={purpose} value={purpose}>{labelize(purpose)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scope mode</Label>
              <Select value={form.workspace.scopeMode} onValueChange={(value) => setWorkspaceField("scopeMode", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKSPACE_SCOPE_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>{labelize(mode)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ListField label="Primary monitoring countries" value={form.workspace.primaryCountryCodes} onChange={(values) => setWorkspaceField("primaryCountryCodes", values.map((item) => item.toUpperCase()))} placeholder="IQ" />
            <ListField label="Secondary monitoring countries" value={form.workspace.secondaryCountryCodes} onChange={(values) => setWorkspaceField("secondaryCountryCodes", values.map((item) => item.toUpperCase()))} />
            <ListField label="Regions" value={form.workspace.regionCodes} onChange={(values) => setWorkspaceField("regionCodes", values)} placeholder="mena, europe" />
            <ListField label="Subnational areas" value={form.workspace.subnationalAreas} onChange={(values) => setWorkspaceField("subnationalAreas", values)} />
            <div className="space-y-2">
              <Label>Preferred monitoring languages</Label>
              <Input value="English" disabled data-testid="input-workspace-languages-english-only" />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium">Global workspace</div>
                <div className="text-xs text-muted-foreground">Global scope does not require selected monitoring countries.</div>
              </div>
              <Switch checked={form.workspace.globalScope} onCheckedChange={(checked) => setWorkspaceField("globalScope", checked)} />
            </div>
            <TextareaField label="Description" value={form.workspace.description} onChange={(value) => setWorkspaceField("description", value)} className="md:col-span-2" />
            <TextField label="Taxonomy template" value={form.workspace.taxonomyTemplateCode} onChange={(value) => setWorkspaceField("taxonomyTemplateCode", value)} />
            <TextField label="Reporting template" value={form.workspace.reportingTemplateCode} onChange={(value) => setWorkspaceField("reportingTemplateCode", value)} />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Relevance Profile</CardTitle>
            <CardDescription>These rules decide what the workspace accepts, rejects, or sends to review.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ListField label="Topics" value={form.relevanceProfile.topics} onChange={(values) => setRelevanceField("topics", values)} />
            <ListField label="Subtopics" value={form.relevanceProfile.subtopics} onChange={(values) => setRelevanceField("subtopics", values)} />
            <ListField label="Industries" value={form.relevanceProfile.industries} onChange={(values) => setRelevanceField("industries", values)} />
            <ListField label="Entities" value={form.relevanceProfile.entities} onChange={(values) => setRelevanceField("entities", values)} />
            <ListField label="Organizations" value={form.relevanceProfile.organizations} onChange={(values) => setRelevanceField("organizations", values)} />
            <ListField label="People" value={form.relevanceProfile.people} onChange={(values) => setRelevanceField("people", values)} />
            <ListField label="Projects" value={form.relevanceProfile.projects} onChange={(values) => setRelevanceField("projects", values)} />
            <ListField label="Events" value={form.relevanceProfile.events} onChange={(values) => setRelevanceField("events", values)} />
            <ListField label="Multilingual aliases" value={form.relevanceProfile.multilingualAliases} onChange={(values) => setRelevanceField("multilingualAliases", values)} />
            <ListField label="Inclusion terms" value={form.relevanceProfile.inclusionTerms} onChange={(values) => setRelevanceField("inclusionTerms", values)} />
            <ListField label="Exclusion terms" value={form.relevanceProfile.exclusionTerms} onChange={(values) => setRelevanceField("exclusionTerms", values)} />
            <ListField label="Impact terms" value={form.relevanceProfile.impactTerms} onChange={(values) => setRelevanceField("impactTerms", values)} />
            <ListField label="Contextual terms" value={form.relevanceProfile.contextualTerms} onChange={(values) => setRelevanceField("contextualTerms", values)} />
            <TextField label="Contextual label" value={form.relevanceProfile.contextualLabel} onChange={(value) => setRelevanceField("contextualLabel", value)} />
            <div className="space-y-2">
              <Label>Minimum confidence</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.relevanceProfile.minimumConfidence}
                onChange={(event) => setRelevanceField("minimumConfidence", Number(event.target.value))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Include contextual by default</div>
                <div className="text-xs text-muted-foreground">Contextual items stay separate from direct monitoring.</div>
              </div>
              <Switch checked={form.relevanceProfile.includeContextualByDefault} onCheckedChange={(checked) => setRelevanceField("includeContextualByDefault", checked)} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Review and Create</CardTitle>
              <CardDescription>No publishers or sources will be activated during enrollment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <SummaryBlock title="Organization" rows={[
                ["Name", form.organization.name || "Not set"],
                ["Type", labelize(form.organization.organizationType)],
                ["Slug", form.organization.slug || "Not set"],
                ["Represented country", form.organizationContext.representedCountryCode || "Not set"],
                ["Host country", form.organizationContext.hostCountryCode || "Not set"],
                ["Headquarters country", form.organizationContext.headquartersCountryCode || "Not set"],
                ["Timezone", form.organizationContext.defaultTimezone],
                ["Languages", "English"],
              ]} />
              <SummaryBlock title="Workspace" rows={[
                ["Name", form.workspace.name || "Not set"],
                ["Purpose", labelize(form.workspace.purpose)],
                ["Scope mode", labelize(form.workspace.scopeMode)],
                ["Monitored geography", monitoringSummary],
                ["Status", "Draft"],
                ["Monitoring", "Inactive"],
              ]} />
              <SummaryBlock title="Relevance" rows={[
                ["Topics", form.relevanceProfile.topics.join(", ") || "Not set"],
                ["Entities", form.relevanceProfile.entities.join(", ") || "Not set"],
                ["Inclusion terms", form.relevanceProfile.inclusionTerms.join(", ") || "Not set"],
                ["Exclusion terms", form.relevanceProfile.exclusionTerms.join(", ") || "Not set"],
                ["Minimum confidence", `${form.relevanceProfile.minimumConfidence}%`],
                ["Contextual behavior", form.relevanceProfile.includeContextualByDefault ? "Included by default" : "Separate optional context"],
              ]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
              <CardDescription>Preview is read-only and performs no inserts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" variant="secondary" onClick={runPreview} disabled={isPreviewing}>
                {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Validate Preview
              </Button>
              {preview && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Writes</span>
                    <Badge variant="outline">{String(preview.writes)}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Valid</span>
                    <Badge variant={preview.valid ? "default" : "destructive"}>{String(preview.valid)}</Badge>
                  </div>
                  {preview.errors.length > 0 && <MessageList title="Errors" items={preview.errors} destructive />}
                  {preview.warnings.length > 0 && <MessageList title="Warnings" items={preview.warnings} />}
                  {preview.creationPlan.length > 0 && <MessageList title="Creation plan" items={preview.creationPlan} />}
                </div>
              )}
              <Button className="w-full" onClick={submitEnrollment} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Client
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={!canGoBack} onClick={() => setStep((current) => Math.max(0, current - 1))}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="text-sm text-muted-foreground">Enrollment key: {form.enrollmentKey}</div>
        <Button disabled={!canGoNext} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>
          Next
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TextareaField({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={`space-y-2 ${className || ""}`}>
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        className="min-h-20"
        value={listToText(value)}
        onChange={(event) => onChange(textToList(event.target.value))}
        placeholder={placeholder || "One item per line or comma separated"}
      />
    </div>
  );
}

function SummaryBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Check className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-medium">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageList({ title, items, destructive = false }: { title: string; items: string[]; destructive?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${destructive ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}>
      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
