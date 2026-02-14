import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Users, Settings, Shield, Activity,
  Plus, Trash2, RefreshCw, Eye, EyeOff,
  Key, Clock, Server, AlertTriangle, CheckCircle, XCircle, Info
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function TabInfo({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid="button-tab-info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="text-sm max-w-sm">
        {description}
      </PopoverContent>
    </Popover>
  );
}

interface Source {
  id: number;
  name: string;
  url: string;
  type: string;
  active: boolean;
  deletedAt: string | null;
  lastFetchedAt: string | null;
  refreshPriority: string;
  intervalMinutes: number;
  maxArticlesPerFetch: number;
  retentionDays: number;
  country: string | null;
}

interface Client {
  id: number;
  name: string;
  organizationType: string;
  defaultLanguage: string;
  active: boolean;
  allowedRegions: string[] | null;
}

interface ClientKeyword {
  id: number;
  clientId: number;
  term: string;
  priority: string;
}

interface User {
  id: number;
  username: string;
  role: string;
  clientId: number | null;
  disabled: boolean;
  createdAt: string;
}

interface SystemHealth {
  totalArticles: number;
  totalSources: number;
  totalUsers: number;
  failedSourcesCount: number;
  avgProcessingTime: number;
  lastWorkerRun: string | null;
}

