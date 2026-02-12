import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  MessageSquare,
  Brain,
  Beaker,
  BookOpen,
  FileText,
  Check,
  X,
  Plus,
} from "lucide-react";

interface ProductAnalyticsData {
  totalFeedback: number;
  feedbackByFeature: Record<string, number>;
  ratingDistribution: { useful: number; unclear: number; wrong: number };
  engagement: {
    opened: number;
    clicked: number;
    exported: number;
  };
}

interface Correction {
  id: number;
  articleId: number;
  field: string;
  oldValue: string;
  newValue: string;
  status: string;
  createdAt: string;
}

interface ValueReport {
  id: number;
  month: string;
  clientId?: string;
  alertsDetected: number;
  topicsCaught: number;
  sentimentChanges: number;
  timeSaved: number;
}

interface Experiment {
  id: number;
  name: string;
  status: string;
  variants: string[];
  description?: string;
}

interface KnowledgeEntry {
  id: number;
  questionPattern: string;
  answerSummary: string;
  queryCount: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

function FeedbackOverview() {
  const { data, isLoading } = useQuery<ProductAnalyticsData>({
    queryKey: ["/api/admin/product-analytics"],
  });

  if (isLoading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground" data-testid="text-no-feedback">
          No feedback data available.
        </CardContent>
      </Card>
    );
  }

  const featureEntries = Object.entries(data.feedbackByFeature || {});
  const maxFeatureCount = featureEntries.length > 0 ? Math.max(...featureEntries.map(([, v]) => v)) : 1;

