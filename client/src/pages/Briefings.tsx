import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type ReportStatus = "draft" | "review" | "published" | "archived";
type BriefingItemType = "article" | "note" | "heading" | "link";

type SharedReport = {
  id: number;
  clientId: number;
  workspaceId: number | null;
  title: string;
  summary: string | null;
  status: ReportStatus;
  createdBy: number;
  shareToken: string | null;
  lastUpdated: string | null;
  createdAt: string | null;
};

type BriefingItem = {
  id: number;
  reportId: number;
  itemType: BriefingItemType;
  itemRefId: number | null;
  content: string | null;
  position: number | null;
  createdAt: string | null;
};

type BriefingTemplateSection = {
  id?: number;
  itemType: Exclude<BriefingItemType, "article">;
  content: string;
  position: number;
};

type BriefingTemplate = {
  id: number;
  name: string;
  description: string | null;
  sections: BriefingTemplateSection[];
  createdAt: string | null;
  lastUpdated: string | null;
};

type BriefingFrequency = "realtime" | "daily" | "weekly" | "monthly";

type BriefingScheduleConfig = {
  label?: string | null;
  deliveryTime?: string;
  timezone?: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  reportId?: number | null;
  templateId?: number | null;
  notes?: string | null;
  lastDeliveryAttemptAt?: string | null;
  lastDeliveryStatus?: string | null;
  lastDeliveryError?: string | null;
  lastDeliveredAt?: string | null;
  lastDeliveryItemCount?: number | null;
};

type BriefingSchedule = {
  id: number;
  userId: number;
  clientId: number;
  email: string;
  topics: string[] | null;
  frequency: BriefingFrequency;
  sendAlerts: boolean | null;
  sendBriefing: boolean | null;
  sendWeeklySummary: boolean | null;
  customSchedule: BriefingScheduleConfig | null;
  active: boolean | null;
  createdAt: string | null;
};

type BriefingDeliveryStatus = {
  provider: {
    provider: string;
    configured: boolean;
    from: string | null;
    requiredEnv: string[];
  };
  automaticDeliveryEnabled: boolean;
};

type BriefingDeliveryPreview = {
  subject: string;
  text: string;
  itemCount: number;
  articleCount: number;
  sourceType: "report" | "template" | "latest";
  reportTitle?: string | null;
  provider: BriefingDeliveryStatus["provider"];
};

type BriefingDeliverySummary = {
  checked: number;
  sent: number;
  dryRun: number;
  skipped: number;
  providerMissing: number;
  failed: number;
  results: Array<{
    scheduleId: number;
    clientId: number;
    email: string;
    status: "sent" | "dry_run" | "provider_not_configured" | "failed" | "not_due";
    itemCount?: number;
    articleCount?: number;
    error?: string;
  }>;
};

type BriefingDeliveryHistoryItem = {
  id: number;
  status: string;
  dryRun: boolean;
  force: boolean;
  manual: boolean;
  scheduleId: number | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  runAt: string | null;
  error: string | null;
  summary: BriefingDeliverySummary;
};

type BriefingDeliveryHistoryResponse = {
  items: BriefingDeliveryHistoryItem[];
  total: number;
};

type ReportBasketResponse = {
  items: any[];
  total: number;
  page: number;
  limit: number;
};

const REPORTS_QUERY_KEY = ["/api/collaboration/reports"];
const BASKET_QUERY_KEY = ["/api/reports/basket", "sort=newest&limit=100"];
const TEMPLATES_QUERY_KEY = ["/api/collaboration/report-templates"];
const SCHEDULES_QUERY_KEY = ["/api/collaboration/briefing-schedules"];
const DELIVERY_STATUS_QUERY_KEY = ["/api/collaboration/briefing-delivery-status"];
const DELIVERY_HISTORY_QUERY_KEY = ["/api/collaboration/briefing-delivery-history"];

const DEFAULT_TEMPLATE_SECTIONS: BriefingTemplateSection[] = [
  { itemType: "heading", content: "Executive summary", position: 0 },
  { itemType: "note", content: "Key developments to watch", position: 1 },
  { itemType: "heading", content: "Source highlights", position: 2 },
  { itemType: "note", content: "Recommended follow-up", position: 3 },
];

const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  archived: "Archived",
};

const FREQUENCY_LABELS: Record<BriefingFrequency, string> = {
  realtime: "Real-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function reportStatusVariant(status: ReportStatus): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

function itemLabel(type: BriefingItemType) {
  if (type === "article") return "Article";
  if (type === "heading") return "Heading";
  if (type === "link") return "Link";
  return "Note";
}

function sourceName(article: any) {
  return article?.subSource || article?.source?.name || "Unknown source";
}

function articleDate(article: any) {
  const value = article?.publishedAt || article?.ingestedAt || article?.createdAt;
  if (!value) return "";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return "";
  }
}