interface AuditLog {
  id: number;
  createdAt: string;
  userId: number;
  username: string;
  action: string;
  entity: string;
  details: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface SystemError {
  id: number;
  severity: string;
  component: string;
  errorMessage: string;
  stackTrace: string | null;
  sourceId: number | null;
  resolved: boolean;
  createdAt: string;
}

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  clientId: number | null;
  scopes: string[];
  rateLimit: number;
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function SourcesTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: sources, isLoading } = useQuery<Source[]>({ queryKey: ["/api/admin/sources"] });
  const [editSource, setEditSource] = useState<Source | null>(null);
  const [editForm, setEditForm] = useState({ name: "", url: "", type: "", refreshPriority: "medium" });
  const [deleteConfirm, setDeleteConfirm] = useState<Source | null>(null);

  const handleEdit = (source: Source) => {
    setEditSource(source);
    setEditForm({ name: source.name, url: source.url, type: source.type, refreshPriority: source.refreshPriority || "medium" });
  };

  const handleSaveEdit = async () => {
    if (!editSource) return;
    try {
      await apiRequest("PUT", `/api/admin/sources/${editSource.id}`, editForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
      toast({ title: t("Source updated successfully") });
      setEditSource(null);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (source: Source) => {
    try {
      await apiRequest("PUT", `/api/admin/sources/${source.id}`, { active: !source.active });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
      toast({ title: source.active ? t("Source deactivated") : t("Source activated") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiRequest("DELETE", `/api/admin/sources/${deleteConfirm.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
      toast({ title: t("Source deleted") });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleRestore = async (source: Source) => {
    try {
      await apiRequest("POST", `/api/admin/sources/${source.id}/restore`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
      toast({ title: t("Source restored") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TabInfo description="Manage all news sources in the platform — add RSS feeds, websites, and social media accounts. Configure fetch intervals, priorities, and monitor each source's health status." />
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Name")}</TableHead>
              <TableHead>{t("URL")}</TableHead>
              <TableHead>{t("Type")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Last Fetched")}</TableHead>
              <TableHead>{t("Priority")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources?.map(source => (
              <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{source.url}</TableCell>
                <TableCell><Badge variant="secondary">{source.type}</Badge></TableCell>
                <TableCell>
                  {source.deletedAt ? (
                    <Badge variant="destructive">{t("Deleted")}</Badge>
                  ) : source.active ? (
                    <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">{t("Active")}</Badge>
                  ) : (
                    <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">{t("Inactive")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {source.lastFetchedAt ? new Date(source.lastFetchedAt).toLocaleString() : t("Never")}
                </TableCell>
                <TableCell><Badge variant="outline">{source.refreshPriority || "medium"}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(source)} data-testid={`button-edit-source-${source.id}`}>
                      <Settings className="w-4 h-4" />
                    </Button>
                    {!source.deletedAt && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => handleToggleActive(source)} data-testid={`button-toggle-source-${source.id}`}>
                          {source.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(source)} data-testid={`button-delete-source-${source.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {source.deletedAt && (
                      <Button size="sm" variant="outline" onClick={() => handleRestore(source)} data-testid={`button-restore-source-${source.id}`}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {t("Restore")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-3">
        {sources?.map(source => (
          <Card key={source.id} data-testid={`card-source-${source.id}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{source.name}</span>
                {source.deletedAt ? (
                  <Badge variant="destructive">{t("Deleted")}</Badge>
                ) : source.active ? (
                  <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">{t("Active")}</Badge>
                ) : (
                  <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">{t("Inactive")}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{source.url}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{source.type}</Badge>
                <span className="text-xs text-muted-foreground">{source.refreshPriority || "medium"}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => handleEdit(source)} data-testid={`button-edit-source-mobile-${source.id}`}>
                  <Settings className="w-4 h-4 mr-1" />{t("Edit")}
                </Button>
                {!source.deletedAt && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleActive(source)} data-testid={`button-toggle-source-mobile-${source.id}`}>
                      {source.active ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                      {source.active ? t("Deactivate") : t("Activate")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(source)} data-testid={`button-delete-source-mobile-${source.id}`}>
                      <Trash2 className="w-4 h-4 mr-1" />{t("Delete")}
                    </Button>
                  </>
                )}
                {source.deletedAt && (
                  <Button size="sm" variant="outline" onClick={() => handleRestore(source)} data-testid={`button-restore-source-mobile-${source.id}`}>
                    <RefreshCw className="w-4 h-4 mr-1" />{t("Restore")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editSource} onOpenChange={() => setEditSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Edit Source")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name")}</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-source-name" />
            </div>
            <div className="space-y-2">
              <Label>{t("URL")}</Label>
              <Input value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} data-testid="input-edit-source-url" />
            </div>
            <div className="space-y-2">
              <Label>{t("Type")}</Label>
              <Input value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} data-testid="input-edit-source-type" />
            </div>
            <div className="space-y-2">
              <Label>{t("Priority")}</Label>
              <Select value={editForm.refreshPriority} onValueChange={v => setEditForm(f => ({ ...f, refreshPriority: v }))}>
                <SelectTrigger data-testid="input-edit-source-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t("High")}</SelectItem>
                  <SelectItem value="medium">{t("Medium")}</SelectItem>
                  <SelectItem value="low">{t("Low")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSource(null)} data-testid="button-cancel-edit-source">{t("Cancel")}</Button>
            <Button onClick={handleSaveEdit} data-testid="button-save-edit-source">{t("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Source")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Are you sure you want to delete")} "{deleteConfirm?.name}"? {t("This action can be undone by restoring the source.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-source">{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete-source">{t("Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: clients, isLoading } = useQuery<Client[]>({ queryKey: ["/api/admin/clients"] });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<Client | null>(null);
  const [expandedKeywords, setExpandedKeywords] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ name: "", organizationType: "", defaultLanguage: "en", active: true, allowedRegions: "" });
  const [editForm, setEditForm] = useState({ name: "", organizationType: "", defaultLanguage: "en", active: true, allowedRegions: "" });
  const [newKeyword, setNewKeyword] = useState({ term: "", priority: "primary" });

  const { data: keywords } = useQuery<ClientKeyword[]>({
    queryKey: ["/api/admin/clients", expandedKeywords, "keywords"],
    enabled: !!expandedKeywords,
  });

  const handleAddClient = async () => {
    try {
      await apiRequest("POST", "/api/admin/clients", {
        ...addForm,
        allowedRegions: addForm.allowedRegions.split(",").map(s => s.trim()).filter(Boolean),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: t("Client created successfully") });
      setShowAddDialog(false);
      setAddForm({ name: "", organizationType: "", defaultLanguage: "en", active: true, allowedRegions: "" });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleEditClient = async () => {
    if (!editClient) return;
    try {
      await apiRequest("PUT", `/api/admin/clients/${editClient.id}`, {
        ...editForm,
        allowedRegions: editForm.allowedRegions.split(",").map(s => s.trim()).filter(Boolean),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: t("Client updated successfully") });
      setEditClient(null);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateConfirm) return;
    try {
      await apiRequest("DELETE", `/api/admin/clients/${deactivateConfirm.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      toast({ title: t("Client deactivated") });
      setDeactivateConfirm(null);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleAddKeyword = async () => {
    if (!expandedKeywords || !newKeyword.term.trim()) return;
    try {
      await apiRequest("POST", `/api/admin/clients/${expandedKeywords}/keywords`, newKeyword);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", expandedKeywords, "keywords"] });
      toast({ title: t("Keyword added") });
      setNewKeyword({ term: "", priority: "primary" });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveKeyword = async (keywordId: number) => {
    try {
      await apiRequest("DELETE", `/api/admin/client-keywords/${keywordId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients", expandedKeywords, "keywords"] });
      toast({ title: t("Keyword removed") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setEditForm({
      name: client.name,
      organizationType: client.organizationType,
      defaultLanguage: client.defaultLanguage,
      active: client.active,
      allowedRegions: (client.allowedRegions || []).join(", "),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <TabInfo description="Create and manage client organizations. Each client can have their own users, sources, and data scope for multi-tenant intelligence delivery." />
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-client">
          <Plus className="w-4 h-4 mr-1" />{t("Add Client")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clients?.map(client => (
          <Card key={client.id} data-testid={`card-client-${client.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">{client.name}</CardTitle>
                {client.active ? (
                  <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">{t("Active")}</Badge>
                ) : (
                  <Badge variant="destructive">{t("Inactive")}</Badge>
                )}
              </div>
              <CardDescription>{client.organizationType}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>{t("Language")}: {client.defaultLanguage}</span>
                {(client.allowedRegions?.length ?? 0) > 0 && (
                  <span>{t("Regions")}: {(client.allowedRegions ?? []).join(", ")}</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => openEdit(client)} data-testid={`button-edit-client-${client.id}`}>
                  <Settings className="w-4 h-4 mr-1" />{t("Edit")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeactivateConfirm(client)} data-testid={`button-deactivate-client-${client.id}`}>
                  <XCircle className="w-4 h-4 mr-1" />{t("Deactivate")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpandedKeywords(expandedKeywords === client.id ? null : client.id)}
                  data-testid={`button-keywords-client-${client.id}`}
                >
                  <Key className="w-4 h-4 mr-1" />{t("Keywords")}
                </Button>
              </div>

              {expandedKeywords === client.id && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      placeholder={t("Keyword term")}
                      value={newKeyword.term}
                      onChange={e => setNewKeyword(k => ({ ...k, term: e.target.value }))}
                      className="flex-1 min-w-[120px]"
                      data-testid={`input-keyword-term-${client.id}`}
                    />
                    <Select value={newKeyword.priority} onValueChange={v => setNewKeyword(k => ({ ...k, priority: v }))}>
                      <SelectTrigger className="w-28" data-testid={`input-keyword-priority-${client.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">{t("Primary")}</SelectItem>
                        <SelectItem value="secondary">{t("Secondary")}</SelectItem>
                        <SelectItem value="tertiary">{t("Tertiary")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleAddKeyword} data-testid={`button-add-keyword-${client.id}`}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {keywords?.map(kw => (
                      <div key={kw.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-md bg-muted/50">
                        <span className="text-sm">{kw.term}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{kw.priority}</Badge>
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveKeyword(kw.id)} data-testid={`button-remove-keyword-${kw.id}`}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {keywords?.length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">{t("No keywords configured")}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Add Client")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name")}</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} data-testid="input-add-client-name" />
            </div>
            <div className="space-y-2">
              <Label>{t("Organization Type")}</Label>
              <Input value={addForm.organizationType} onChange={e => setAddForm(f => ({ ...f, organizationType: e.target.value }))} data-testid="input-add-client-org-type" />
            </div>
            <div className="space-y-2">
              <Label>{t("Default Language")}</Label>
              <Select value={addForm.defaultLanguage} onValueChange={v => setAddForm(f => ({ ...f, defaultLanguage: v }))}>
                <SelectTrigger data-testid="select-add-client-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="tr">Turkish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Allowed Regions (comma separated)")}</Label>
              <Input value={addForm.allowedRegions} onChange={e => setAddForm(f => ({ ...f, allowedRegions: e.target.value }))} placeholder="US, EU, MENA" data-testid="input-add-client-regions" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={addForm.active} onCheckedChange={v => setAddForm(f => ({ ...f, active: v }))} data-testid="switch-add-client-active" />
              <Label>{t("Active")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add-client">{t("Cancel")}</Button>
            <Button onClick={handleAddClient} data-testid="button-save-add-client">{t("Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editClient} onOpenChange={() => setEditClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Edit Client")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name")}</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-client-name" />
            </div>
            <div className="space-y-2">
              <Label>{t("Organization Type")}</Label>
              <Input value={editForm.organizationType} onChange={e => setEditForm(f => ({ ...f, organizationType: e.target.value }))} data-testid="input-edit-client-org-type" />
            </div>
            <div className="space-y-2">
              <Label>{t("Default Language")}</Label>
              <Select value={editForm.defaultLanguage} onValueChange={v => setEditForm(f => ({ ...f, defaultLanguage: v }))}>
                <SelectTrigger data-testid="select-edit-client-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="tr">Turkish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Allowed Regions (comma separated)")}</Label>
              <Input value={editForm.allowedRegions} onChange={e => setEditForm(f => ({ ...f, allowedRegions: e.target.value }))} data-testid="input-edit-client-regions" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editForm.active} onCheckedChange={v => setEditForm(f => ({ ...f, active: v }))} data-testid="switch-edit-client-active" />
              <Label>{t("Active")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClient(null)} data-testid="button-cancel-edit-client">{t("Cancel")}</Button>
            <Button onClick={handleEditClient} data-testid="button-save-edit-client">{t("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateConfirm} onOpenChange={() => setDeactivateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Deactivate Client")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Are you sure you want to deactivate")} "{deactivateConfirm?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate-client">{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} data-testid="button-confirm-deactivate-client">{t("Deactivate")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/admin/clients"] });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [addForm, setAddForm] = useState({ username: "", password: "", role: "viewer", clientId: "" });

  const handleAddUser = async () => {
    try {
      await apiRequest("POST", "/api/admin/users", {
        ...addForm,
        clientId: addForm.clientId ? parseInt(addForm.clientId) : null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("User created successfully") });
      setShowAddDialog(false);
      setAddForm({ username: "", password: "", role: "viewer", clientId: "" });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleChangeRole = async (user: User, role: string) => {
    try {
      await apiRequest("PUT", `/api/admin/users/${user.id}`, { role });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("Role updated") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleToggleDisabled = async (user: User) => {
    try {
      await apiRequest("PUT", `/api/admin/users/${user.id}`, { disabled: !user.disabled });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: user.disabled ? t("User enabled") : t("User disabled") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;
    try {
      await apiRequest("PUT", `/api/admin/users/${resetPasswordUser.id}`, { password: newPassword });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("Password reset successfully") });
      setResetPasswordUser(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    try {
      await apiRequest("DELETE", `/api/admin/users/${deleteConfirm.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("User deleted") });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const getClientName = (clientId: number | null) => {
    if (!clientId) return "-";
    return clients?.find(c => c.id === clientId)?.name || `Client #${clientId}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <TabInfo description="Manage user accounts across the platform. Create users, assign roles, set client associations, and control access permissions." />
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-user">
          <Plus className="w-4 h-4 mr-1" />{t("Add User")}
        </Button>
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Username")}</TableHead>
              <TableHead>{t("Role")}</TableHead>
              <TableHead>{t("Client")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Created")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(user => (
              <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>
                  <Select value={user.role} onValueChange={v => handleChangeRole(user, v)}>
                    <SelectTrigger className="w-28" data-testid={`select-role-${user.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">{getClientName(user.clientId)}</TableCell>
                <TableCell>
                  {user.disabled ? (
                    <Badge variant="destructive">{t("Disabled")}</Badge>
                  ) : (
                    <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">{t("Enabled")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Button size="icon" variant="ghost" onClick={() => handleToggleDisabled(user)} data-testid={`button-toggle-user-${user.id}`}>
                      {user.disabled ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setResetPasswordUser(user); setNewPassword(""); }} data-testid={`button-reset-password-${user.id}`}>
                      <Key className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(user)} data-testid={`button-delete-user-${user.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-3">
        {users?.map(user => (
          <Card key={user.id} data-testid={`card-user-${user.id}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{user.username}</span>
                {user.disabled ? (
                  <Badge variant="destructive">{t("Disabled")}</Badge>
                ) : (
                  <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">{t("Enabled")}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <Badge variant="secondary">{user.role}</Badge>
                <span>{getClientName(user.clientId)}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Select value={user.role} onValueChange={v => handleChangeRole(user, v)}>
                  <SelectTrigger className="w-28" data-testid={`select-role-mobile-${user.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => handleToggleDisabled(user)} data-testid={`button-toggle-user-mobile-${user.id}`}>
                  {user.disabled ? <CheckCircle className="w-4 h-4 mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                  {user.disabled ? t("Enable") : t("Disable")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setResetPasswordUser(user); setNewPassword(""); }} data-testid={`button-reset-password-mobile-${user.id}`}>
                  <Key className="w-4 h-4 mr-1" />{t("Password")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(user)} data-testid={`button-delete-user-mobile-${user.id}`}>
                  <Trash2 className="w-4 h-4 mr-1" />{t("Delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Add User")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Username")}</Label>
              <Input value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} data-testid="input-add-user-username" />
            </div>
            <div className="space-y-2">
              <Label>{t("Password")}</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} data-testid="input-add-user-password" />
            </div>
            <div className="space-y-2">
              <Label>{t("Role")}</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="select-add-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Client")}</Label>
              <Select value={addForm.clientId} onValueChange={v => setAddForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger data-testid="select-add-user-client">
                  <SelectValue placeholder={t("Select client (optional)")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None")}</SelectItem>
                  {clients?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add-user">{t("Cancel")}</Button>
            <Button onClick={handleAddUser} data-testid="button-save-add-user">{t("Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetPasswordUser} onOpenChange={() => setResetPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reset Password")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("Set a new password for")} {resetPasswordUser?.username}</p>
            <div className="space-y-2">
              <Label>{t("New Password")}</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid="input-reset-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordUser(null)} data-testid="button-cancel-reset-password">{t("Cancel")}</Button>
            <Button onClick={handleResetPassword} data-testid="button-save-reset-password">{t("Reset Password")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete User")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Are you sure you want to delete user")} "{deleteConfirm?.username}"? {t("This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} data-testid="button-confirm-delete-user">{t("Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Record<string, any>>({ queryKey: ["/api/admin/settings"] });
  const [form, setForm] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  const settingsFields = [
    { key: "feedRefreshMinutes", label: t("Feed Refresh Interval (minutes)"), type: "number" },
    { key: "rawArticleRetentionDays", label: t("Raw Article Retention (days)"), type: "number" },
    { key: "maxArticlesPerSource", label: t("Max Articles Per Source"), type: "number" },
    { key: "enableAutoFetch", label: t("Enable Auto Fetch"), type: "boolean" },
    { key: "enableSentimentAnalysis", label: t("Enable Sentiment Analysis"), type: "boolean" },
    { key: "enableBreakingNews", label: t("Enable Breaking News"), type: "boolean" },
    { key: "maxConcurrentFetches", label: t("Max Concurrent Fetches"), type: "number" },
    { key: "workerIntervalSeconds", label: t("Worker Interval (seconds)"), type: "number" },
  ];

  const currentValues = { ...settings, ...form };

  const handleChange = (key: string, value: any) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await apiRequest("PUT", "/api/admin/settings", currentValues);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: t("Settings saved successfully") });
      setForm({});
      setDirty(false);
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{t("System Settings")}</CardTitle>
          <TabInfo description="Configure system-wide settings including AI analysis parameters, data retention policies, and platform behavior preferences." />
        </div>
        <CardDescription>{t("Configure system-wide settings for the platform")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {settingsFields.map(field => (
          <div key={field.key} className="flex items-center justify-between gap-4 flex-wrap">
            <Label className="flex-1 min-w-[200px]">{field.label}</Label>
            {field.type === "boolean" ? (
              <Switch
                checked={!!currentValues[field.key]}
                onCheckedChange={v => handleChange(field.key, v)}
                data-testid={`switch-setting-${field.key}`}
              />
            ) : (
              <Input
                type="number"
                value={currentValues[field.key] ?? ""}
                onChange={e => handleChange(field.key, parseInt(e.target.value) || 0)}
                className="w-32"
                data-testid={`input-setting-${field.key}`}
              />
            )}
          </div>
        ))}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={!dirty} data-testid="button-save-settings">
            {t("Save Settings")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LogsHealthTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: health, isLoading: healthLoading } = useQuery<SystemHealth>({ queryKey: ["/api/admin/system-health"] });
  const { data: queueStats } = useQuery<QueueStats>({ queryKey: ["/api/admin/queue-stats"] });
  const { data: systemErrors } = useQuery<{ items: SystemError[]; total: number }>({ queryKey: ["/api/admin/system-errors"] });
  const { data: apiKeys } = useQuery<ApiKey[]>({ queryKey: ["/api/admin/api-keys"] });
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data: logsData, isLoading: logsLoading } = useQuery<{ items: AuditLog[]; total: number }>({
    queryKey: [`/api/admin/audit-logs?limit=${limit}&offset=${page * limit}`],
  });
  const [subTab, setSubTab] = useState<"health" | "errors" | "apikeys" | "logs">("health");
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: "", scopes: "articles:read,analytics:read", rateLimit: "100" });
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [computingAnalytics, setComputingAnalytics] = useState(false);
  const [runningRetention, setRunningRetention] = useState(false);

  const healthCards = [
    { label: t("Total Articles"), value: health?.totalArticles ?? 0, icon: Database, color: "text-blue-500" },
    { label: t("Total Sources"), value: health?.totalSources ?? 0, icon: Server, color: "text-purple-500" },
    { label: t("Total Users"), value: health?.totalUsers ?? 0, icon: Users, color: "text-green-500" },
    { label: t("Failed Sources (24h)"), value: health?.failedSourcesCount ?? 0, icon: AlertTriangle, color: "text-red-500" },
    { label: t("Avg Processing Time"), value: health?.avgProcessingTime ? `${health.avgProcessingTime}ms` : "-", icon: Clock, color: "text-amber-500" },
    { label: t("Last Worker Run"), value: health?.lastWorkerRun ? new Date(health.lastWorkerRun).toLocaleString() : t("Never"), icon: Activity, color: "text-teal-500" },
  ];

  const handleComputeAnalytics = async () => {
    setComputingAnalytics(true);
    try {
      await apiRequest("POST", "/api/admin/compute-analytics");
      toast({ title: t("Analytics computation triggered") });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-health"] });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    } finally {
      setComputingAnalytics(false);
    }
  };

  const handleRunRetention = async () => {
    setRunningRetention(true);
    try {
      const res = await apiRequest("POST", "/api/admin/run-retention");
      const data = await res.json();
      toast({ title: t("Data retention completed"), description: `Removed ${data.articlesRemoved || 0} articles` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-health"] });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    } finally {
      setRunningRetention(false);
    }
  };

  const handleCreateApiKey = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/api-keys", {
        name: keyForm.name,
        scopes: keyForm.scopes.split(",").map(s => s.trim()),
        rateLimit: parseInt(keyForm.rateLimit) || 100,
      });
      const data = await res.json();
      setNewlyCreatedKey(data.rawKey);
      setShowCreateKey(false);
      setKeyForm({ name: "", scopes: "articles:read,analytics:read", rateLimit: "100" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: t("API key created") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDeactivateKey = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/admin/api-keys/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: t("API key deactivated") });
    } catch (err: any) {
      toast({ title: t("Error"), description: err.message, variant: "destructive" });
    }
  };

  const subTabs = [
    { key: "health" as const, label: t("System Health"), icon: Activity },
    { key: "errors" as const, label: t("System Errors"), icon: AlertTriangle },
    { key: "apikeys" as const, label: t("API Keys"), icon: Key },
    { key: "logs" as const, label: t("Audit Logs"), icon: Clock },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <TabInfo description="View system logs, audit trail, processing queue status, and recent errors. Monitor platform operations and troubleshoot issues." />
        {subTabs.map(st => (
          <Button
            key={st.key}
            variant={subTab === st.key ? "default" : "outline"}
            size="sm"
            onClick={() => setSubTab(st.key)}
            data-testid={`button-subtab-${st.key}`}
          >
            <st.icon className="w-4 h-4 mr-1" />
            {st.label}
          </Button>
        ))}
      </div>

      {subTab === "health" && (
        <div className="space-y-6">
          {healthLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {healthCards.map(card => (
                <Card key={card.label} data-testid={`card-health-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {queueStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Processing Queue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-500">{queueStats.pending}</p>
                    <p className="text-xs text-muted-foreground">{t("Pending")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-500">{queueStats.processing}</p>
                    <p className="text-xs text-muted-foreground">{t("Processing")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">{queueStats.completed}</p>
                    <p className="text-xs text-muted-foreground">{t("Completed")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">{queueStats.failed}</p>
                    <p className="text-xs text-muted-foreground">{t("Failed")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleComputeAnalytics} disabled={computingAnalytics} data-testid="button-compute-analytics">
              <RefreshCw className={`w-4 h-4 mr-1 ${computingAnalytics ? "animate-spin" : ""}`} />
              {t("Compute Analytics")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRunRetention} disabled={runningRetention} data-testid="button-run-retention">
              <Trash2 className={`w-4 h-4 mr-1 ${runningRetention ? "animate-spin" : ""}`} />
              {t("Run Data Retention")}
            </Button>
          </div>
        </div>
      )}

      {subTab === "errors" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Recent System Errors")}</CardTitle>
            <CardDescription>{t("Errors logged by background workers and system components")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!systemErrors?.items?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p>{t("No system errors")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {systemErrors.items.map(err => (
                  <div key={err.id} className="border rounded-md p-3 space-y-1" data-testid={`error-${err.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge variant={err.severity === "critical" ? "destructive" : "secondary"}>
                        {err.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(err.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium">[{err.component}] {err.errorMessage}</p>
                    {err.stackTrace && (
                      <pre className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto max-h-24">{err.stackTrace}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {subTab === "apikeys" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{t("Partner API Keys")}</h3>
            <Button size="sm" onClick={() => setShowCreateKey(true)} data-testid="button-create-api-key">
              <Plus className="w-4 h-4 mr-1" /> {t("Create Key")}
            </Button>
          </div>

          {newlyCreatedKey && (
            <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">{t("New API key created! Copy it now - it won't be shown again.")}</p>
                <code className="block p-2 bg-muted rounded text-xs break-all" data-testid="text-new-api-key">{newlyCreatedKey}</code>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(newlyCreatedKey);
                  toast({ title: t("Copied to clipboard") });
                }} data-testid="button-copy-api-key">{t("Copy")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setNewlyCreatedKey(null)} data-testid="button-dismiss-api-key">{t("Dismiss")}</Button>
              </CardContent>
            </Card>
          )}

          {!apiKeys?.length ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Key className="w-8 h-8 mx-auto mb-2" />
                <p>{t("No API keys created yet")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {apiKeys.map(key => (
                <Card key={key.id} data-testid={`card-apikey-${key.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="space-y-1">
                        <p className="font-medium">{key.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}...</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={key.active ? "secondary" : "outline"}>
                          {key.active ? t("Active") : t("Inactive")}
                        </Badge>
                        {key.active && (
                          <Button size="icon" variant="ghost" onClick={() => handleDeactivateKey(key.id)} data-testid={`button-deactivate-key-${key.id}`}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span>{t("Scopes")}: {key.scopes?.join(", ") || "none"}</span>
                      <span>{t("Rate")}: {key.rateLimit}/min</span>
                      {key.lastUsedAt && <span>{t("Last used")}: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                      {key.expiresAt && <span>{t("Expires")}: {new Date(key.expiresAt).toLocaleDateString()}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={showCreateKey} onOpenChange={setShowCreateKey}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Create API Key")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("Name")}</Label>
                  <Input value={keyForm.name} onChange={e => setKeyForm(f => ({ ...f, name: e.target.value }))} placeholder="Partner name" data-testid="input-apikey-name" />
                </div>
                <div className="space-y-2">
                  <Label>{t("Scopes")} ({t("comma-separated")})</Label>
                  <Input value={keyForm.scopes} onChange={e => setKeyForm(f => ({ ...f, scopes: e.target.value }))} data-testid="input-apikey-scopes" />
                </div>
                <div className="space-y-2">
                  <Label>{t("Rate Limit")} ({t("per minute")})</Label>
                  <Input type="number" value={keyForm.rateLimit} onChange={e => setKeyForm(f => ({ ...f, rateLimit: e.target.value }))} data-testid="input-apikey-rate-limit" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateKey(false)}>{t("Cancel")}</Button>
                <Button onClick={handleCreateApiKey} disabled={!keyForm.name} data-testid="button-save-apikey">{t("Create")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {subTab === "logs" && (
        <div>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Timestamp")}</TableHead>
                      <TableHead>{t("User")}</TableHead>
                      <TableHead>{t("Action")}</TableHead>
                      <TableHead>{t("Entity")}</TableHead>
                      <TableHead>{t("Details")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsData?.items?.map(log => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{log.username}</TableCell>
                        <TableCell><Badge variant="secondary">{log.action}</Badge></TableCell>
                        <TableCell>{log.entity}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">{log.details}</TableCell>
                      </TableRow>
                    ))}
                    {(!logsData?.items || logsData.items.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("No audit logs found")}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {logsData?.items?.map(log => (
                  <Card key={log.id} data-testid={`card-log-${log.id}`}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-sm">{log.username}</span>
                        <Badge variant="secondary">{log.action}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{log.entity}</p>
                      <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                      <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {t("Page")} {page + 1} {logsData?.total ? `/ ${Math.ceil(logsData.total / limit)}` : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-logs-prev">{t("Previous")}</Button>
                  <Button variant="outline" size="sm" disabled={!logsData?.items || logsData.items.length < limit} onClick={() => setPage(p => p + 1)} data-testid="button-logs-next">{t("Next")}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OperationsSummary() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: health } = useQuery<SystemHealth>({ queryKey: ["/api/admin/system-health"] });
  const { data: queueStats } = useQuery<QueueStats>({ queryKey: ["/api/admin/queue-stats"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/admin/clients"] });
  const { data: aiUsage } = useQuery<any>({ queryKey: ["/api/admin/ai-usage-summary"] });

  const hasErrors = (health?.failedSourcesCount ?? 0) > 0;
  const workerAge = health?.lastWorkerRun
    ? Math.round((Date.now() - new Date(health.lastWorkerRun).getTime()) / 60000)
    : null;
  const workerOk = workerAge !== null && workerAge < 30;

  const summaryCards = [
    {
      label: "Tenants",
      value: clients?.length ?? 0,
      sub: `${clients?.filter(c => c.active).length ?? 0} active`,
      color: "text-blue-500 dark:text-blue-400",
      bg: "bg-blue-500/10",
      icon: Users,
    },
    {
      label: "Queue",
      value: (queueStats?.pending ?? 0) + (queueStats?.processing ?? 0),
      sub: `${queueStats?.pending ?? 0} queued / ${queueStats?.processing ?? 0} running`,
      color: "text-amber-500 dark:text-amber-400",
      bg: "bg-amber-500/10",
      icon: Activity,
    },
    {
      label: "Completed",
      value: queueStats?.completed ?? 0,
      sub: `${queueStats?.failed ?? 0} failed`,
      color: (queueStats?.failed ?? 0) > 0 ? "text-red-500 dark:text-red-400" : "text-green-500 dark:text-green-400",
      bg: (queueStats?.failed ?? 0) > 0 ? "bg-red-500/10" : "bg-green-500/10",
      icon: (queueStats?.failed ?? 0) > 0 ? AlertTriangle : CheckCircle,
    },
    {
      label: "Workers",
      value: workerOk ? "Healthy" : workerAge !== null ? `${workerAge}m ago` : "Unknown",
      sub: hasErrors ? `${health?.failedSourcesCount} source errors` : "No issues",
      color: workerOk ? "text-green-500 dark:text-green-400" : "text-amber-500 dark:text-amber-400",
      bg: workerOk ? "bg-green-500/10" : "bg-amber-500/10",
      icon: workerOk ? CheckCircle : Clock,
    },
  ];

  const quickActions = [
    { label: "Manage Tenants", href: "/users", icon: Users },
    { label: "Queue Monitor", href: "/admin/ops", icon: Activity },
    { label: "Source Health", href: "/sources/health", icon: Server },
    { label: "Audit Logs", href: "/admin/dashboard", icon: Clock, tab: "logs" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{card.label}</p>
                  <p className={`text-xl font-bold tabular-nums mt-0.5 ${card.color}`} data-testid={`metric-ops-${card.label.toLowerCase()}`}>
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
                <div className={`p-2 rounded-md ${card.bg}`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground mr-1">Quick actions:</span>
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            onClick={() => setLocation(action.href)}
            data-testid={`button-quick-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <action.icon className="w-3.5 h-3.5 mr-1.5" />
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t("Access Denied")}</h2>
        <p className="text-muted-foreground">{t("You need admin privileges to access this page.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-admin-dashboard-title">
          Control Center
        </h1>
        <p className="text-sm text-muted-foreground">Platform operations and management</p>
      </div>

      <OperationsSummary />

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="sources" className="flex-1 min-w-[100px] gap-1" data-testid="tab-sources">
            <Database className="w-4 h-4" />
            <span className="hidden sm:inline">{t("Sources")}</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex-1 min-w-[100px] gap-1" data-testid="tab-clients">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">{t("Clients")}</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-1 min-w-[100px] gap-1" data-testid="tab-users">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{t("Users")}</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 min-w-[100px] gap-1" data-testid="tab-settings">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">{t("Settings")}</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex-1 min-w-[100px] gap-1" data-testid="tab-logs">
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">{t("Logs & Health")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <SourcesTab />
        </TabsContent>
        <TabsContent value="clients">
          <ClientsTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="logs">
          <LogsHealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
