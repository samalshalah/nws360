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
import { Slider } from "@/components/ui/slider";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Clock,
  RefreshCw,
  Brain,
  BookOpen,
  FileText,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Sparkles,
  GitCompare,
  Plus,
  Trash2,
  Loader2,
  Check,
  Info,
} from "lucide-react";

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

function TimelinesTab() {
  const { toast } = useToast();
  const [mainTopic, setMainTopic] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("active");

  const { data: timelines, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/timelines"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/timelines", {
        mainTopic,
        summary,
        status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/timelines"] });
      setMainTopic("");
      setSummary("");
      setStatus("active");
      toast({ title: "Timeline created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/timelines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/timelines"] });
      toast({ title: "Timeline deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-timelines-title">Story Timelines</h3>
          <p className="text-sm text-muted-foreground">Track story timelines and their lifecycle status</p>
        </div>
        <TabInfo description="Maintain persistent story timelines that track how major stories evolve. Mark stories as active, dormant, or recurring to build a living archive of narrative progression over days, weeks, or months." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Main Topic</Label>
            <Input data-testid="input-timeline-topic" value={mainTopic} onChange={e => setMainTopic(e.target.value)} placeholder="Timeline topic" />
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea data-testid="input-timeline-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Timeline summary..." />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-timeline-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="dormant">Dormant</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="button-create-timeline" onClick={() => createMut.mutate()} disabled={!mainTopic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Timeline
          </Button>
        </CardContent>
      </Card>

      {(!timelines || timelines.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-timelines">No timelines yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {timelines.map((t: any) => (
            <Card key={t.id} data-testid={`card-timeline-${t.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-timeline-topic-${t.id}`}>{t.mainTopic}</span>
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate capitalize text-xs">{t.status}</Badge>
                    </div>
                    {t.summary && <p className="text-sm text-muted-foreground">{t.summary}</p>}
                    {t.createdAt && <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-timeline-${t.id}`} onClick={() => deleteMut.mutate(t.id)}>
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

function PatternsTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [recurrenceInterval, setRecurrenceInterval] = useState("");
  const [confidence, setConfidence] = useState(50);

  const { data: patterns, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/patterns"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/patterns", {
        topic,
        recurrenceInterval,
        confidence,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/patterns"] });
      setTopic("");
      setRecurrenceInterval("");
      setConfidence(50);
      toast({ title: "Pattern created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/patterns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/patterns"] });
      toast({ title: "Pattern deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-patterns-title">Recurring Patterns</h3>
          <p className="text-sm text-muted-foreground">Identify and track recurring patterns in your data</p>
        </div>
        <TabInfo description="Detect and log recurring event patterns with confidence scoring. Track topics that repeat on weekly, monthly, or seasonal cycles so you can anticipate the next occurrence before it hits the news." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Topic</Label>
            <Input data-testid="input-pattern-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Pattern topic" />
          </div>
          <div>
            <Label>Recurrence Interval</Label>
            <Input data-testid="input-pattern-interval" value={recurrenceInterval} onChange={e => setRecurrenceInterval(e.target.value)} placeholder="e.g. weekly, monthly" />
          </div>
          <div>
            <Label>Confidence: {confidence}%</Label>
            <Slider
              data-testid="slider-pattern-confidence"
              value={[confidence]}
              onValueChange={v => setConfidence(v[0])}
              min={0}
              max={100}
              step={1}
              className="mt-2"
            />
          </div>
          <Button data-testid="button-create-pattern" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Pattern
          </Button>
        </CardContent>
      </Card>

      {(!patterns || patterns.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-patterns">No patterns yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {patterns.map((p: any) => (
            <Card key={p.id} data-testid={`card-pattern-${p.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-pattern-topic-${p.id}`}>{p.topic}</span>
                      <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{p.confidence}% confidence</Badge>
                    </div>
                    {p.recurrenceInterval && <p className="text-sm text-muted-foreground">Interval: {p.recurrenceInterval}</p>}
                    {p.createdAt && <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-pattern-${p.id}`} onClick={() => deleteMut.mutate(p.id)}>
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

function EntityMemoryTab() {
  const { toast } = useToast();
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [biography, setBiography] = useState("");
  const [associatedTopics, setAssociatedTopics] = useState("");

  const { data: entities, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/entity-memory"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/entity-memory", {
        entityName,
        entityType,
        biography,
        associatedTopics: associatedTopics.split(",").map(s => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/entity-memory"] });
      setEntityName("");
      setEntityType("");
      setBiography("");
      setAssociatedTopics("");
      toast({ title: "Entity memory created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/entity-memory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/entity-memory"] });
      toast({ title: "Entity memory deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-entity-memory-title">Entity Memory</h3>
          <p className="text-sm text-muted-foreground">Maintain biography records and associated topics for entities</p>
        </div>
        <TabInfo description="Build persistent memory for key people, organizations, and locations. Store biographies, track tone evolution over time, and associate entities with topics so the platform remembers context across sessions." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <Label>Entity Name</Label>
              <Input data-testid="input-entity-name" value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="Entity name" />
            </div>
            <div className="flex-1 min-w-[120px]">
              <Label>Entity Type</Label>
              <Input data-testid="input-entity-type" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="e.g. person, org, location" />
            </div>
          </div>
          <div>
            <Label>Biography</Label>
            <Textarea data-testid="input-entity-biography" value={biography} onChange={e => setBiography(e.target.value)} placeholder="Entity biography..." />
          </div>
          <div>
            <Label>Associated Topics (comma-separated)</Label>
            <Input data-testid="input-entity-topics" value={associatedTopics} onChange={e => setAssociatedTopics(e.target.value)} placeholder="topic1, topic2, topic3" />
          </div>
          <Button data-testid="button-create-entity" onClick={() => createMut.mutate()} disabled={!entityName || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Entity Memory
          </Button>
        </CardContent>
      </Card>

      {(!entities || entities.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-entities">No entity memories yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {entities.map((e: any) => (
            <Card key={e.id} data-testid={`card-entity-${e.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-entity-name-${e.id}`}>{e.entityName}</span>
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">{e.entityType}</Badge>
                    </div>
                    {e.biography && <p className="text-sm text-muted-foreground">{e.biography}</p>}
                    {e.associatedTopics && e.associatedTopics.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {e.associatedTopics.map((topic: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{topic}</Badge>
                        ))}
                      </div>
                    )}
                    {e.createdAt && <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-entity-${e.id}`} onClick={() => deleteMut.mutate(e.id)}>
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

function NarrativesTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [framingTerms, setFramingTerms] = useState("");
  const [sentimentDelta, setSentimentDelta] = useState("");
  const [summary, setSummary] = useState("");

  const { data: narratives, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/narrative-shifts"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/narrative-shifts", {
        topic,
        framingTerms: framingTerms.split(",").map(s => s.trim()).filter(Boolean),
        sentimentDelta: parseInt(sentimentDelta) || 0,
        summary,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/narrative-shifts"] });
      setTopic("");
      setFramingTerms("");
      setSentimentDelta("");
      setSummary("");
      toast({ title: "Narrative shift created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/narrative-shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/narrative-shifts"] });
      toast({ title: "Narrative shift deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-narratives-title">Narrative Shifts</h3>
          <p className="text-sm text-muted-foreground">Track how narratives evolve over time with framing and sentiment changes</p>
        </div>
        <TabInfo description="Monitor how the language and framing around a topic changes over time. Track shifts in sentiment, identify new framing terms, and document when media coverage pivots from one angle to another." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Topic</Label>
            <Input data-testid="input-narrative-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Narrative topic" />
          </div>
          <div>
            <Label>Framing Terms (comma-separated)</Label>
            <Input data-testid="input-narrative-framing" value={framingTerms} onChange={e => setFramingTerms(e.target.value)} placeholder="term1, term2, term3" />
          </div>
          <div>
            <Label>Sentiment Delta</Label>
            <Input data-testid="input-narrative-sentiment" type="number" step="0.1" value={sentimentDelta} onChange={e => setSentimentDelta(e.target.value)} placeholder="e.g. -0.5, 0.3" />
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea data-testid="input-narrative-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Narrative shift summary..." />
          </div>
          <Button data-testid="button-create-narrative" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Narrative Shift
          </Button>
        </CardContent>
      </Card>

      {(!narratives || narratives.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-narratives">No narrative shifts yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {narratives.map((n: any) => (
            <Card key={n.id} data-testid={`card-narrative-${n.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-narrative-topic-${n.id}`}>{n.topic}</span>
                      <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">
                        {n.sentimentDelta > 0 ? "+" : ""}{n.sentimentDelta} sentiment
                      </Badge>
                    </div>
                    {n.summary && <p className="text-sm text-muted-foreground">{n.summary}</p>}
                    {n.framingTerms && n.framingTerms.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {n.framingTerms.map((term: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">{term}</Badge>
                        ))}
                      </div>
                    )}
                    {n.createdAt && <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-narrative-${n.id}`} onClick={() => deleteMut.mutate(n.id)}>
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

function OrgNotesTab() {
  const { toast } = useToast();
  const [relatedTopic, setRelatedTopic] = useState("");
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("context");

  const { data: notes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/org-notes"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/org-notes", {
        relatedTopic,
        content,
        noteType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/org-notes"] });
      setRelatedTopic("");
      setContent("");
      setNoteType("context");
      toast({ title: "Org note created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/org-notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/org-notes"] });
      toast({ title: "Org note deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-org-notes-title">Institutional Knowledge Notes</h3>
          <p className="text-sm text-muted-foreground">Capture context, policies, decisions, and references for your organization</p>
        </div>
        <TabInfo description="Store your organization's institutional knowledge — internal context, policy decisions, reference materials, and expert notes. These notes feed into AI answers so the platform understands your unique perspective." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Related Topic</Label>
            <Input data-testid="input-org-note-topic" value={relatedTopic} onChange={e => setRelatedTopic(e.target.value)} placeholder="Related topic" />
          </div>
          <div>
            <Label>Note Type</Label>
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger data-testid="select-org-note-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="context">Context</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="decision">Decision</SelectItem>
                <SelectItem value="reference">Reference</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Content</Label>
            <Textarea data-testid="input-org-note-content" value={content} onChange={e => setContent(e.target.value)} placeholder="Note content..." />
          </div>
          <Button data-testid="button-create-org-note" onClick={() => createMut.mutate()} disabled={!relatedTopic || !content || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Note
          </Button>
        </CardContent>
      </Card>

      {(!notes || notes.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-org-notes">No institutional notes yet. Add one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {notes.map((n: any) => (
            <Card key={n.id} data-testid={`card-org-note-${n.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-org-note-topic-${n.id}`}>{n.relatedTopic}</span>
                      <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate capitalize text-xs">{n.noteType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-org-note-content-${n.id}`}>{n.content}</p>
                    {n.createdAt && <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-org-note-${n.id}`} onClick={() => deleteMut.mutate(n.id)}>
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

  const { data: matches, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/historical-matches"],
  });

  const acknowledgeMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/knowledge/historical-matches/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/historical-matches"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-alerts-title">Historical Match Alerts</h3>
          <p className="text-sm text-muted-foreground">Review alerts when current events match historical patterns</p>
        </div>
        <TabInfo description="Get notified when current events closely resemble past situations. The system compares new developments against your historical archive and flags matches with a similarity score so you can learn from precedent." />
      </div>

      {(!matches || matches.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-alerts">No historical match alerts found.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {matches.map((m: any) => (
            <Card key={m.id} data-testid={`card-alert-${m.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="font-medium" data-testid={`text-alert-topic-${m.id}`}>{m.currentTopic || m.topic || "Match Alert"}</span>
                      <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">
                        {m.similarityScore || 0}% similarity
                      </Badge>
                      {m.acknowledged && <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">Acknowledged</Badge>}
                    </div>
                    {m.historicalTopic && <p className="text-sm text-muted-foreground">Historical: {m.historicalTopic}</p>}
                    {m.summary && <p className="text-sm text-muted-foreground">{m.summary}</p>}
                    {m.createdAt && <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>}
                  </div>
                  {!m.acknowledged && (
                    <Button
                      data-testid={`button-acknowledge-alert-${m.id}`}
                      variant="outline"
                      onClick={() => acknowledgeMut.mutate(m.id)}
                      disabled={acknowledgeMut.isPending}
                    >
                      {acknowledgeMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                      Acknowledge
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

function TrendsTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [stage, setStage] = useState("emergence");

  const STAGES = ["emergence", "growth", "peak", "decline", "dormant", "reactivation"];

  const { data: trends, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/trends"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/trends", {
        topic,
        stage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/trends"] });
      setTopic("");
      setStage("emergence");
      toast({ title: "Trend created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStageMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      apiRequest("PATCH", `/api/knowledge/trends/${id}`, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/trends"] });
      toast({ title: "Trend stage updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/trends/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/trends"] });
      toast({ title: "Trend deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-trends-title">Trend Lifecycle</h3>
          <p className="text-sm text-muted-foreground">Track trends through their lifecycle stages</p>
        </div>
        <TabInfo description="Follow topics through their full lifecycle — from emergence and growth through peak coverage, decline, dormancy, and potential reactivation. Understand where each trend sits in its natural cycle." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Topic</Label>
            <Input data-testid="input-trend-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Trend topic" />
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger data-testid="select-trend-stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="button-create-trend" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Trend
          </Button>
        </CardContent>
      </Card>

      {(!trends || trends.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-trends">No trends yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {trends.map((t: any) => (
            <Card key={t.id} data-testid={`card-trend-${t.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-trend-topic-${t.id}`}>{t.topic}</span>
                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate capitalize text-xs">{t.stage}</Badge>
                    </div>
                    {t.createdAt && <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Select value={t.stage} onValueChange={(val) => updateStageMut.mutate({ id: t.id, stage: val })}>
                      <SelectTrigger data-testid={`select-trend-stage-${t.id}`} className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => (
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" data-testid={`button-delete-trend-${t.id}`} onClick={() => deleteMut.mutate(t.id)}>
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
  const [periodType, setPeriodType] = useState("monthly");
  const [summary, setSummary] = useState("");

  const { data: briefings, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/briefings"],
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/knowledge/briefings", {
        periodType,
        summary,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/briefings"] });
      setPeriodType("monthly");
      setSummary("");
      toast({ title: "Briefing created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/knowledge/briefings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/briefings"] });
      toast({ title: "Briefing deleted" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-briefings-title">Long-Range Briefings</h3>
          <p className="text-sm text-muted-foreground">Create periodic briefing summaries for long-term intelligence</p>
        </div>
        <TabInfo description="Generate monthly, quarterly, or yearly intelligence summaries. These long-range briefings distill patterns, key developments, and strategic insights over extended time periods for leadership review." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Period Type</Label>
            <Select value={periodType} onValueChange={setPeriodType}>
              <SelectTrigger data-testid="select-briefing-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea data-testid="input-briefing-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Briefing summary..." />
          </div>
          <Button data-testid="button-create-briefing" onClick={() => createMut.mutate()} disabled={!summary || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Briefing
          </Button>
        </CardContent>
      </Card>

      {(!briefings || briefings.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-briefings">No briefings yet. Create one above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {briefings.map((b: any) => (
            <Card key={b.id} data-testid={`card-briefing-${b.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate capitalize text-xs">{b.periodType}</Badge>
                    </div>
                    <p className="text-sm" data-testid={`text-briefing-summary-${b.id}`}>{b.summary}</p>
                    {b.createdAt && <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>}
                  </div>
                  <Button size="icon" variant="ghost" data-testid={`button-delete-briefing-${b.id}`} onClick={() => deleteMut.mutate(b.id)}>
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

function AIMemoryTab() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");

  const { data: answers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/knowledge/ai-answers"],
  });

  const askMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/knowledge/ai-answers", { query });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/ai-answers"] });
      setQuery("");
      toast({ title: "Answer received" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-ai-memory-title">Memory-Enhanced AI Q&A</h3>
          <p className="text-sm text-muted-foreground">Ask questions and get answers informed by historical knowledge</p>
        </div>
        <TabInfo description="Ask questions and receive AI-powered answers that draw on your stored institutional knowledge, entity memories, and historical patterns. The AI uses your organization's context for more relevant, informed responses." />
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Your Question</Label>
            <Textarea data-testid="input-ai-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask a question..." />
          </div>
          <Button data-testid="button-ask-ai" onClick={() => askMut.mutate()} disabled={!query || askMut.isPending}>
            {askMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Ask AI
          </Button>
        </CardContent>
      </Card>

      {(!answers || answers.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-ai-answers">No past answers yet. Ask a question above.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {answers.map((a: any) => (
            <Card key={a.id} data-testid={`card-ai-answer-${a.id}`}>
              <CardContent className="py-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm" data-testid={`text-ai-query-${a.id}`}>{a.query}</span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid={`text-ai-answer-${a.id}`}>{a.answer}</p>
                  {a.createdAt && <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-comparisons-title">Historical Comparisons</h3>
          <p className="text-sm text-muted-foreground">Compare current events against historical data to find patterns and insights</p>
        </div>
        <TabInfo description="Compare current events side-by-side with historical data. Analyze today vs. last week, this event vs. similar past events, or this quarter vs. the same quarter last year to uncover trends and recurring dynamics." />
      </div>

      <Card>
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <GitCompare className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h4 className="font-semibold" data-testid="text-comparison-heading">Historical Comparison Mode</h4>
              <p className="text-sm text-muted-foreground mt-2">
                Compare events across time periods to uncover trends and recurring patterns.
              </p>
            </div>
            <div className="flex flex-col gap-3 max-w-md mx-auto">
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">Today</Badge>
                    <span className="text-sm text-muted-foreground">vs</span>
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">Last Week</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Compare current headlines and sentiment against the previous week</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">This Event</Badge>
                    <span className="text-sm text-muted-foreground">vs</span>
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">Similar Past Events</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Find and compare similar events from your historical archive</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">This Quarter</Badge>
                    <span className="text-sm text-muted-foreground">vs</span>
                    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">Same Quarter Last Year</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Year-over-year comparison for long-range trend analysis</p>
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">Full comparison functionality coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-knowledge-title">Knowledge Memory</h1>
        <p className="text-muted-foreground" data-testid="text-knowledge-subtitle">Historical intelligence, patterns, and institutional memory</p>
      </div>

      <Tabs defaultValue="timelines" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="timelines" data-testid="tab-timelines"><Clock className="w-4 h-4 mr-1" />Timelines</TabsTrigger>
          <TabsTrigger value="patterns" data-testid="tab-patterns"><RefreshCw className="w-4 h-4 mr-1" />Patterns</TabsTrigger>
          <TabsTrigger value="entity-memory" data-testid="tab-entity-memory"><Brain className="w-4 h-4 mr-1" />Entity Memory</TabsTrigger>
          <TabsTrigger value="narratives" data-testid="tab-narratives"><BookOpen className="w-4 h-4 mr-1" />Narratives</TabsTrigger>
          <TabsTrigger value="org-notes" data-testid="tab-org-notes"><FileText className="w-4 h-4 mr-1" />Org Notes</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts"><AlertTriangle className="w-4 h-4 mr-1" />Alerts</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends"><TrendingUp className="w-4 h-4 mr-1" />Trends</TabsTrigger>
          <TabsTrigger value="briefings" data-testid="tab-briefings"><Calendar className="w-4 h-4 mr-1" />Briefings</TabsTrigger>
          <TabsTrigger value="ai-memory" data-testid="tab-ai-memory"><Sparkles className="w-4 h-4 mr-1" />AI Memory</TabsTrigger>
          <TabsTrigger value="comparisons" data-testid="tab-comparisons"><GitCompare className="w-4 h-4 mr-1" />Comparisons</TabsTrigger>
        </TabsList>

        <TabsContent value="timelines"><TimelinesTab /></TabsContent>
        <TabsContent value="patterns"><PatternsTab /></TabsContent>
        <TabsContent value="entity-memory"><EntityMemoryTab /></TabsContent>
        <TabsContent value="narratives"><NarrativesTab /></TabsContent>
        <TabsContent value="org-notes"><OrgNotesTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
        <TabsContent value="trends"><TrendsTab /></TabsContent>
        <TabsContent value="briefings"><BriefingsTab /></TabsContent>
        <TabsContent value="ai-memory"><AIMemoryTab /></TabsContent>
        <TabsContent value="comparisons"><ComparisonsTab /></TabsContent>
      </Tabs>
    </div>
  );
}