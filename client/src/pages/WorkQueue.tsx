import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckSquare, Clock, Loader2, Plus, RefreshCw, Search, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CAPS } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type TaskStatus = "open" | "in_progress" | "resolved";
type TaskPriority = "low" | "medium" | "high" | "critical";
type TargetType = "none" | "article" | "story" | "report" | "timeline" | "workspace" | "task";

type TaskRecord = {
  id: number;
  workspaceId: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  createdBy: number;
  assignedTo: number | null;
  relatedTargetType: string | null;
  relatedTargetId: number | null;
  dueDate: string | null;
  clientId: number;
  createdAt: string | null;
};

type TeamMember = {
  id: number;
  username: string;
  role: string;
};

type TaskForm = {
  title: string;
  description: string;
  priority: TaskPriority;
  assignedTo: string;
  dueDate: string;
  relatedTargetType: TargetType;
  relatedTargetId: string;
};

const INITIAL_FORM: TaskForm = {
  title: "",
  description: "",
  priority: "medium",
  assignedTo: "unassigned",
  dueDate: "",
  relatedTargetType: "none",
  relatedTargetId: "",
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function memberName(memberId: number | null | undefined, members: TeamMember[]) {
  if (!memberId) return "Unassigned";
  return members.find(member => member.id === memberId)?.username || `User #${memberId}`;
}

function dueState(task: TaskRecord): "none" | "overdue" | "today" | "upcoming" {
  if (!task.dueDate || task.status === "resolved") return "none";
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return "none";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  if (due < startToday) return "overdue";
  if (due < startTomorrow) return "today";
  return "upcoming";
}

function taskPayload(form: TaskForm) {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    priority: form.priority,
    assignedTo: form.assignedTo !== "unassigned" ? Number(form.assignedTo) : null,
    dueDate: form.dueDate || null,
  };
  if (form.relatedTargetType !== "none" && form.relatedTargetId.trim()) {
    payload.relatedTargetType = form.relatedTargetType;
    payload.relatedTargetId = Number(form.relatedTargetId);
  }
  return payload;
}

