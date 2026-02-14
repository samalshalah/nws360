import { useState } from "react";
import { useSources } from "@/hooks/use-sources";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Globe, Rss } from "lucide-react";
import { useUpdateSource, useCreateSource } from "@/hooks/use-sources";

const regionLabels: Record<string, string> = {
  us: "United States",
  uk: "United Kingdom",
  eu: "Europe",
  me: "Middle East",
  asia: "Asia",
  global: "Global",
};

export default function SourcesPage() {
  const { data: sources, isLoading } = useSources();
  const updateSource = useUpdateSource();
  const createSource = useCreateSource();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", url: "", type: "rss" });

  const handleCreate = () => {
    if (!newSource.name || !newSource.url) return;
    createSource.mutate(
      { name: newSource.name, url: newSource.url, type: newSource.type } as any,
      {
        onSuccess: () => {
          setDialogOpen(false);
          setNewSource({ name: "", url: "", type: "rss" });
        },
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your monitored news sources.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-source">
              <Plus className="w-4 h-4 mr-1" /> Add Source
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Source Name</Label>
                <Input
                  placeholder="e.g., Reuters"
                  value={newSource.name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-source-name"
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  placeholder="https://example.com/rss"
                  value={newSource.url}
                  onChange={(e) => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                  data-testid="input-source-url"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newSource.type} onValueChange={(v) => setNewSource(prev => ({ ...prev, type: v }))}>
                  <SelectTrigger data-testid="select-source-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rss">RSS Feed</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="twitter">X / Twitter</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createSource.isPending || !newSource.name || !newSource.url}
                data-testid="button-save-source"
              >
                {createSource.isPending ? "Adding..." : "Add Source"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !sources || sources.length === 0 ? (
        <Card className="p-8 text-center">
          <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-sources">No sources added yet. Click "Add Source" to get started.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Region</TableHead>
                <TableHead className="hidden sm:table-cell">Language</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sources as any[]).map((source) => {
                let faviconUrl: string | null = null;
                try {
                  if (source.url) {
                    const urlStr = source.url.startsWith("http") ? source.url : `https://${source.url}`;
                    faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${new URL(urlStr).hostname}`;
                  }
                } catch { /* invalid URL, skip favicon */ }
                return (
                  <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {faviconUrl ? (
                          <img src={faviconUrl} alt="" className="w-4 h-4 rounded-sm" loading="lazy" />
                        ) : (
                          <Rss className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium" data-testid={`text-source-name-${source.id}`}>
                          {source.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{source.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {regionLabels[source.region] || source.region || "Global"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground uppercase">
                        {source.language || "en"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={source.active !== false}
                        onCheckedChange={(checked) => {
                          updateSource.mutate({ id: source.id, active: checked } as any);
                        }}
                        data-testid={`switch-source-${source.id}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
