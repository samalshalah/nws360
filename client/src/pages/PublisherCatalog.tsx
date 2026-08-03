import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Building2, Filter, Loader2, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { PUBLISHER_ORGANIZATION_TYPES, PUBLISHER_VERIFICATION_STATUSES, PUBLISHER_LIFECYCLE_STATUSES, PUBLISHER_SCOPE_TYPES } from "@shared/publisher-catalog";

type PublisherListItem = {
  id: number;
  name: string;
  slug: string;
  organizationType: string;
  countryCode?: string | null;
  normalizedPrimaryDomain?: string | null;
  verificationStatus: string;
  status: string;
  scopeType: string;
  ownerClientId?: number | null;
  channelCount: number;
  selectionCount: number;
  sourceLinkCount: number;
  articleAppearanceCount: number;
};

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

export default function PublisherCatalog() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState({
    search: "",
    countryCode: "",
    organizationType: "all",
    verificationStatus: "all",
    status: "all",
    scopeType: "all",
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.countryCode.trim()) params.set("countryCode", filters.countryCode.trim().toUpperCase());
    for (const key of ["organizationType", "verificationStatus", "status", "scopeType"] as const) {
      if (filters[key] !== "all") params.set(key, filters[key]);
    }
    return params.toString();
  }, [filters]);

  const { data, isLoading } = useQuery<{ items: PublisherListItem[]; total: number }>({
    queryKey: [`/api/admin/publishers${query ? `?${query}` : ""}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/publishers${query ? `?${query}` : ""}`);
      return res.json();
    },
  });

  const items = data?.items || [];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Publisher Catalog</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Canonical organizations and official channels. Operational sources stay separate.</p>
        </div>
        <Button onClick={() => setLocation("/admin/publishers/new")} data-testid="button-create-publisher">
          <Plus className="mr-2 h-4 w-4" />
          Create Publisher
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Catalog Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2 md:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name, slug or domain" />
            </div>
          </div>
          <TextFilter label="Country" value={filters.countryCode} onChange={(countryCode) => setFilters((current) => ({ ...current, countryCode }))} />
          <SelectFilter label="Organization" value={filters.organizationType} values={PUBLISHER_ORGANIZATION_TYPES} onChange={(organizationType) => setFilters((current) => ({ ...current, organizationType }))} />
          <SelectFilter label="Verification" value={filters.verificationStatus} values={PUBLISHER_VERIFICATION_STATUSES} onChange={(verificationStatus) => setFilters((current) => ({ ...current, verificationStatus }))} />
          <SelectFilter label="Lifecycle" value={filters.status} values={PUBLISHER_LIFECYCLE_STATUSES} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
          <SelectFilter label="Visibility" value={filters.scopeType} values={PUBLISHER_SCOPE_TYPES} onChange={(scopeType) => setFilters((current) => ({ ...current, scopeType }))} />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-border/70 bg-muted/20">
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No publisher profiles yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create verified organizations first, then add official channels under each publisher.</p>
            <Button className="mt-5" onClick={() => setLocation("/admin/publishers/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Publisher
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((publisher) => (
            <Card key={publisher.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">{publisher.name}</CardTitle>
                    <CardDescription>{publisher.normalizedPrimaryDomain || publisher.slug}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{labelize(publisher.organizationType)}</Badge>
                    <Badge variant={publisher.verificationStatus === "verified" ? "default" : "secondary"}>{publisher.verificationStatus}</Badge>
                    <Badge variant="outline">{publisher.scopeType === "global" ? "global" : `client #${publisher.ownerClientId}`}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 text-sm sm:grid-cols-5">
                  <Metric label="Channels" value={publisher.channelCount} />
                  <Metric label="Clients" value={publisher.selectionCount} />
                  <Metric label="Sources" value={publisher.sourceLinkCount} />
                  <Metric label="Appearances" value={publisher.articleAppearanceCount} />
                  <Metric label="Country" value={publisher.countryCode || "-"} />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setLocation(`/admin/publishers/${publisher.id}`)}>Open Details</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectFilter({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {values.map((item) => <SelectItem key={item} value={item}>{labelize(item)}</SelectItem>)}
        </SelectContent>
      </Select>
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
