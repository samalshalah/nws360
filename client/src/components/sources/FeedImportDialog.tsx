import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { api } from "@shared/routes";
import { SOURCE_CATEGORIES } from "@shared/source-categories";
import { classifyFeedImportRow, normalizeSourceImportKey, type ClassifiedFeedImportRow, type FeedImportInputRow } from "@shared/source-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface ImportPreviewRow extends ClassifiedFeedImportRow {
  id: string;
  raw: FeedImportInputRow;
  selected: boolean;
  duplicateInFile: boolean;
}

interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
}

const HEADER_MAP: Record<string, keyof FeedImportInputRow> = {
  xmlurl: "xmlUrl",
  xml_url: "xmlUrl",
  feedurl: "xmlUrl",
  feed_url: "xmlUrl",
  rssurl: "xmlUrl",
  rss_url: "xmlUrl",
  title: "title",
  name: "title",
  description: "description",
  sourceurl: "sourceUrl",
  source_url: "sourceUrl",
  url: "sourceUrl",
  website: "sourceUrl",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/^\uFEFF/, "").replace(/[\s-]/g, "_").toLowerCase();
}

function csvToRows(text: string): FeedImportInputRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(header => HEADER_MAP[normalizeHeader(header)] || null);
  return rows.slice(1).map((cells) => {
    const item: FeedImportInputRow = {};
    cells.forEach((cell, index) => {
      const key = headers[index];
      if (key) item[key] = cell.trim();
    });
    return item;
  }).filter(row => row.xmlUrl || row.sourceUrl || row.title);
}

function classifyRows(rawRows: FeedImportInputRow[]): ImportPreviewRow[] {
  const seen = new Set<string>();
  return rawRows.map((raw, index) => {
    const classified = classifyFeedImportRow(raw, index);
    const key = normalizeSourceImportKey(classified.type, classified.url, classified.country);
    const duplicateInFile = classified.enabled && seen.has(key);
    if (classified.enabled) seen.add(key);
    const warnings = duplicateInFile
      ? [...classified.warnings, "Duplicate inside this file."]
      : classified.warnings;

    return {
      ...classified,
      warnings,
      id: `${index}-${key}`,
      raw,
      duplicateInFile,
      selected: classified.enabled && !duplicateInFile,
    };
  });
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    google_news: "Google News",
    rss: "RSS",
    website: "Website",
    twitter: "X / Twitter",
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    telegram: "Telegram",
  };
  return labels[type] || type;
}