  return (
    <div className="space-y-6">
      <Card data-testid="card-total-feedback">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Total Feedback</CardTitle>
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid="text-total-feedback-count">
            {data.totalFeedback}
          </p>
          <p className="text-sm text-muted-foreground mt-1">responses collected</p>
        </CardContent>
      </Card>

      <Card data-testid="card-feedback-by-feature">
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
            <BarChart3 className="w-4 h-4" />
            Feedback by Feature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {featureEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">No feature feedback yet.</p>
          )}
          {featureEntries.map(([feature, count]) => (
            <div key={feature} className="space-y-1" data-testid={`feature-row-${feature}`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="text-sm font-medium">{feature}</span>
                <span className="text-sm text-muted-foreground">{count}</span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(count / maxFeatureCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="card-rating-distribution">
        <CardHeader>
          <CardTitle className="text-base font-medium">Rating Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col items-center p-4 rounded-md bg-green-500/10">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 mb-1" />
              <span className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-useful-count">
                {data.ratingDistribution?.useful ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">Useful</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-md bg-amber-500/10">
              <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-1" />
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-unclear-count">
                {data.ratingDistribution?.unclear ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">Unclear</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-md bg-red-500/10">
              <X className="w-5 h-5 text-red-600 dark:text-red-400 mb-1" />
              <span className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-wrong-count">
                {data.ratingDistribution?.wrong ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">Wrong</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EngagementMetrics() {
  const { data, isLoading } = useQuery<ProductAnalyticsData>({
    queryKey: ["/api/admin/product-analytics"],
  });

  if (isLoading) return <LoadingSkeleton />;

  if (!data?.engagement) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground" data-testid="text-no-engagement">
          No engagement data available.
        </CardContent>
      </Card>
    );
  }

  const { opened, clicked, exported } = data.engagement;
  const engagementRate = opened > 0 ? ((clicked / opened) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card data-testid="card-stat-opened">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Opened</CardTitle>
          <FileText className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid="text-opened-count">{opened}</p>
          <p className="text-sm text-muted-foreground mt-1">total opens</p>
        </CardContent>
      </Card>

      <Card data-testid="card-stat-clicked">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Clicked</CardTitle>
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid="text-clicked-count">{clicked}</p>
          <p className="text-sm text-muted-foreground mt-1">total clicks</p>
        </CardContent>
      </Card>

      <Card data-testid="card-stat-exported">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Exported</CardTitle>
          <FileText className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid="text-exported-count">{exported}</p>
          <p className="text-sm text-muted-foreground mt-1">total exports</p>
        </CardContent>
      </Card>

      <Card data-testid="card-stat-engagement-rate">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Engagement Rate</CardTitle>
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" data-testid="text-engagement-rate">{engagementRate}%</p>
          <p className="text-sm text-muted-foreground mt-1">clicked / opened</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AICorrections() {
  const { toast } = useToast();

  const { data: corrections, isLoading } = useQuery<Correction[]>({
    queryKey: ["/api/corrections"],
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/corrections/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corrections"] });
      toast({ title: "Correction updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  const pendingCount = (corrections || []).filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Brain className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm font-medium">Pending Corrections</span>
        <Badge variant="secondary" data-testid="badge-pending-corrections">{pendingCount}</Badge>
      </div>

      <Card data-testid="card-corrections-table">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article ID</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old Value</TableHead>
                <TableHead>New Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!corrections || corrections.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No corrections found.
                  </TableCell>
                </TableRow>
              )}
              {(corrections || []).map((c) => (
                <TableRow key={c.id} data-testid={`row-correction-${c.id}`}>
                  <TableCell data-testid={`text-correction-article-${c.id}`}>{c.articleId}</TableCell>
                  <TableCell>{c.field}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{c.oldValue}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{c.newValue}</TableCell>
                  <TableCell>
                    <Badge
                      variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}
                      className="no-default-hover-elevate no-default-active-elevate"
                      data-testid={`badge-correction-status-${c.id}`}
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {c.status === "pending" && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateStatus.mutate({ id: c.id, status: "approved" })}
                          disabled={updateStatus.isPending}
                          data-testid={`button-approve-correction-${c.id}`}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateStatus.mutate({ id: c.id, status: "rejected" })}
                          disabled={updateStatus.isPending}
                          data-testid={`button-reject-correction-${c.id}`}
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ValueReports() {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState("default");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: reports, isLoading } = useQuery<ValueReport[]>({
    queryKey: ["/api/value-reports"],
  });

  const generateReport = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/value-reports/generate", { clientId: selectedClient });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/value-reports"] });
      toast({ title: "Report generated" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate report", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Value Reports</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-generate-report">
              <Plus className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Value Report</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger data-testid="select-report-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="client-a">Client A</SelectItem>
                    <SelectItem value="client-b">Client B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => generateReport.mutate()}
                disabled={generateReport.isPending}
                className="w-full"
                data-testid="button-confirm-generate-report"
              >
                {generateReport.isPending ? "Generating..." : "Generate"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-value-reports">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Alerts Detected</TableHead>
                <TableHead>Topics Caught</TableHead>
                <TableHead>Sentiment Changes</TableHead>
                <TableHead>Time Saved (hrs)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!reports || reports.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No reports generated yet.
                  </TableCell>
                </TableRow>
              )}
              {(reports || []).map((r) => (
                <TableRow key={r.id} data-testid={`row-report-${r.id}`}>
                  <TableCell data-testid={`text-report-month-${r.id}`}>{r.month}</TableCell>
                  <TableCell>{r.alertsDetected}</TableCell>
                  <TableCell>{r.topicsCaught}</TableCell>
                  <TableCell>{r.sentimentChanges}</TableCell>
                  <TableCell>{r.timeSaved}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Experiments() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVariants, setNewVariants] = useState("");

  const { data: experiments, isLoading } = useQuery<Experiment[]>({
    queryKey: ["/api/experiments"],
  });

  const createExperiment = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/experiments", {
        name: newName,
        variants: newVariants.split(",").map((v) => v.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({ title: "Experiment created" });
      setNewName("");
      setNewVariants("");
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create experiment", description: error.message, variant: "destructive" });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/experiments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({ title: "Experiment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  const nextStatus = (current: string) => {
    if (current === "active") return "paused";
    if (current === "paused") return "active";
    return "completed";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Beaker className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Experiments</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-experiment">
              <Plus className="w-4 h-4 mr-2" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Experiment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Experiment name"
                  data-testid="input-experiment-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Variants (comma-separated)</label>
                <Input
                  value={newVariants}
                  onChange={(e) => setNewVariants(e.target.value)}
                  placeholder="control, variant-a, variant-b"
                  data-testid="input-experiment-variants"
                />
              </div>
              <Button
                onClick={() => createExperiment.mutate()}
                disabled={createExperiment.isPending || !newName.trim()}
                className="w-full"
                data-testid="button-confirm-create-experiment"
              >
                {createExperiment.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-experiments">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!experiments || experiments.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No experiments yet.
                  </TableCell>
                </TableRow>
              )}
              {(experiments || []).map((exp) => (
                <TableRow key={exp.id} data-testid={`row-experiment-${exp.id}`}>
                  <TableCell className="font-medium" data-testid={`text-experiment-name-${exp.id}`}>
                    {exp.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={exp.status === "active" ? "default" : exp.status === "paused" ? "secondary" : "outline"}
                      className="no-default-hover-elevate no-default-active-elevate"
                      data-testid={`badge-experiment-status-${exp.id}`}
                    >
                      {exp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(exp.variants || []).map((v) => (
                        <Badge key={v} variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {exp.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleStatus.mutate({ id: exp.id, status: nextStatus(exp.status) })}
                        disabled={toggleStatus.isPending}
                        data-testid={`button-toggle-experiment-${exp.id}`}
                      >
                        {exp.status === "active" ? "Pause" : "Activate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KnowledgeBase() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const { data: entries, isLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ["/api/knowledge"],
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/knowledge", {
        questionPattern: newQuestion,
        answerSummary: newAnswer,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({ title: "Knowledge entry added" });
      setNewQuestion("");
      setNewAnswer("");
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add entry", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Knowledge Base</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-knowledge">
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Knowledge Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Question Pattern</label>
                <Input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="How do I...?"
                  data-testid="input-knowledge-question"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Answer Summary</label>
                <Input
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="You can..."
                  data-testid="input-knowledge-answer"
                />
              </div>
              <Button
                onClick={() => addEntry.mutate()}
                disabled={addEntry.isPending || !newQuestion.trim() || !newAnswer.trim()}
                className="w-full"
                data-testid="button-confirm-add-knowledge"
              >
                {addEntry.isPending ? "Adding..." : "Add Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-knowledge-table">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question Pattern</TableHead>
                <TableHead>Answer Summary</TableHead>
                <TableHead>Query Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!entries || entries.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No knowledge entries yet.
                  </TableCell>
                </TableRow>
              )}
              {(entries || []).map((entry) => (
                <TableRow key={entry.id} data-testid={`row-knowledge-${entry.id}`}>
                  <TableCell className="font-medium" data-testid={`text-knowledge-question-${entry.id}`}>
                    {entry.questionPattern}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">{entry.answerSummary}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                      {entry.queryCount}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProductAnalytics() {
  const { user, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="space-y-8 animate-fade-in" data-testid="product-analytics-unauthorized">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground text-sm mt-1">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in" data-testid="product-analytics-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-product-intelligence-title">
          Product Intelligence
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Data-driven insights into product usage and AI performance
        </p>
      </div>

      <Tabs defaultValue="feedback" data-testid="tabs-product-analytics">
        <TabsList className="flex flex-wrap h-auto gap-1" data-testid="tabs-list">
          <TabsTrigger value="feedback" data-testid="tab-feedback">
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Feedback Overview
          </TabsTrigger>
          <TabsTrigger value="engagement" data-testid="tab-engagement">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Engagement Metrics
          </TabsTrigger>
          <TabsTrigger value="corrections" data-testid="tab-corrections">
            <Brain className="w-4 h-4 mr-1.5" />
            AI Corrections
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileText className="w-4 h-4 mr-1.5" />
            Value Reports
          </TabsTrigger>
          <TabsTrigger value="experiments" data-testid="tab-experiments">
            <Beaker className="w-4 h-4 mr-1.5" />
            Experiments
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">
            <BookOpen className="w-4 h-4 mr-1.5" />
            Knowledge Base
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feedback">
          <FeedbackOverview />
        </TabsContent>

        <TabsContent value="engagement">
          <EngagementMetrics />
        </TabsContent>

        <TabsContent value="corrections">
          <AICorrections />
        </TabsContent>

        <TabsContent value="reports">
          <ValueReports />
        </TabsContent>

        <TabsContent value="experiments">
          <Experiments />
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeBase />
        </TabsContent>
      </Tabs>
    </div>
  );
}