export default function WorkQueue() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasCap, authContext } = usePermissions();
  const canManageTasks = hasCap(CAPS.COLLAB_TASKS);
  const currentUserId = authContext?.user?.id;
  const [form, setForm] = useState<TaskForm>(INITIAL_FORM);
  const [statusFilter, setStatusFilter] = useState("active");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: tasks = [], isLoading, isFetching, refetch } = useQuery<TaskRecord[]>({
    queryKey: ["/api/collaboration/tasks"],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/collaboration/team-members"],
  });

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/activity-feed"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = taskPayload(form);
      if (!String(payload.title || "").trim()) throw new Error("Task title is required");
      const res = await apiRequest("POST", "/api/collaboration/tasks", payload);
      return res.json() as Promise<TaskRecord>;
    },
    onSuccess: () => {
      invalidateTasks();
      setForm(INITIAL_FORM);
      toast({ title: t("workQueue.created", "Task created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<TaskRecord> }) => {
      const res = await apiRequest("PATCH", `/api/collaboration/tasks/${id}`, updates);
      return res.json() as Promise<TaskRecord>;
    },
    onSuccess: invalidateTasks,
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/tasks/${id}`);
    },
    onSuccess: invalidateTasks,
  });

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks
      .filter(task => {
        if (statusFilter === "active" && task.status === "resolved") return false;
        if (statusFilter !== "all" && statusFilter !== "active" && task.status !== statusFilter) return false;
        if (assigneeFilter === "mine" && task.assignedTo !== currentUserId) return false;
        if (assigneeFilter === "unassigned" && task.assignedTo) return false;
        if (assigneeFilter !== "all" && assigneeFilter !== "mine" && assigneeFilter !== "unassigned" && task.assignedTo !== Number(assigneeFilter)) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        if (!query) return true;
        const haystack = `${task.title} ${task.description || ""} ${task.relatedTargetType || ""} ${task.relatedTargetId || ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (a.status !== "resolved" && b.status === "resolved") return -1;
        if (a.status === "resolved" && b.status !== "resolved") return 1;
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        const priorityA = PRIORITY_WEIGHT[(a.priority || "medium") as TaskPriority] || 2;
        const priorityB = PRIORITY_WEIGHT[(b.priority || "medium") as TaskPriority] || 2;
        if (priorityA !== priorityB) return priorityB - priorityA;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [assigneeFilter, currentUserId, priorityFilter, search, statusFilter, tasks]);

  const totals = useMemo(() => {
    const open = tasks.filter(task => task.status === "open").length;
    const inProgress = tasks.filter(task => task.status === "in_progress").length;
    const resolved = tasks.filter(task => task.status === "resolved").length;
    const overdue = tasks.filter(task => dueState(task) === "overdue").length;
    return { open, inProgress, resolved, overdue };
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-md" />)}
        </div>
        <Skeleton className="h-80 rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-work-queue-title">
              {t("workQueue.title", "Work Queue")}
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("workQueue.subtitle", "Assign follow-up work, track investigations, and keep article review moving inside the tenant workspace.")}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-work-queue">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">{t("common.refresh", "Refresh")}</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("workQueue.open", "Open")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.open}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("workQueue.inProgress", "In progress")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.inProgress}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("workQueue.overdue", "Overdue")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.overdue}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("workQueue.resolved", "Resolved")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.resolved}</p>
        </div>
      </div>

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            {t("workQueue.newTask", "New Task")}
          </CardTitle>
          <CardDescription>{t("workQueue.newTaskDescription", "Create a follow-up item for an article, report, workspace, or internal task.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-4">
              <Label htmlFor="task-title">{t("workQueue.taskTitle", "Task title")}</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(event) => setForm(current => ({ ...current, title: event.target.value }))}
                disabled={!canManageTasks}
                data-testid="input-work-queue-title"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t("workQueue.priority", "Priority")}</Label>
              <Select value={form.priority} onValueChange={(value) => setForm(current => ({ ...current, priority: value as TaskPriority }))} disabled={!canManageTasks}>
                <SelectTrigger data-testid="select-work-queue-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label>{t("workQueue.assignee", "Assignee")}</Label>
              <Select value={form.assignedTo} onValueChange={(value) => setForm(current => ({ ...current, assignedTo: value }))} disabled={!canManageTasks}>
                <SelectTrigger data-testid="select-work-queue-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label htmlFor="task-due-date">{t("workQueue.dueDate", "Due date")}</Label>
              <Input
                id="task-due-date"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm(current => ({ ...current, dueDate: event.target.value }))}
                disabled={!canManageTasks}
                data-testid="input-work-queue-due-date"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-3">
              <Label>{t("workQueue.relatedType", "Related type")}</Label>
              <Select value={form.relatedTargetType} onValueChange={(value) => setForm(current => ({ ...current, relatedTargetType: value as TargetType }))} disabled={!canManageTasks}>
                <SelectTrigger data-testid="select-work-queue-related-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="timeline">Timeline</SelectItem>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="task-related-id">{t("workQueue.relatedId", "Related ID")}</Label>
              <Input
                id="task-related-id"
                inputMode="numeric"
                value={form.relatedTargetId}
                onChange={(event) => setForm(current => ({ ...current, relatedTargetId: event.target.value.replace(/[^\d]/g, "") }))}
                disabled={!canManageTasks || form.relatedTargetType === "none"}
                data-testid="input-work-queue-related-id"
              />
            </div>
            <div className="space-y-2 lg:col-span-5">
              <Label htmlFor="task-description">{t("workQueue.description", "Description")}</Label>
              <Textarea
                id="task-description"
                value={form.description}
                onChange={(event) => setForm(current => ({ ...current, description: event.target.value }))}
                className="min-h-[42px]"
                disabled={!canManageTasks}
                data-testid="textarea-work-queue-description"
              />
            </div>
            <div className="flex items-end justify-end lg:col-span-2">
              <Button onClick={() => createMutation.mutate()} disabled={!canManageTasks || createMutation.isPending || !form.title.trim()} data-testid="button-create-work-queue-task">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">{t("common.create", "Create")}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-border/60 bg-card p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("workQueue.searchPlaceholder", "Search tasks")}
              className="h-9 pl-9"
              data-testid="input-search-work-queue"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 xl:w-[150px]" data-testid="select-work-queue-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 xl:w-[165px]" data-testid="select-work-queue-assignee-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="mine">My tasks</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {teamMembers.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9 xl:w-[145px]" data-testid="select-work-queue-priority-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredTasks.length > 0 ? (
        <div className="space-y-3" data-testid="list-work-queue-tasks">
          {filteredTasks.map(task => {
            const state = dueState(task);
            const priority = (task.priority || "medium") as TaskPriority;
            return (
              <div key={task.id} className="rounded-md border border-border/60 bg-card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-foreground">{task.title}</h2>
                      <Badge variant={task.status === "resolved" ? "outline" : task.status === "in_progress" ? "default" : "secondary"}>
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant={priority === "critical" || priority === "high" ? "destructive" : "outline"}>
                        {priority}
                      </Badge>
                      {state !== "none" && (
                        <Badge variant={state === "overdue" ? "destructive" : "secondary"}>
                          {state === "overdue" ? <AlertCircle className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                          {state === "today" ? "Due today" : state}
                        </Badge>
                      )}
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3.5 w-3.5" />
                        {memberName(task.assignedTo, teamMembers)}
                      </span>
                      {task.dueDate && <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>}
                      {task.relatedTargetType && task.relatedTargetId && (
                        <span className="capitalize">{task.relatedTargetType} #{task.relatedTargetId}</span>
                      )}
                      {task.createdAt && <span>Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={task.assignedTo ? String(task.assignedTo) : "unassigned"}
                      onValueChange={(value) => updateMutation.mutate({ id: task.id, updates: { assignedTo: value === "unassigned" ? null : Number(value) } as any })}
                      disabled={!canManageTasks || updateMutation.isPending}
                    >
                      <SelectTrigger className="h-9 w-[155px]" data-testid={`select-task-assignee-${task.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {teamMembers.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.username}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.status}
                      onValueChange={(value) => updateMutation.mutate({ id: task.id, updates: { status: value as TaskStatus } })}
                      disabled={!canManageTasks || updateMutation.isPending}
                    >
                      <SelectTrigger className="h-9 w-[135px]" data-testid={`select-task-status-${task.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                    {canManageTasks && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(t("workQueue.deleteConfirm", "Delete this task?"))) {
                            deleteMutation.mutate(task.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-work-queue-task-${task.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center" data-testid="empty-work-queue">
          <CheckSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <h2 className="text-base font-semibold text-foreground">{t("workQueue.emptyTitle", "No tasks in this view")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("workQueue.emptyBody", "Create a task or adjust the filters to see existing work.")}
          </p>
        </div>
      )}
    </div>
  );
}