function articleSnapshot(article: any) {
  return String(article?.summary || article?.contentClean || article?.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function splitTopicInput(value: string) {
  return Array.from(new Set(
    value
      .split(",")
      .map(topic => topic.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map(topic => topic.slice(0, 80)),
  )).slice(0, 30);
}

function getScheduleConfig(schedule: BriefingSchedule): BriefingScheduleConfig {
  return schedule.customSchedule && typeof schedule.customSchedule === "object"
    ? schedule.customSchedule
    : {};
}

function formatScheduleCadence(schedule: BriefingSchedule) {
  const config = getScheduleConfig(schedule);
  const time = config.deliveryTime || "08:00";
  const timezone = config.timezone || "Asia/Baghdad";
  if (schedule.frequency === "realtime") return "As matching news arrives";
  if (schedule.frequency === "weekly") {
    return `${WEEKDAY_LABELS[config.dayOfWeek ?? 0]} at ${time} ${timezone}`;
  }
  if (schedule.frequency === "monthly") {
    return `Day ${config.dayOfMonth ?? 1} at ${time} ${timezone}`;
  }
  return `${time} ${timezone}`;
}

function formatDeliverySummary(summary: BriefingDeliverySummary) {
  const parts = [
    summary.sent > 0 ? `${summary.sent} sent` : "",
    summary.dryRun > 0 ? `${summary.dryRun} test` : "",
    summary.providerMissing > 0 ? `${summary.providerMissing} provider missing` : "",
    summary.failed > 0 ? `${summary.failed} failed` : "",
    summary.skipped > 0 ? `${summary.skipped} skipped` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : `${summary.checked} checked`;
}

export default function Briefings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editStatus, setEditStatus] = useState<ReportStatus>("draft");
  const [itemType, setItemType] = useState<Exclude<BriefingItemType, "article">>("note");
  const [itemContent, setItemContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"txt" | "html" | "csv" | "json">("txt");
  const [exporting, setExporting] = useState(false);
  const [templateName, setTemplateName] = useState("Daily news brief");
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");
  const [scheduleLabel, setScheduleLabel] = useState("Daily briefing");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<BriefingFrequency>("daily");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduleTimezone, setScheduleTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad");
  const [scheduleTopics, setScheduleTopics] = useState("");
  const [scheduleSource, setScheduleSource] = useState<"current-report" | "selected-template" | "manual">("current-report");
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState("1");
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState("1");
  const [deliveryPreview, setDeliveryPreview] = useState<BriefingDeliveryPreview | null>(null);
  const [previewScheduleId, setPreviewScheduleId] = useState<number | null>(null);
  const [runScheduleId, setRunScheduleId] = useState<number | null>(null);
  const [deliveryRunResult, setDeliveryRunResult] = useState<BriefingDeliverySummary | null>(null);

  const {
    data: reports = [],
    isLoading: reportsLoading,
    isFetching: reportsFetching,
    refetch: refetchReports,
  } = useQuery<SharedReport[]>({
    queryKey: REPORTS_QUERY_KEY,
  });

  const { data: basket, isLoading: basketLoading, refetch: refetchBasket } = useQuery<ReportBasketResponse>({
    queryKey: BASKET_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/reports/basket?sort=newest&limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report basket");
      return res.json();
    },
  });

  const { data: templates = [], isLoading: templatesLoading, refetch: refetchTemplates } = useQuery<BriefingTemplate[]>({
    queryKey: TEMPLATES_QUERY_KEY,
  });

  const { data: schedules = [], isLoading: schedulesLoading, refetch: refetchSchedules } = useQuery<BriefingSchedule[]>({
    queryKey: SCHEDULES_QUERY_KEY,
  });

  const { data: deliveryStatus, refetch: refetchDeliveryStatus } = useQuery<BriefingDeliveryStatus>({
    queryKey: DELIVERY_STATUS_QUERY_KEY,
  });

  const { data: deliveryHistory, isLoading: deliveryHistoryLoading, refetch: refetchDeliveryHistory } = useQuery<BriefingDeliveryHistoryResponse>({
    queryKey: DELIVERY_HISTORY_QUERY_KEY,
  });

  const selectedReport = useMemo(
    () => reports.find(report => report.id === selectedReportId) || null,
    [reports, selectedReportId],
  );

  const selectedTemplate = useMemo(
    () => templates.find(template => String(template.id) === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );

  const itemsQueryKey = selectedReportId
    ? [`/api/collaboration/reports/${selectedReportId}/items`]
    : ["/api/collaboration/reports/none/items"];

  const {
    data: items = [],
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery<BriefingItem[]>({
    queryKey: itemsQueryKey,
    enabled: Boolean(selectedReportId),
  });

  const basketArticles = basket?.items || [];
  const articleMap = useMemo(
    () => new Map(basketArticles.map(article => [article.id, article])),
    [basketArticles],
  );

  const addedArticleIds = useMemo(
    () => new Set(items.filter(item => item.itemType === "article" && item.itemRefId).map(item => item.itemRefId as number)),
    [items],
  );

  const reusableItemCount = useMemo(
    () => items.filter(item => item.itemType !== "article" && Boolean(item.content?.trim())).length,
    [items],
  );

  const totals = useMemo(() => {
    const draft = reports.filter(report => report.status === "draft").length;
    const review = reports.filter(report => report.status === "review").length;
    const published = reports.filter(report => report.status === "published").length;
    return { draft, review, published };
  }, [reports]);

  const activeScheduleCount = useMemo(
    () => schedules.filter(schedule => schedule.active !== false).length,
    [schedules],
  );

  const scheduleTargetLabel = (schedule: BriefingSchedule) => {
    const config = getScheduleConfig(schedule);
    if (config.reportId) {
      return reports.find(report => report.id === config.reportId)?.title || `Briefing #${config.reportId}`;
    }
    if (config.templateId) {
      return templates.find(template => template.id === config.templateId)?.name || `Template #${config.templateId}`;
    }
    return t("briefings.manualScheduleTarget", "Manual briefing selection");
  };

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null);
      return;
    }
    if (!selectedReportId || !reports.some(report => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (!selectedReport) return;
    setEditTitle(selectedReport.title);
    setEditSummary(selectedReport.summary || "");
    setEditStatus(selectedReport.status || "draft");
    setCopied(false);
  }, [selectedReport]);

  useEffect(() => {
    if (scheduleSource === "current-report" && !selectedReport) {
      setScheduleSource("manual");
    }
    if (scheduleSource === "selected-template" && !selectedTemplate) {
      setScheduleSource("manual");
    }
  }, [scheduleSource, selectedReport, selectedTemplate]);

  const invalidateReports = () => {
    queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/activity-feed"] });
  };

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/activity-feed"] });
  };

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: DELIVERY_HISTORY_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/collaboration/activity-feed"] });
  };

  const invalidateItems = () => {
    if (selectedReportId) {
      queryClient.invalidateQueries({ queryKey: [`/api/collaboration/reports/${selectedReportId}/items`] });
    }
    invalidateReports();
  };

  const createReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collaboration/reports", {
        title: newTitle.trim(),
        summary: newSummary.trim() || null,
        status: "draft",
      });
      return res.json() as Promise<SharedReport>;
    },
    onSuccess: (report) => {
      invalidateReports();
      setSelectedReportId(report.id);
      setNewTitle("");
      setNewSummary("");
      toast({ title: t("briefings.created", "Briefing created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<SharedReport> }) => {
      const res = await apiRequest("PATCH", `/api/collaboration/reports/${id}`, updates);
      return res.json() as Promise<SharedReport>;
    },
    onSuccess: () => {
      invalidateReports();
      toast({ title: t("briefings.saved", "Briefing updated") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/reports/${id}`);
    },
    onSuccess: () => {
      invalidateReports();
      toast({ title: t("briefings.deleted", "Briefing deleted") });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (payload: { itemType: BriefingItemType; itemRefId?: number | null; content?: string | null; position?: number }) => {
      if (!selectedReportId) throw new Error("Select a briefing first");
      const res = await apiRequest("POST", `/api/collaboration/reports/${selectedReportId}/items`, payload);
      return res.json() as Promise<BriefingItem>;
    },
    onSuccess: () => {
      invalidateItems();
      setItemContent("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/reports/items/${id}`);
    },
    onSuccess: invalidateItems,
  });

  const bulkAddMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReportId) throw new Error("Select a briefing first");
      const candidates = basketArticles.filter(article => !addedArticleIds.has(article.id));
      const startPosition = items.length;
      for (let index = 0; index < candidates.length; index += 1) {
        const article = candidates[index];
        await apiRequest("POST", `/api/collaboration/reports/${selectedReportId}/items`, {
          itemType: "article",
          itemRefId: article.id,
          content: articleSnapshot(article),
          position: startPosition + index,
        });
      }
      return candidates.length;
    },
    onSuccess: (count) => {
      invalidateItems();
      toast({ title: t("briefings.bulkAdded", "{{count}} articles added", { count }) });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collaboration/report-templates", {
        name: templateName.trim(),
        description: "Reusable briefing structure",
        sections: DEFAULT_TEMPLATE_SECTIONS,
      });
      return res.json() as Promise<BriefingTemplate>;
    },
    onSuccess: (template) => {
      invalidateTemplates();
      setSelectedTemplateId(String(template.id));
      toast({ title: t("briefings.templateCreated", "Template created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const saveCurrentAsTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReport) throw new Error("Select a briefing first");
      const res = await apiRequest("POST", "/api/collaboration/report-templates/from-report", {
        reportId: selectedReport.id,
        name: templateName.trim() || `${selectedReport.title} template`,
        description: editSummary.trim() || selectedReport.summary || null,
      });
      return res.json() as Promise<BriefingTemplate>;
    },
    onSuccess: (template) => {
      invalidateTemplates();
      setSelectedTemplateId(String(template.id));
      toast({ title: t("briefings.templateSaved", "Template saved") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("briefings.templateFailed", "Template failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Select a template first");
      const res = await apiRequest("POST", "/api/collaboration/reports/from-template", {
        templateId: selectedTemplate.id,
        title: newTitle.trim() || `${selectedTemplate.name} - ${new Date().toISOString().slice(0, 10)}`,
        summary: newSummary.trim() || selectedTemplate.description || null,
      });
      return res.json() as Promise<SharedReport>;
    },
    onSuccess: (report) => {
      invalidateReports();
      queryClient.invalidateQueries({ queryKey: [`/api/collaboration/reports/${report.id}/items`] });
      setSelectedReportId(report.id);
      setNewTitle("");
      setNewSummary("");
      toast({ title: t("briefings.createdFromTemplate", "Briefing created from template") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error", "Error"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/report-templates/${id}`);
    },
    onSuccess: () => {
      invalidateTemplates();
      setSelectedTemplateId("none");
      toast({ title: t("briefings.templateDeleted", "Template deleted") });
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      const customSchedule: BriefingScheduleConfig = {
        label: scheduleLabel.trim(),
        deliveryTime: scheduleTime,
        timezone: scheduleTimezone.trim() || "Asia/Baghdad",
      };
      if (scheduleFrequency === "weekly") {
        customSchedule.dayOfWeek = Number(scheduleDayOfWeek);
      }
      if (scheduleFrequency === "monthly") {
        customSchedule.dayOfMonth = Number(scheduleDayOfMonth);
      }
      if (scheduleSource === "current-report" && selectedReport) {
        customSchedule.reportId = selectedReport.id;
      }
      if (scheduleSource === "selected-template" && selectedTemplate) {
        customSchedule.templateId = selectedTemplate.id;
      }
      const res = await apiRequest("POST", "/api/collaboration/briefing-schedules", {
        email: scheduleEmail.trim(),
        topics: splitTopicInput(scheduleTopics),
        frequency: scheduleFrequency,
        sendAlerts: false,
        sendBriefing: true,
        sendWeeklySummary: scheduleFrequency === "weekly",
        customSchedule,
        active: true,
      });
      return res.json() as Promise<BriefingSchedule>;
    },
    onSuccess: () => {
      invalidateSchedules();
      setScheduleEmail("");
      setScheduleTopics("");
      toast({ title: t("briefings.scheduleCreated", "Schedule created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("briefings.scheduleFailed", "Schedule failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<BriefingSchedule> }) => {
      const res = await apiRequest("PATCH", `/api/collaboration/briefing-schedules/${id}`, updates);
      return res.json() as Promise<BriefingSchedule>;
    },
    onSuccess: invalidateSchedules,
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("briefings.scheduleFailed", "Schedule failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration/briefing-schedules/${id}`);
    },
    onSuccess: () => {
      invalidateSchedules();
      toast({ title: t("briefings.scheduleDeleted", "Schedule deleted") });
    },
  });

  const previewDeliveryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/collaboration/briefing-schedules/${id}/preview-delivery`, {});
      return res.json() as Promise<BriefingDeliveryPreview>;
    },
    onMutate: (id) => {
      setPreviewScheduleId(id);
    },
    onSuccess: (preview, id) => {
      setPreviewScheduleId(id);
      setDeliveryPreview(preview);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("briefings.previewFailed", "Preview failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
  });

  const runDeliveryMutation = useMutation({
    mutationFn: async ({ id, dryRun }: { id: number; dryRun: boolean }) => {
      const res = await apiRequest("POST", `/api/collaboration/briefing-schedules/${id}/run-delivery`, {
        dryRun,
        force: true,
      });
      return res.json() as Promise<BriefingDeliverySummary & { jobId: number }>;
    },
    onMutate: ({ id }) => {
      setRunScheduleId(id);
    },
    onSuccess: (result, variables) => {
      setDeliveryRunResult(result);
      queryClient.invalidateQueries({ queryKey: DELIVERY_HISTORY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      toast({
        title: variables.dryRun
          ? t("briefings.deliveryTestRecorded", "Delivery test recorded")
          : t("briefings.deliveryRunRecorded", "Delivery run recorded"),
        description: formatDeliverySummary(result),
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("briefings.deliveryRunFailed", "Delivery run failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    },
    onSettled: () => {
      setRunScheduleId(null);
    },
  });

  const saveSelectedReport = () => {
    if (!selectedReport) return;
    updateReportMutation.mutate({
      id: selectedReport.id,
      updates: {
        title: editTitle.trim(),
        summary: editSummary.trim() || null,
        status: editStatus,
      } as any,
    });
  };

  const addTextItem = () => {
    if (!itemContent.trim()) return;
    addItemMutation.mutate({
      itemType,
      content: itemContent.trim(),
      position: items.length,
    });
  };

  const addArticle = (article: any) => {
    addItemMutation.mutate({
      itemType: "article",
      itemRefId: article.id,
      content: articleSnapshot(article),
      position: items.length,
    });
  };

  const copyShareLink = async () => {
    if (!selectedReport?.shareToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/shared-report/${selectedReport.shareToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t("briefings.shareCopied", "Share link copied") });
  };

  const exportBriefing = async () => {
    if (!selectedReport) return;
    try {
      setExporting(true);
      const res = await fetch(`/api/collaboration/reports/${selectedReport.id}/export?format=${exportFormat}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text() || "Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="?([^"]+)"?/i)?.[1] || `nws360-briefing.${exportFormat}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("briefings.exportFailed", "Export failed"),
        description: error instanceof Error ? error.message : t("common.tryAgain", "Please try again."),
      });
    } finally {
      setExporting(false);
    }
  };

  if (reportsLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-md" />)}
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-briefings-page-title">
              {t("briefings.title", "Briefings")}
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("briefings.subtitle", "Assemble client-ready briefings from curated articles, notes, links, and headings. Each briefing stays inside the current tenant until a share link is used.")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchReports(); refetchItems(); refetchBasket(); refetchTemplates(); refetchSchedules(); refetchDeliveryStatus(); refetchDeliveryHistory(); }} disabled={reportsFetching} data-testid="button-refresh-briefings">
            {reportsFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">{t("common.refresh", "Refresh")}</span>
          </Button>
          {selectedReport && (
            <>
              <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as typeof exportFormat)}>
                <SelectTrigger className="h-9 w-[95px]" data-testid="select-briefing-export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="txt">Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportBriefing} disabled={exporting} data-testid="button-export-briefing">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-2">{t("common.export", "Export")}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={copyShareLink} disabled={!selectedReport.shareToken} data-testid="button-copy-briefing-share">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-2">{t("briefings.copyShare", "Copy share link")}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.total", "Total briefings")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{reports.length}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.drafts", "Drafts")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.draft}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.inReview", "In review")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.review}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.basketArticles", "Report basket")}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{basket?.total || 0}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                {t("briefings.newBriefing", "New Briefing")}
              </CardTitle>
              <CardDescription>{t("briefings.newBriefingDescription", "Start a briefing, then add articles from the report basket.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="briefing-title">{t("briefings.briefingTitle", "Title")}</Label>
                <Input
                  id="briefing-title"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder={t("briefings.titlePlaceholder", "Morning security brief")}
                  data-testid="input-new-briefing-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="briefing-summary">{t("briefings.summary", "Summary")}</Label>
                <Textarea
                  id="briefing-summary"
                  value={newSummary}
                  onChange={(event) => setNewSummary(event.target.value)}
                  placeholder={t("briefings.summaryPlaceholder", "Short context for the team or external reader")}
                  data-testid="textarea-new-briefing-summary"
                />
              </div>
              <Button
                onClick={() => createReportMutation.mutate()}
                disabled={createReportMutation.isPending || newTitle.trim().length < 2}
                data-testid="button-create-briefing"
              >
                {createReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">{t("common.create", "Create")}</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                {t("briefings.templates", "Templates")}
              </CardTitle>
              <CardDescription>{t("briefings.templatesDescription", "Reuse report structure for daily, weekly, or client-specific briefings.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="briefing-template-name">{t("briefings.templateName", "Template name")}</Label>
                <Input
                  id="briefing-template-name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  data-testid="input-briefing-template-name"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createTemplateMutation.mutate()}
                  disabled={createTemplateMutation.isPending || templateName.trim().length < 2}
                  data-testid="button-create-standard-template"
                >
                  {createTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="ml-2">{t("briefings.createOutline", "Create outline")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveCurrentAsTemplateMutation.mutate()}
                  disabled={saveCurrentAsTemplateMutation.isPending || !selectedReport || reusableItemCount === 0 || templateName.trim().length < 2}
                  data-testid="button-save-current-as-template"
                >
                  {saveCurrentAsTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span className="ml-2">{t("briefings.saveCurrentTemplate", "Save current")}</span>
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={templatesLoading || templates.length === 0}>
                  <SelectTrigger data-testid="select-briefing-template"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("briefings.noTemplate", "No template selected")}</SelectItem>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => createFromTemplateMutation.mutate()}
                  disabled={!selectedTemplate || createFromTemplateMutation.isPending}
                  data-testid="button-create-from-template"
                >
                  {createFromTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="ml-2">{t("briefings.useTemplate", "Use")}</span>
                </Button>
              </div>

              {templates.length > 0 && (
                <div className="space-y-2" data-testid="list-briefing-templates">
                  {templates.slice(0, 4).map(template => (
                    <div key={template.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                        <p className="text-xs text-muted-foreground">{template.sections.length} {t("briefings.sections", "sections")}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                        disabled={deleteTemplateMutation.isPending}
                        data-testid={`button-delete-briefing-template-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-primary" />
                {t("briefings.distributionSchedules", "Distribution Schedules")}
              </CardTitle>
              <CardDescription>{t("briefings.distributionDescription", "Set the recipient, cadence, and briefing package for delivery.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t("briefings.deliveryProvider", "Email delivery")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {deliveryStatus?.provider.configured
                        ? t("briefings.deliveryProviderReady", "Automatic delivery is configured from {{from}}", { from: deliveryStatus.provider.from })
                        : t("briefings.deliveryProviderMissing", "Automatic delivery needs RESEND_API_KEY and EMAIL_FROM in Railway.")}
                    </p>
                  </div>
                  <Badge variant={deliveryStatus?.provider.configured ? "default" : "secondary"} data-testid="badge-briefing-delivery-provider">
                    {deliveryStatus?.provider.configured ? t("common.active", "Active") : t("briefings.notConfigured", "Not configured")}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="briefing-schedule-label">{t("briefings.scheduleLabel", "Schedule name")}</Label>
                    <Input
                      id="briefing-schedule-label"
                      value={scheduleLabel}
                      onChange={(event) => setScheduleLabel(event.target.value)}
                      data-testid="input-briefing-schedule-label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="briefing-schedule-email">{t("briefings.recipientEmail", "Recipient email")}</Label>
                    <Input
                      id="briefing-schedule-email"
                      type="email"
                      value={scheduleEmail}
                      onChange={(event) => setScheduleEmail(event.target.value)}
                      placeholder="analyst@example.org"
                      data-testid="input-briefing-schedule-email"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("briefings.frequency", "Frequency")}</Label>
                    <Select value={scheduleFrequency} onValueChange={(value) => setScheduleFrequency(value as BriefingFrequency)}>
                      <SelectTrigger data-testid="select-briefing-schedule-frequency"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realtime">Real-time</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="briefing-schedule-time">{t("briefings.deliveryTime", "Delivery time")}</Label>
                    <Input
                      id="briefing-schedule-time"
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                      disabled={scheduleFrequency === "realtime"}
                      data-testid="input-briefing-schedule-time"
                    />
                  </div>
                </div>

                {scheduleFrequency === "weekly" && (
                  <div className="space-y-2">
                    <Label>{t("briefings.weekday", "Weekday")}</Label>
                    <Select value={scheduleDayOfWeek} onValueChange={setScheduleDayOfWeek}>
                      <SelectTrigger data-testid="select-briefing-schedule-weekday"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_LABELS.map((label, index) => (
                          <SelectItem key={label} value={String(index)}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scheduleFrequency === "monthly" && (
                  <div className="space-y-2">
                    <Label>{t("briefings.monthDay", "Day of month")}</Label>
                    <Select value={scheduleDayOfMonth} onValueChange={setScheduleDayOfMonth}>
                      <SelectTrigger data-testid="select-briefing-schedule-month-day"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }).map((_, index) => (
                          <SelectItem key={index + 1} value={String(index + 1)}>Day {index + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="briefing-schedule-timezone">{t("briefings.timezone", "Timezone")}</Label>
                    <Input
                      id="briefing-schedule-timezone"
                      value={scheduleTimezone}
                      onChange={(event) => setScheduleTimezone(event.target.value)}
                      disabled={scheduleFrequency === "realtime"}
                      data-testid="input-briefing-schedule-timezone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("briefings.scheduleSource", "Package")}</Label>
                    <Select value={scheduleSource} onValueChange={(value) => setScheduleSource(value as typeof scheduleSource)}>
                      <SelectTrigger data-testid="select-briefing-schedule-source"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual selection</SelectItem>
                        <SelectItem value="current-report" disabled={!selectedReport}>Selected briefing</SelectItem>
                        <SelectItem value="selected-template" disabled={!selectedTemplate}>Selected template</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="briefing-schedule-topics">{t("briefings.topicFilters", "Topic filters")}</Label>
                  <Input
                    id="briefing-schedule-topics"
                    value={scheduleTopics}
                    onChange={(event) => setScheduleTopics(event.target.value)}
                    placeholder="oil, security, Baghdad"
                    data-testid="input-briefing-schedule-topics"
                  />
                </div>

                <Button
                  onClick={() => createScheduleMutation.mutate()}
                  disabled={createScheduleMutation.isPending || scheduleLabel.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(scheduleEmail.trim())}
                  data-testid="button-create-briefing-schedule"
                >
                  {createScheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  <span className="ml-2">{t("briefings.createSchedule", "Create schedule")}</span>
                </Button>
              </div>

              <div className="border-t border-border/60 pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.activeSchedules", "Active schedules")}</p>
                  <Badge variant="secondary">{activeScheduleCount}/{schedules.length}</Badge>
                </div>
                {schedulesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-md" />)}
                  </div>
                ) : schedules.length > 0 ? (
                  <div className="space-y-2" data-testid="list-briefing-schedules">
                    {schedules.slice(0, 5).map(schedule => {
                      const config = getScheduleConfig(schedule);
                      return (
                        <div key={schedule.id} className="rounded-md border border-border/60 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">{config.label || schedule.email}</span>
                                <Badge variant={schedule.active === false ? "secondary" : "default"}>{schedule.active === false ? "Paused" : "Active"}</Badge>
                                <Badge variant="outline">{FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}</Badge>
                              </div>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{schedule.email}</span>
                              </p>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span className="truncate">{formatScheduleCadence(schedule)}</span>
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{scheduleTargetLabel(schedule)}</p>
                              {schedule.topics && schedule.topics.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {schedule.topics.slice(0, 4).map(topic => <Badge key={topic} variant="secondary" className="text-[11px]">{topic}</Badge>)}
                                </div>
                              )}
                              {config.lastDeliveryStatus && (
                                <p className="text-xs text-muted-foreground">
                                  {t("briefings.lastDelivery", "Last delivery")}: {config.lastDeliveryStatus}
                                  {config.lastDeliveryAttemptAt ? ` - ${formatDistanceToNow(new Date(config.lastDeliveryAttemptAt), { addSuffix: true })}` : ""}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => previewDeliveryMutation.mutate(schedule.id)}
                                disabled={previewDeliveryMutation.isPending && previewScheduleId === schedule.id}
                                data-testid={`button-preview-briefing-delivery-${schedule.id}`}
                              >
                                {previewDeliveryMutation.isPending && previewScheduleId === schedule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                <span className="ml-2">{t("common.preview", "Preview")}</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runDeliveryMutation.mutate({ id: schedule.id, dryRun: true })}
                                disabled={runDeliveryMutation.isPending && runScheduleId === schedule.id}
                                data-testid={`button-test-briefing-delivery-${schedule.id}`}
                              >
                                {runDeliveryMutation.isPending && runScheduleId === schedule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                <span className="ml-2">{t("common.test", "Test")}</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                title={deliveryStatus?.provider.configured ? t("briefings.sendNow", "Send now") : t("briefings.deliveryProviderMissing", "Automatic delivery needs RESEND_API_KEY and EMAIL_FROM in Railway.")}
                                onClick={() => {
                                  if (window.confirm(t("briefings.sendNowConfirm", "Send this briefing now?"))) {
                                    runDeliveryMutation.mutate({ id: schedule.id, dryRun: false });
                                  }
                                }}
                                disabled={!deliveryStatus?.provider.configured || (runDeliveryMutation.isPending && runScheduleId === schedule.id)}
                                data-testid={`button-send-briefing-delivery-${schedule.id}`}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={schedule.active !== false}
                                onCheckedChange={(active) => updateScheduleMutation.mutate({ id: schedule.id, updates: { active } })}
                                disabled={updateScheduleMutation.isPending}
                                data-testid={`switch-briefing-schedule-${schedule.id}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                disabled={deleteScheduleMutation.isPending}
                                data-testid={`button-delete-briefing-schedule-${schedule.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground" data-testid="empty-briefing-schedules">
                    {t("briefings.noSchedules", "No schedules yet. Create one for the first recipient.")}
                  </div>
                )}

                {deliveryPreview && (
                  <div className="mt-3 rounded-md border border-border/60 bg-background p-3" data-testid="panel-briefing-delivery-preview">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{deliveryPreview.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {deliveryPreview.sourceType} - {deliveryPreview.itemCount} {t("briefings.itemsCount", "items")} - {deliveryPreview.articleCount} {t("briefings.articles", "articles")}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setDeliveryPreview(null)} data-testid="button-close-briefing-delivery-preview">
                        {t("common.close", "Close")}
                      </Button>
                    </div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                      {deliveryPreview.text}
                    </pre>
                  </div>
                )}

                {deliveryRunResult && (
                  <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3" data-testid="panel-briefing-delivery-run-result">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("briefings.lastRunResult", "Last run result")}</p>
                        <p className="text-xs text-muted-foreground">{formatDeliverySummary(deliveryRunResult)}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setDeliveryRunResult(null)} data-testid="button-close-briefing-delivery-run-result">
                        {t("common.close", "Close")}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      <p className="text-xs font-medium uppercase text-muted-foreground">{t("briefings.deliveryHistory", "Delivery history")}</p>
                    </div>
                    <Badge variant="secondary">{deliveryHistory?.total || 0}</Badge>
                  </div>
                  {deliveryHistoryLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-md" />)}
                    </div>
                  ) : deliveryHistory?.items?.length ? (
                    <div className="space-y-2" data-testid="list-briefing-delivery-history">
                      {deliveryHistory.items.slice(0, 5).map(item => (
                        <div key={item.id} className="rounded-md border border-border/60 px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={item.summary.failed > 0 ? "destructive" : item.summary.sent > 0 ? "default" : "secondary"}>
                                  {item.status}
                                </Badge>
                                {item.manual && <Badge variant="outline">{t("briefings.manualRun", "Manual")}</Badge>}
                                {item.dryRun && <Badge variant="outline">{t("briefings.testRun", "Test")}</Badge>}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{formatDeliverySummary(item.summary)}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.completedAt || item.createdAt
                                ? formatDistanceToNow(new Date(item.completedAt || item.createdAt || Date.now()), { addSuffix: true })
                                : t("common.notAvailable", "Not available")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground" data-testid="empty-briefing-delivery-history">
                      {t("briefings.noDeliveryHistory", "No delivery runs recorded yet.")}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-md border border-border/60 bg-card">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">{t("briefings.allBriefings", "All briefings")}</h2>
            </div>
            <div className="divide-y divide-border/60" data-testid="list-briefings">
              {reports.length > 0 ? reports.map(report => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition hover:bg-muted/50",
                    selectedReportId === report.id && "bg-muted",
                  )}
                  data-testid={`button-select-briefing-${report.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.lastUpdated || report.createdAt
                          ? formatDistanceToNow(new Date(report.lastUpdated || report.createdAt || Date.now()), { addSuffix: true })
                          : t("common.notAvailable", "Not available")}
                      </p>
                    </div>
                    <Badge variant={reportStatusVariant(report.status)}>{STATUS_LABELS[report.status] || report.status}</Badge>
                  </div>
                </button>
              )) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="empty-briefings">
                  {t("briefings.empty", "No briefings yet. Create one to start assembling client-ready output.")}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedReport ? (
            <>
              <Card className="rounded-md">
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4 text-primary" />
                        {t("briefings.editor", "Briefing Editor")}
                      </CardTitle>
                      <CardDescription>{t("briefings.editorDescription", "Edit details, publish status, and manage briefing items.")}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateReportMutation.mutate({ id: selectedReport.id, updates: { status: "published" } as any })}
                        disabled={updateReportMutation.isPending || selectedReport.status === "published"}
                        data-testid="button-publish-briefing"
                      >
                        <Send className="h-4 w-4" />
                        <span className="ml-2">{t("briefings.publish", "Publish")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(t("briefings.deleteConfirm", "Delete this briefing?"))) {
                            deleteReportMutation.mutate(selectedReport.id);
                          }
                        }}
                        disabled={deleteReportMutation.isPending}
                        data-testid="button-delete-briefing"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="space-y-2 lg:col-span-5">
                      <Label htmlFor="edit-briefing-title">{t("briefings.briefingTitle", "Title")}</Label>
                      <Input
                        id="edit-briefing-title"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        data-testid="input-edit-briefing-title"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-3">
                      <Label>{t("briefings.status", "Status")}</Label>
                      <Select value={editStatus} onValueChange={(value) => setEditStatus(value as ReportStatus)}>
                        <SelectTrigger data-testid="select-edit-briefing-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="review">In review</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-end lg:col-span-4">
                      <Button onClick={saveSelectedReport} disabled={updateReportMutation.isPending || editTitle.trim().length < 2} data-testid="button-save-briefing">
                        {updateReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span className="ml-2">{t("common.save", "Save")}</span>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-briefing-summary">{t("briefings.summary", "Summary")}</Label>
                    <Textarea
                      id="edit-briefing-summary"
                      value={editSummary}
                      onChange={(event) => setEditSummary(event.target.value)}
                      data-testid="textarea-edit-briefing-summary"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="rounded-md">
                  <CardHeader>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle className="text-base">{t("briefings.items", "Briefing Items")}</CardTitle>
                        <CardDescription>{t("briefings.itemsDescription", "Arrange article references and written context for the final briefing.")}</CardDescription>
                      </div>
                      <Badge variant="secondary">{items.length} {t("briefings.itemsCount", "items")}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                      <div className="grid gap-3 lg:grid-cols-12">
                        <div className="space-y-2 lg:col-span-3">
                          <Label>{t("briefings.itemType", "Type")}</Label>
                          <Select value={itemType} onValueChange={(value) => setItemType(value as Exclude<BriefingItemType, "article">)}>
                            <SelectTrigger data-testid="select-briefing-item-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="note">Note</SelectItem>
                              <SelectItem value="heading">Heading</SelectItem>
                              <SelectItem value="link">Link</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 lg:col-span-7">
                          <Label htmlFor="briefing-item-content">{t("briefings.content", "Content")}</Label>
                          <Input
                            id="briefing-item-content"
                            value={itemContent}
                            onChange={(event) => setItemContent(event.target.value)}
                            placeholder={itemType === "link" ? "https://example.com" : t("briefings.contentPlaceholder", "Add context, heading, or link")}
                            data-testid="input-briefing-item-content"
                          />
                        </div>
                        <div className="flex items-end justify-end lg:col-span-2">
                          <Button onClick={addTextItem} disabled={addItemMutation.isPending || !itemContent.trim()} data-testid="button-add-briefing-text-item">
                            {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            <span className="ml-2">{t("common.add", "Add")}</span>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {itemsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)}
                      </div>
                    ) : items.length > 0 ? (
                      <div className="space-y-2" data-testid="list-briefing-items">
                        {items.map((item, index) => {
                          const article = item.itemRefId ? articleMap.get(item.itemRefId) : null;
                          return (
                            <div key={item.id} className="rounded-md border border-border/60 bg-card p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">#{index + 1}</Badge>
                                    <Badge variant={item.itemType === "article" ? "default" : "secondary"}>{itemLabel(item.itemType)}</Badge>
                                    {article && <span className="text-xs text-muted-foreground">{sourceName(article)} {articleDate(article) ? `- ${articleDate(article)}` : ""}</span>}
                                  </div>
                                  {item.itemType === "article" ? (
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium text-foreground">{article?.title || `Article #${item.itemRefId}`}</p>
                                      {item.content && <p className="line-clamp-2 text-sm text-muted-foreground">{item.content}</p>}
                                    </div>
                                  ) : (
                                    <p className={cn("text-sm text-foreground", item.itemType === "heading" && "font-semibold")}>{item.content}</p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  disabled={deleteItemMutation.isPending}
                                  data-testid={`button-delete-briefing-item-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center" data-testid="empty-briefing-items">
                        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                        <h2 className="text-base font-semibold text-foreground">{t("briefings.noItemsTitle", "No items yet")}</h2>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                          {t("briefings.noItemsBody", "Add articles from the report basket or write notes to shape the briefing.")}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{t("briefings.reportBasket", "Report Basket")}</CardTitle>
                        <CardDescription>{t("briefings.reportBasketDescription", "Use articles marked For Report as the briefing source pool.")}</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkAddMutation.mutate()}
                        disabled={bulkAddMutation.isPending || basketArticles.every(article => addedArticleIds.has(article.id))}
                        data-testid="button-add-visible-basket"
                      >
                        {bulkAddMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        <span className="ml-2">{t("briefings.addAll", "Add all")}</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {basketLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)}
                      </div>
                    ) : basketArticles.length > 0 ? (
                      <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1" data-testid="list-briefing-basket-articles">
                        {basketArticles.map(article => {
                          const alreadyAdded = addedArticleIds.has(article.id);
                          return (
                            <div key={article.id} className="rounded-md border border-border/60 p-3">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-medium text-foreground">{article.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{sourceName(article)} {articleDate(article) ? `- ${articleDate(article)}` : ""}</p>
                                  </div>
                                  <Button
                                    variant={alreadyAdded ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => addArticle(article)}
                                    disabled={alreadyAdded || addItemMutation.isPending}
                                    data-testid={`button-add-article-to-briefing-${article.id}`}
                                  >
                                    {alreadyAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    <span className="ml-2">{alreadyAdded ? t("briefings.added", "Added") : t("common.add", "Add")}</span>
                                  </Button>
                                </div>
                                {articleSnapshot(article) && <p className="line-clamp-2 text-xs text-muted-foreground">{articleSnapshot(article)}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
                        <p className="text-sm font-medium text-foreground">{t("briefings.emptyBasketTitle", "Report basket is empty")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("briefings.emptyBasketBody", "Mark feed items as For Report, then return here to add them to briefings.")}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center" data-testid="empty-selected-briefing">
              <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
              <h2 className="text-base font-semibold text-foreground">{t("briefings.selectTitle", "Create or select a briefing")}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {t("briefings.selectBody", "A briefing is the client-facing package built from marked news, staff notes, links, and publishing status.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
