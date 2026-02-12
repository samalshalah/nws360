import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  MessageSquare,
  FileText,
  CheckSquare,
  BookOpen,
  Users,
  Eye,
  Bell,
  Activity,
  Tag,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

function DiscussionsTab() {
  const { toast } = useToast();
  const [targetType, setTargetType] = useState("article");
  const [targetId, setTargetId] = useState("1");
  const [viewType, setViewType] = useState("article");
  const [viewId, setViewId] = useState("1");
  const [message, setMessage] = useState("");

  const { data: comments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/comments", viewType, viewId],
    enabled: !!viewId && parseInt(viewId) > 0,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/collaboration/comments", {
        targetType,
        targetId: parseInt(targetId) || 1,
        message,
      }),
    onSuccess: () => {
      setViewType(targetType);
      setViewId(targetId);
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/comments", targetType, targetId] });
      setMessage("");
      toast({ title: "Comment posted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/comments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/comments", viewType, viewId] });
      toast({ title: "Comment deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold" data-testid="text-discussions-title">Discussions</h3>
        <p className="text-sm text-muted-foreground">Post comments and discuss articles, stories, or entities with your team</p>
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <Label>Target Type</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger data-testid="select-discussion-target-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="entity">Entity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[80px]">
              <Label>Target ID</Label>
              <Input data-testid="input-discussion-target-id" value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea data-testid="input-discussion-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your comment..." />
          </div>
          <Button data-testid="button-post-comment" onClick={() => createMut.mutate()} disabled={!message || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Post Comment
          </Button>
        </CardContent>
      </Card>

      {(!comments || comments.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-comments">No comments yet. Start a discussion above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {comments.map((c: any) => (
            <Card key={c.id} data-testid={`card-comment-${c.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-sm" data-testid={`text-comment-message-${c.id}`}>{c.message}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{c.targetType}</Badge>
                      <span className="text-xs text-muted-foreground">Target #{c.targetId}</span>
                      {c.createdAt && <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-comment-${c.id}`} onClick={() => deleteMut.mutate(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTab() {
  const { toast } = useToast();
  const [targetType, setTargetType] = useState("article");
  const [targetId, setTargetId] = useState("1");
  const [viewType, setViewType] = useState("article");
  const [viewId, setViewId] = useState("1");
  const [noteType, setNoteType] = useState("observation");
  const [content, setContent] = useState("");

  const NOTE_TYPES = ["observation", "warning", "hypothesis", "conclusion"];

  const { data: annotations, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/annotations", viewType, viewId],
    enabled: !!viewId && parseInt(viewId) > 0,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/collaboration/annotations", {
        targetType,
        targetId: parseInt(targetId) || 1,
        noteType,
        content,
      }),
    onSuccess: () => {
      setViewType(targetType);
      setViewId(targetId);
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/annotations", targetType, targetId] });
      setContent("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/annotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/annotations", viewType, viewId] });
      toast({ title: "Note deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold" data-testid="text-notes-title">Notes & Annotations</h3>
        <p className="text-sm text-muted-foreground">Add observations, warnings, hypotheses, and conclusions to targets</p>
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <Label>Target Type</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger data-testid="select-note-target-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="entity">Entity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[80px]">
              <Label>Target ID</Label>
              <Input data-testid="input-note-target-id" value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Note Type</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {NOTE_TYPES.map(nt => (
                <Badge
                  key={nt}
                  data-testid={`badge-note-type-${nt}`}
                  className={`cursor-pointer toggle-elevate ${noteType === nt ? "toggle-elevated bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setNoteType(nt)}
                >
                  {noteType === nt && <Check className="w-3 h-3 mr-1" />}
                  {nt.charAt(0).toUpperCase() + nt.slice(1)}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label>Content</Label>
            <Textarea data-testid="input-note-content" value={content} onChange={e => setContent(e.target.value)} placeholder="Write your note..." />
          </div>
          <Button data-testid="button-add-note" onClick={() => createMut.mutate()} disabled={!content || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Note
          </Button>
        </CardContent>
      </Card>

      {(!annotations || annotations.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-notes">No annotations yet. Add a note above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {annotations.map((a: any) => (
            <Card key={a.id} data-testid={`card-annotation-${a.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="capitalize text-xs">{a.noteType}</Badge>
                      <Badge variant="outline" className="text-xs">{a.targetType}</Badge>
                      <span className="text-xs text-muted-foreground">Target #{a.targetId}</span>
                    </div>
                    <p className="text-sm" data-testid={`text-annotation-content-${a.id}`}>{a.content}</p>
                    {a.createdAt && <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-annotation-${a.id}`} onClick={() => deleteMut.mutate(a.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TasksTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [relatedTargetType, setRelatedTargetType] = useState("");
  const [relatedTargetId, setRelatedTargetId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/tasks"],
  });

  const { data: teamMembers } = useQuery<any[]>({
    queryKey: ["/api/collaboration/team-members"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/collaboration/tasks", {
        title,
        description,
        priority,
        assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
        relatedTargetType: relatedTargetType || undefined,
        relatedTargetId: relatedTargetId ? parseInt(relatedTargetId) : undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tasks"] });
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssignedTo("");
      setRelatedTargetType("");
      setRelatedTargetId("");
      setDueDate("");
      toast({ title: "Task created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/collaboration/tasks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tasks"] });
      toast({ title: "Task updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tasks"] });
      toast({ title: "Task deleted" });
    },
  });

  const statusBadgeVariant = (status: string) => {
    if (status === "open") return "secondary" as const;
    if (status === "in_progress") return "default" as const;
    return "outline" as const;
  };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-tasks-title">Tasks</h3>
          <p className="text-sm text-muted-foreground">Create, assign, and track investigation tasks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-task"><Plus className="w-4 h-4 mr-2" />Add Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input data-testid="input-task-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea data-testid="input-task-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Task details..." />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-task-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign To</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger data-testid="select-task-assignee"><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    {(teamMembers || []).map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.displayName || m.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[120px]">
                  <Label>Related Target Type</Label>
                  <Select value={relatedTargetType} onValueChange={setRelatedTargetType}>
                    <SelectTrigger data-testid="select-task-related-type"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="article">Article</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="entity">Entity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[80px]">
                  <Label>Related Target ID</Label>
                  <Input data-testid="input-task-related-id" value={relatedTargetId} onChange={e => setRelatedTargetId(e.target.value)} placeholder="ID" />
                </div>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input data-testid="input-task-due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <Button data-testid="button-create-task" onClick={() => createMut.mutate()} disabled={!title || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!tasks || tasks.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-tasks">No tasks yet. Create one to start tracking work.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((t: any) => (
            <Card key={t.id} data-testid={`card-task-${t.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-task-title-${t.id}`}>{t.title}</span>
                      <Badge variant={statusBadgeVariant(t.status)} data-testid={`badge-task-status-${t.id}`}>{t.status?.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className="capitalize text-xs">{t.priority}</Badge>
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.dueDate && <span className="text-xs text-muted-foreground">Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
                      {t.relatedTargetType && <Badge variant="outline" className="text-xs">{t.relatedTargetType} #{t.relatedTargetId}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Select value={t.status} onValueChange={(val) => updateStatusMut.mutate({ id: t.id, status: val })}>
                      <SelectTrigger data-testid={`select-task-status-${t.id}`} className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" data-testid={`button-delete-task-${t.id}`} onClick={() => deleteMut.mutate(t.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: reports, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/reports"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collaboration/reports", { title, summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/reports"] });
      setDialogOpen(false);
      setTitle("");
      setSummary("");
      toast({ title: "Report created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/reports"] });
      toast({ title: "Report deleted" });
    },
  });

  const copyShareLink = (report: any) => {
    const link = window.location.origin + "/api/shared-report/" + report.shareToken;
    navigator.clipboard.writeText(link);
    setCopiedId(report.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Share link copied" });
  };

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-briefings-title">Briefings & Reports</h3>
          <p className="text-sm text-muted-foreground">Create and share intelligence reports with your team</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-report"><Plus className="w-4 h-4 mr-2" />Create Report</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Report</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input data-testid="input-report-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Report title" />
              </div>
              <div>
                <Label>Summary</Label>
                <Textarea data-testid="input-report-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Write report summary..." />
              </div>
              <Button data-testid="button-create-report" onClick={() => createMut.mutate()} disabled={!title || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!reports || reports.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-reports">No reports yet. Create one to share intelligence.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r: any) => (
            <Card key={r.id} data-testid={`card-report-${r.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-report-title-${r.id}`}>{r.title}</span>
                      <Badge variant={r.status === "published" ? "default" : "secondary"} data-testid={`badge-report-status-${r.id}`}>{r.status || "draft"}</Badge>
                    </div>
                    {r.summary && <p className="text-sm text-muted-foreground">{r.summary}</p>}
                    {r.createdAt && <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {r.shareToken && (
                      <Button size="icon" variant="ghost" data-testid={`button-copy-share-${r.id}`} onClick={() => copyShareLink(r)}>
                        {copiedId === r.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" data-testid={`button-delete-report-${r.id}`} onClick={() => deleteMut.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspacesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: workspaces, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/workspaces"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collaboration/workspaces", { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/workspaces"] });
      setDialogOpen(false);
      setName("");
      setDescription("");
      toast({ title: "Workspace created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/workspaces/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/workspaces"] });
      toast({ title: "Workspace deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-workspaces-title">Workspaces</h3>
          <p className="text-sm text-muted-foreground">Organize your team into shared workspaces</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-workspace"><Plus className="w-4 h-4 mr-2" />Create Workspace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Workspace</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input data-testid="input-workspace-name" value={name} onChange={e => setName(e.target.value)} placeholder="Workspace name" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea data-testid="input-workspace-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this workspace for?" />
              </div>
              <Button data-testid="button-create-workspace" onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Workspace
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!workspaces || workspaces.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-workspaces">No workspaces yet. Create one to organize your team.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {workspaces.map((w: any) => (
            <Card key={w.id} data-testid={`card-workspace-${w.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <span className="font-medium" data-testid={`text-workspace-name-${w.id}`}>{w.name}</span>
                    {w.description && <p className="text-sm text-muted-foreground">{w.description}</p>}
                    {w.createdAt && <span className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-workspace-${w.id}`} onClick={() => deleteMut.mutate(w.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entityOrTopic, setEntityOrTopic] = useState("");
  const [targetType, setTargetType] = useState("entity");

  const { data: watchlists, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/watchlists"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collaboration/watchlists", { entityOrTopic, targetType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/watchlists"] });
      setDialogOpen(false);
      setEntityOrTopic("");
      toast({ title: "Watchlist item added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/watchlists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/watchlists"] });
      toast({ title: "Watchlist item removed" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-watchlists-title">Watchlists</h3>
          <p className="text-sm text-muted-foreground">Track entities and topics of interest</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-watchlist"><Plus className="w-4 h-4 mr-2" />Add to Watchlist</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Watchlist Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Entity or Topic</Label>
                <Input data-testid="input-watchlist-entity" value={entityOrTopic} onChange={e => setEntityOrTopic(e.target.value)} placeholder="Enter entity or topic name" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger data-testid="select-watchlist-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entity">Entity</SelectItem>
                    <SelectItem value="topic">Topic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button data-testid="button-create-watchlist" onClick={() => createMut.mutate()} disabled={!entityOrTopic || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Add Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!watchlists || watchlists.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-watchlists">No watchlist items. Add entities or topics to track.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {watchlists.map((w: any) => (
            <Card key={w.id} data-testid={`card-watchlist-${w.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium" data-testid={`text-watchlist-name-${w.id}`}>{w.entityOrTopic}</span>
                    <Badge variant="outline" className="capitalize text-xs">{w.targetType}</Badge>
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-watchlist-${w.id}`} onClick={() => deleteMut.mutate(w.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receiverId, setReceiverId] = useState("");
  const [message, setMessage] = useState("");

  const { data: alerts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/alerts"],
  });

  const { data: teamMembers } = useQuery<any[]>({
    queryKey: ["/api/collaboration/team-members"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/collaboration/alerts", {
        receiverId: parseInt(receiverId),
        message,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/alerts"] });
      setDialogOpen(false);
      setReceiverId("");
      setMessage("");
      toast({ title: "Alert sent" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markReadMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/collaboration/alerts/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/alerts"] });
      toast({ title: "Alert marked as read" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-alerts-title">Alerts</h3>
          <p className="text-sm text-muted-foreground">Send and receive alerts from team members</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-send-alert"><Plus className="w-4 h-4 mr-2" />Send Alert</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Alert</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Recipient</Label>
                <Select value={receiverId} onValueChange={setReceiverId}>
                  <SelectTrigger data-testid="select-alert-receiver"><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    {(teamMembers || []).map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.displayName || m.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message</Label>
                <Textarea data-testid="input-alert-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Alert message..." />
              </div>
              <Button data-testid="button-create-alert" onClick={() => createMut.mutate()} disabled={!receiverId || !message || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Send Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!alerts || alerts.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-alerts">No alerts received. Send one to a team member.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any) => (
            <Card key={a.id} data-testid={`card-alert-${a.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={a.read ? "outline" : "default"} data-testid={`badge-alert-status-${a.id}`}>{a.read ? "Read" : "Unread"}</Badge>
                      {a.createdAt && <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>}
                    </div>
                    <p className="text-sm" data-testid={`text-alert-message-${a.id}`}>{a.message}</p>
                  </div>
                  {!a.read && (
                    <Button variant="ghost" size="sm" data-testid={`button-mark-read-${a.id}`} onClick={() => markReadMut.mutate(a.id)}>
                      Mark Read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab() {
  const { data: activities, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/activity-feed"],
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold" data-testid="text-activity-title">Activity Feed</h3>
        <p className="text-sm text-muted-foreground">Recent actions and events across your team</p>
      </div>

      {(!activities || activities.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-activity">No activity recorded yet. Actions will appear here automatically.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {activities.map((a: any, idx: number) => (
            <Card key={a.id || idx} data-testid={`card-activity-${a.id || idx}`}>
              <CardContent className="py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <span className="text-sm font-medium" data-testid={`text-activity-verb-${a.id || idx}`}>{a.verb}</span>
                    <Badge variant="outline" className="text-xs">{a.targetType}</Badge>
                    {a.createdAt && <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TagsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");

  const { data: tags, isLoading } = useQuery<any[]>({
    queryKey: ["/api/collaboration/tags"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collaboration/tags", { name, color: color || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tags"] });
      setDialogOpen(false);
      setName("");
      setColor("");
      toast({ title: "Tag created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaboration/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tags"] });
      toast({ title: "Tag deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-tags-title">Tags</h3>
          <p className="text-sm text-muted-foreground">Create and manage tags for organizing content</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-tag"><Plus className="w-4 h-4 mr-2" />Create Tag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Tag</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input data-testid="input-tag-name" value={name} onChange={e => setName(e.target.value)} placeholder="Tag name" />
              </div>
              <div>
                <Label>Color (optional hex)</Label>
                <Input data-testid="input-tag-color" value={color} onChange={e => setColor(e.target.value)} placeholder="#3b82f6" />
              </div>
              <Button data-testid="button-create-tag" onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Tag
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!tags || tags.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-tags">No tags created. Add tags to organize your content.</CardContent></Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map((t: any) => (
            <Card key={t.id} data-testid={`card-tag-${t.id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {t.color && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                  <span className="text-sm font-medium" data-testid={`text-tag-name-${t.id}`}>{t.name}</span>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-tag-${t.id}`} onClick={() => deleteMut.mutate(t.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Collaboration() {
  return (
    <div className="space-y-6" data-testid="page-collaboration">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Team Collaboration</h1>
        <p className="text-muted-foreground mt-1">Discuss, annotate, track tasks, and build shared intelligence across your team</p>
      </div>
      <Tabs defaultValue="discussions" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="discussions" data-testid="tab-discussions"><MessageSquare className="w-4 h-4 mr-1" />Discussions</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes"><FileText className="w-4 h-4 mr-1" />Notes</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks"><CheckSquare className="w-4 h-4 mr-1" />Tasks</TabsTrigger>
          <TabsTrigger value="briefings" data-testid="tab-briefings"><BookOpen className="w-4 h-4 mr-1" />Briefings</TabsTrigger>
          <TabsTrigger value="workspaces" data-testid="tab-workspaces"><Users className="w-4 h-4 mr-1" />Workspaces</TabsTrigger>
          <TabsTrigger value="watchlists" data-testid="tab-watchlists"><Eye className="w-4 h-4 mr-1" />Watchlists</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts"><Bell className="w-4 h-4 mr-1" />Alerts</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity"><Activity className="w-4 h-4 mr-1" />Activity</TabsTrigger>
          <TabsTrigger value="tags" data-testid="tab-tags"><Tag className="w-4 h-4 mr-1" />Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="discussions"><DiscussionsTab /></TabsContent>
        <TabsContent value="notes"><NotesTab /></TabsContent>
        <TabsContent value="tasks"><TasksTab /></TabsContent>
        <TabsContent value="briefings"><BriefingsTab /></TabsContent>
        <TabsContent value="workspaces"><WorkspacesTab /></TabsContent>
        <TabsContent value="watchlists"><WatchlistsTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="tags"><TagsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