export function FeedImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [active, setActive] = useState(false);
  const [fetchAfterImport, setFetchAfterImport] = useState(false);
  const [category, setCategory] = useState("general");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [maxArticlesPerFetch, setMaxArticlesPerFetch] = useState(10);
  const [retentionDays, setRetentionDays] = useState(30);
  const [isImporting, setIsImporting] = useState(false);

  const selectedRows = rows.filter(row => row.selected);
  const summary = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc[row.type] = (acc[row.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [rows]);
  const rssAppCount = rows.filter(row => row.xmlUrl?.includes("rss.app/feeds")).length;

  const reset = () => {
    setRows([]);
    setFileName("");
    setActive(false);
    setFetchAfterImport(false);
    setCategory("general");
    setIntervalMinutes(30);
    setMaxArticlesPerFetch(10);
    setRetentionDays(30);
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = csvToRows(text);
    setFileName(file.name);
    setRows(classifyRows(parsed));
    if (parsed.length === 0) {
      toast({ variant: "destructive", title: "No sources found", description: "The CSV needs headers like xmlUrl, title, description, and sourceUrl." });
    }
  };

  const toggleRow = (id: string, selected: boolean) => {
    setRows(current => current.map(row => row.id === id ? { ...row, selected } : row));
  };

  const importRows = async () => {
    if (selectedRows.length === 0) return;
    setIsImporting(true);
    try {
      const response = await fetch("/api/sources/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: selectedRows.map(row => row.raw),
          active,
          fetchAfterImport: active && fetchAfterImport,
          intervalMinutes,
          maxArticlesPerFetch,
          retentionDays,
          category: category === "general" ? null : category,
        }),
      });
      const result = await response.json().catch(() => ({} as ImportResult));
      if (!response.ok) throw new Error(result.message || "Import failed");

      await queryClient.invalidateQueries({ queryKey: [api.sources.list.path] });
      await queryClient.invalidateQueries({ queryKey: ["/api/sources/article-counts"] });
      toast({
        title: "Sources imported",
        description: `${result.created || 0} created, ${result.skipped || 0} skipped, ${result.failed || 0} failed.`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Import failed", description: error instanceof Error ? error.message : "Unable to import sources." });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      onOpenChange(next);
      if (!next) reset();
    }}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle>Import feeds</DialogTitle>
          <DialogDescription>Upload a CSV export and review detected websites, RSS feeds, Google News topics, and social sources before import.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="feed-import-file">CSV file</Label>
              <Input
                id="feed-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleFile(event.target.files?.[0])}
                data-testid="input-feed-import-file"
              />
              {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
            </div>

            <div className="grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Import active</p>
                  <p className="text-xs text-muted-foreground">Keep off for first review.</p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} data-testid="switch-import-active" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Fetch after import</p>
                  <p className="text-xs text-muted-foreground">Only available for active imports.</p>
                </div>
                <Switch checked={active && fetchAfterImport} disabled={!active} onCheckedChange={setFetchAfterImport} data-testid="switch-import-fetch" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-import-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  {SOURCE_CATEGORIES.map(item => (
                    <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fetch interval</Label>
              <Select value={String(intervalMinutes)} onValueChange={(value) => setIntervalMinutes(Number(value))}>
                <SelectTrigger data-testid="select-import-interval"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 60, 120, 360, 720, 1440].map(minutes => (
                    <SelectItem key={minutes} value={String(minutes)}>{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-max-articles">Posts per fetch</Label>
              <Input id="import-max-articles" type="number" min={1} max={50} value={maxArticlesPerFetch} onChange={(event) => setMaxArticlesPerFetch(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-retention">Lifespan days</Label>
              <Input id="import-retention" type="number" min={1} max={30} value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} />
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{rows.length} rows</Badge>
                <Badge variant="secondary">{selectedRows.length} selected</Badge>
                {Object.entries(summary).map(([type, count]) => (
                  <Badge key={type} variant="outline">{typeLabel(type)}: {count}</Badge>
                ))}
              </div>

              {rssAppCount > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{rssAppCount} RSS.app feed link{rssAppCount === 1 ? "" : "s"} detected. Rows with original source URLs will import the original source instead of depending on RSS.app.</span>
                </div>
              )}

              <div className="overflow-hidden rounded-md border">
                <div className="max-h-[34vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="w-10 p-2 text-left"></th>
                        <th className="p-2 text-left">Source</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Import URL</th>
                        <th className="p-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="p-2 align-top">
                            <Checkbox checked={row.selected} disabled={!row.enabled || row.duplicateInFile} onCheckedChange={(checked) => toggleRow(row.id, checked === true)} />
                          </td>
                          <td className="max-w-[220px] p-2 align-top font-medium">
                            <span className="line-clamp-2">{row.name}</span>
                          </td>
                          <td className="p-2 align-top">
                            <Badge variant="outline">{typeLabel(row.type)}</Badge>
                          </td>
                          <td className="max-w-[260px] p-2 align-top text-muted-foreground">
                            <span className="line-clamp-2 break-all">{row.url || "-"}</span>
                          </td>
                          <td className="max-w-[260px] p-2 align-top text-xs text-muted-foreground">
                            {row.warnings.length > 0 ? row.warnings.join(" ") : "Ready"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed text-center text-muted-foreground">
              <FileUp className="mb-3 h-8 w-8 opacity-50" />
              <p className="text-sm font-medium">No CSV loaded</p>
              <p className="text-xs">Expected headers: xmlUrl, title, description, sourceUrl.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={importRows} disabled={selectedRows.length === 0 || isImporting} className="gap-2" data-testid="button-confirm-feed-import">
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {selectedRows.length || ""} source{selectedRows.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
