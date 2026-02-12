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
  TrendingUp,
  Zap,
  Shield,
  Network,
  Timer,
  Bell,
  Target,
  BarChart3,
  Sparkles,
  FileText,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
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

const stageColors: Record<string, string> = {
  emerging: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  escalating: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  peaking: "bg-red-500/10 text-red-700 dark:text-red-400",
  declining: "bg-green-500/10 text-green-700 dark:text-green-400",
};

function TopicForecastsTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [stage, setStage] = useState("emerging");
  const [confidence, setConfidence] = useState(50);
  const [prob24h, setProb24h] = useState(50);
  const [prob7d, setProb7d] = useState(50);

  const { data: forecasts, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/topics"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/topics", {
        topic,
        predictedStage: stage,
        confidenceScore: confidence,
        next24hProbability: prob24h,
        next7dProbability: prob7d,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/topics"] });
      setTopic("");
      toast({ title: "Forecast created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/topics/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/topics"] }),
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Track how topics evolve over time. Monitor momentum, acceleration, and media amplification to estimate the probability of a topic trending in the next 24 hours or 7 days." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Topic</Label>
              <Input data-testid="input-forecast-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Trade Sanctions" />
            </div>
            <div>
              <Label>Predicted Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger data-testid="select-forecast-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emerging">Emerging</SelectItem>
                  <SelectItem value="escalating">Escalating</SelectItem>
                  <SelectItem value="peaking">Peaking</SelectItem>
                  <SelectItem value="declining">Declining</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>24h Probability: {prob24h}%</Label>
              <Slider data-testid="slider-forecast-24h" value={[prob24h]} onValueChange={v => setProb24h(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
            <div>
              <Label>7-Day Probability: {prob7d}%</Label>
              <Slider data-testid="slider-forecast-7d" value={[prob7d]} onValueChange={v => setProb7d(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
            <div>
              <Label>Confidence: {confidence}%</Label>
              <Slider data-testid="slider-forecast-confidence" value={[confidence]} onValueChange={v => setConfidence(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
          </div>
          <Button data-testid="button-create-forecast" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Forecast
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {forecasts?.map((f: any) => (
        <Card key={f.id} data-testid={`card-forecast-${f.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-medium" data-testid={`text-forecast-topic-${f.id}`}>{f.topic}</span>
                  <Badge className={`no-default-hover-elevate no-default-active-elevate text-xs ${stageColors[f.predictedStage] || ""}`}>
                    {f.predictedStage}
                  </Badge>
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{f.confidenceScore}% confidence</Badge>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>24h: {f.next24hProbability}%</span>
                  <span>7d: {f.next7dProbability}%</span>
                </div>
                {f.explanation && <p className="text-sm text-muted-foreground">{f.explanation}</p>}
              </div>
              <Button data-testid={`button-delete-forecast-${f.id}`} size="icon" variant="ghost" onClick={() => deleteMut.mutate(f.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {forecasts?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No topic forecasts yet</p>}
    </div>
  );
}

function EarlySignalsTab() {
  const { toast } = useToast();
  const [signalType, setSignalType] = useState("new_actors");
  const [relatedTopic, setRelatedTopic] = useState("");
  const [strength, setStrength] = useState(50);
  const [explanation, setExplanation] = useState("");

  const { data: signals, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/signals"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/signals", {
        signalType,
        relatedTopic,
        strength,
        explanation: explanation || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/signals"] });
      setRelatedTopic("");
      setExplanation("");
      toast({ title: "Signal recorded" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/signals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/signals"] }),
  });

  const signalTypeLabels: Record<string, string> = {
    new_actors: "New Actors Appearing",
    tone_shift: "Tone Shift Before Spike",
    cross_region: "Cross-Region Clustering",
    volume_surge: "Volume Surge",
    sentiment_divergence: "Sentiment Divergence",
  };

  return (
    <div className="space-y-4">
      <TabInfo description="Detect unusual patterns that may indicate developing stories. Flags include new actors appearing, sudden tone shifts, cross-region clustering, and unexpected volume surges." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Signal Type</Label>
              <Select value={signalType} onValueChange={setSignalType}>
                <SelectTrigger data-testid="select-signal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_actors">New Actors Appearing</SelectItem>
                  <SelectItem value="tone_shift">Tone Shift Before Spike</SelectItem>
                  <SelectItem value="cross_region">Cross-Region Clustering</SelectItem>
                  <SelectItem value="volume_surge">Volume Surge</SelectItem>
                  <SelectItem value="sentiment_divergence">Sentiment Divergence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Topic</Label>
              <Input data-testid="input-signal-topic" value={relatedTopic} onChange={e => setRelatedTopic(e.target.value)} placeholder="e.g. Elections" />
            </div>
          </div>
          <div>
            <Label>Strength: {strength}%</Label>
            <Slider data-testid="slider-signal-strength" value={[strength]} onValueChange={v => setStrength(v[0])} min={0} max={100} step={1} className="mt-2" />
          </div>
          <div>
            <Label>Explanation</Label>
            <Textarea data-testid="input-signal-explanation" value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Why is this signal important?" className="resize-none" />
          </div>
          <Button data-testid="button-create-signal" onClick={() => createMut.mutate()} disabled={!relatedTopic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Record Signal
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {signals?.map((s: any) => (
        <Card key={s.id} data-testid={`card-signal-${s.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">{signalTypeLabels[s.signalType] || s.signalType}</span>
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{s.strength}% strength</Badge>
                </div>
                <p className="text-sm">{s.relatedTopic}</p>
                {s.explanation && <p className="text-sm text-muted-foreground">{s.explanation}</p>}
                {s.detectedAt && <span className="text-xs text-muted-foreground">{new Date(s.detectedAt).toLocaleString()}</span>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(s.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {signals?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No early warning signals detected</p>}
    </div>
  );
}

function ScenarioTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [hypothetical, setHypothetical] = useState("");
  const [result, setResult] = useState<any>(null);

  const simulateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/forecast/simulate", { topic, hypotheticalEvent: hypothetical }),
    onSuccess: async (response) => {
      const data = await response.json();
      setResult(data);
      toast({ title: "Simulation complete" });
    },
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Run AI-powered what-if analysis. Model potential outcomes by exploring hypothetical situations and generate plausible scenarios based on current coverage and historical patterns." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <Label>Topic or Entity</Label>
            <Input data-testid="input-sim-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. US-China Trade Relations" />
          </div>
          <div>
            <Label>Hypothetical Event</Label>
            <Textarea data-testid="input-sim-event" value={hypothetical} onChange={e => setHypothetical(e.target.value)} placeholder="e.g. New tariffs announced on semiconductor imports" className="resize-none" />
          </div>
          <Button data-testid="button-simulate" onClick={() => simulateMut.mutate()} disabled={!topic || !hypothetical || simulateMut.isPending}>
            {simulateMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Run Simulation
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card data-testid="card-simulation-result">
          <CardContent className="py-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Target className="w-4 h-4" /> Simulation Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-muted-foreground">Coverage Increase Likelihood</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${result.coverageIncreaseLikelihood || 0}%` }} />
                    </div>
                    <span className="text-sm font-medium">{result.coverageIncreaseLikelihood || 0}%</span>
                  </div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Sentiment Impact</span>
                  <p className="text-sm font-medium">{result.sentimentImpact || "N/A"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Timeframe</span>
                  <p className="text-sm font-medium">{result.timeframe || "N/A"}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-muted-foreground">Risk Assessment</span>
                  <p className="text-sm font-medium">{result.riskAssessment || "N/A"}</p>
                </div>
                {result.relatedTopicsActivation?.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Related Topics Activated</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.relatedTopicsActivation.map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {result.explanation && (
              <div className="border-t pt-3">
                <span className="text-sm text-muted-foreground">Explanation</span>
                <p className="text-sm mt-1">{result.explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RiskScoringTab() {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [subjectType, setSubjectType] = useState("topic");
  const [opRisk, setOpRisk] = useState(30);
  const [repRisk, setRepRisk] = useState(30);
  const [escRisk, setEscRisk] = useState(30);

  const { data: risks, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/risks"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/risks", {
        subject,
        subjectType,
        operationalRisk: opRisk,
        reputationalRisk: repRisk,
        escalationRisk: escRisk,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/risks"] });
      setSubject("");
      toast({ title: "Risk score created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/risks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/risks"] }),
  });

  const riskColor = (score: number) => {
    if (score >= 70) return "text-red-600 dark:text-red-400";
    if (score >= 40) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
  };

  return (
    <div className="space-y-4">
      <TabInfo description="Assign risk levels to topics and stories across operational, reputational, and escalation dimensions. Helps prioritize which developments need immediate attention." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Subject</Label>
              <Input data-testid="input-risk-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Company X, Trade War" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={subjectType} onValueChange={setSubjectType}>
                <SelectTrigger data-testid="select-risk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="topic">Topic</SelectItem>
                  <SelectItem value="entity">Entity</SelectItem>
                  <SelectItem value="region">Region</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Operational Risk: {opRisk}%</Label>
              <Slider value={[opRisk]} onValueChange={v => setOpRisk(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
            <div>
              <Label>Reputational Risk: {repRisk}%</Label>
              <Slider value={[repRisk]} onValueChange={v => setRepRisk(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
            <div>
              <Label>Escalation Risk: {escRisk}%</Label>
              <Slider value={[escRisk]} onValueChange={v => setEscRisk(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
          </div>
          <Button data-testid="button-create-risk" onClick={() => createMut.mutate()} disabled={!subject || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Risk Score
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {risks?.map((r: any) => (
        <Card key={r.id} data-testid={`card-risk-${r.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Shield className="w-4 h-4" />
                  <span className="font-medium">{r.subject}</span>
                  <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">{r.subjectType}</Badge>
                </div>
                <div className="flex gap-4 text-sm flex-wrap">
                  <span className={riskColor(r.operationalRisk)}>Operational: {r.operationalRisk}%</span>
                  <span className={riskColor(r.reputationalRisk)}>Reputational: {r.reputationalRisk}%</span>
                  <span className={riskColor(r.escalationRisk)}>Escalation: {r.escalationRisk}%</span>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(r.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {risks?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No risk scores yet</p>}
    </div>
  );
}

function InfluenceMapTab() {
  const { toast } = useToast();
  const [sourceA, setSourceA] = useState("");
  const [sourceB, setSourceB] = useState("");
  const [strength, setStrength] = useState(50);
  const [relationship, setRelationship] = useState("amplifies");

  const { data: graph, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/influence"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/influence", {
        sourceA,
        sourceB,
        influenceStrength: strength,
        relationship,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/influence"] });
      setSourceA("");
      setSourceB("");
      toast({ title: "Influence mapping added" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/influence/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/influence"] }),
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Track how stories spread from source to source. Identify which outlets are driving narratives and which are following, revealing the cascade of influence across the media landscape." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Origin Source</Label>
              <Input data-testid="input-influence-a" value={sourceA} onChange={e => setSourceA(e.target.value)} placeholder="e.g. Reuters" />
            </div>
            <div>
              <Label>Amplifier Source</Label>
              <Input data-testid="input-influence-b" value={sourceB} onChange={e => setSourceB(e.target.value)} placeholder="e.g. CNN" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Influence Strength: {strength}%</Label>
              <Slider value={[strength]} onValueChange={v => setStrength(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
            <div>
              <Label>Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger data-testid="select-influence-rel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amplifies">Amplifies</SelectItem>
                  <SelectItem value="contradicts">Contradicts</SelectItem>
                  <SelectItem value="delays">Delays</SelectItem>
                  <SelectItem value="originates">Originates</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button data-testid="button-create-influence" onClick={() => createMut.mutate()} disabled={!sourceA || !sourceB || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Mapping
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {graph?.map((g: any) => (
        <Card key={g.id} data-testid={`card-influence-${g.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Network className="w-4 h-4" />
                  <span className="font-medium">{g.sourceA}</span>
                  <span className="text-muted-foreground">{g.relationship}</span>
                  <span className="font-medium">{g.sourceB}</span>
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{g.influenceStrength}% strength</Badge>
                </div>
                {g.cascadeDelay && <span className="text-xs text-muted-foreground">Cascade delay: {g.cascadeDelay}min</span>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(g.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {graph?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No influence mappings yet</p>}
    </div>
  );
}

function AttentionDecayTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [daysRemaining, setDaysRemaining] = useState(7);
  const [decayRate, setDecayRate] = useState(50);
  const [explanation, setExplanation] = useState("");

  const { data: decay, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/attention"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/attention", {
        topic,
        estimatedDaysRemaining: daysRemaining,
        decayRate,
        explanation: explanation || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/attention"] });
      setTopic("");
      setExplanation("");
      toast({ title: "Attention estimate added" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/attention/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/attention"] }),
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Predict how long a story will stay in the news cycle. Estimates decay rate and remaining days of coverage, helping you gauge whether a story is fading or has staying power." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <Label>Topic</Label>
            <Input data-testid="input-decay-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Government Shutdown" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Estimated Days Remaining: {daysRemaining}</Label>
              <Slider value={[daysRemaining]} onValueChange={v => setDaysRemaining(v[0])} min={1} max={90} step={1} className="mt-2" />
            </div>
            <div>
              <Label>Decay Rate: {decayRate}%</Label>
              <Slider value={[decayRate]} onValueChange={v => setDecayRate(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
          </div>
          <div>
            <Label>Explanation</Label>
            <Textarea data-testid="input-decay-explanation" value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Why this estimate?" className="resize-none" />
          </div>
          <Button data-testid="button-create-decay" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Estimate
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {decay?.map((d: any) => (
        <Card key={d.id} data-testid={`card-decay-${d.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Timer className="w-4 h-4" />
                  <span className="font-medium">{d.topic}</span>
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{d.estimatedDaysRemaining} days left</Badge>
                  <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">Decay: {d.decayRate}%</Badge>
                </div>
                {d.explanation && <p className="text-sm text-muted-foreground">{d.explanation}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(d.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {decay?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No attention decay estimates yet</p>}
    </div>
  );
}

function AlertPriorityTab() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [score, setScore] = useState(50);
  const [accelerating, setAccelerating] = useState(false);
  const [multiRegion, setMultiRegion] = useState(false);
  const [volatility, setVolatility] = useState(false);

  const { data: priorities, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/alert-priority"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/alert-priority", {
        topic,
        score,
        acceleratingCoverage: accelerating,
        multiRegionSpread: multiRegion,
        sentimentVolatility: volatility,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/alert-priority"] });
      setTopic("");
      toast({ title: "Alert priority scored" });
    },
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Go beyond simple keyword alerts. Prioritize notifications by factoring in coverage acceleration, multi-region spread, and sentiment volatility to surface what truly matters." />
      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <Label>Topic</Label>
            <Input data-testid="input-alert-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Cybersecurity Breach" />
          </div>
          <div>
            <Label>Priority Score: {score}</Label>
            <Slider value={[score]} onValueChange={v => setScore(v[0])} min={0} max={100} step={1} className="mt-2" />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={accelerating} onChange={e => setAccelerating(e.target.checked)} data-testid="check-accelerating" />
              Accelerating Coverage
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={multiRegion} onChange={e => setMultiRegion(e.target.checked)} data-testid="check-multiregion" />
              Multi-Region Spread
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={volatility} onChange={e => setVolatility(e.target.checked)} data-testid="check-volatility" />
              Sentiment Volatility
            </label>
          </div>
          <Button data-testid="button-create-alert-priority" onClick={() => createMut.mutate()} disabled={!topic || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Score Alert
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {priorities?.map((p: any) => (
        <Card key={p.id} data-testid={`card-priority-${p.id}`}>
          <CardContent className="py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Bell className="w-4 h-4" />
                <span className="font-medium">{p.topic || `Alert #${p.alertId}`}</span>
                <Badge variant={p.score >= 70 ? "destructive" : "secondary"} className="no-default-hover-elevate no-default-active-elevate text-xs">Score: {p.score}</Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                {p.acceleratingCoverage && <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">Accelerating</Badge>}
                {p.multiRegionSpread && <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">Multi-Region</Badge>}
                {p.sentimentVolatility && <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">Volatile</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {priorities?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No alert priorities scored yet</p>}
    </div>
  );
}

function ForecastEvalTab() {
  const { toast } = useToast();
  const [forecastType, setForecastType] = useState("topic_trajectory");
  const [prediction, setPrediction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [accuracy, setAccuracy] = useState(50);

  const { data: results, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/results"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/results", {
        forecastType,
        originalPrediction: prediction,
        outcome,
        accuracyScore: accuracy,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/results"] });
      setPrediction("");
      setOutcome("");
      toast({ title: "Evaluation recorded" });
    },
  });

  const avgAccuracy = results?.length ? Math.round(results.reduce((sum: number, r: any) => sum + (r.accuracyScore || 0), 0) / results.length) : 0;

  return (
    <div className="space-y-4">
      <TabInfo description="Measure how accurate past predictions were. Track forecast performance over time so the system continuously learns and improves its predictive capabilities." />
      {results && results.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <BarChart3 className="w-5 h-5" />
              <div>
                <p className="text-sm text-muted-foreground">Average Forecast Accuracy</p>
                <p className="text-2xl font-bold">{avgAccuracy}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Evaluations</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Forecast Type</Label>
              <Select value={forecastType} onValueChange={setForecastType}>
                <SelectTrigger data-testid="select-eval-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="topic_trajectory">Topic Trajectory</SelectItem>
                  <SelectItem value="risk_score">Risk Score</SelectItem>
                  <SelectItem value="attention_decay">Attention Decay</SelectItem>
                  <SelectItem value="early_signal">Early Signal</SelectItem>
                  <SelectItem value="scenario">Scenario Simulation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Accuracy: {accuracy}%</Label>
              <Slider value={[accuracy]} onValueChange={v => setAccuracy(v[0])} min={0} max={100} step={1} className="mt-2" />
            </div>
          </div>
          <div>
            <Label>Original Prediction</Label>
            <Textarea data-testid="input-eval-prediction" value={prediction} onChange={e => setPrediction(e.target.value)} placeholder="What was predicted?" className="resize-none" />
          </div>
          <div>
            <Label>Actual Outcome</Label>
            <Textarea data-testid="input-eval-outcome" value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="What actually happened?" className="resize-none" />
          </div>
          <Button data-testid="button-create-eval" onClick={() => createMut.mutate()} disabled={!prediction || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Record Evaluation
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {results?.map((r: any) => (
        <Card key={r.id} data-testid={`card-eval-${r.id}`}>
          <CardContent className="py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Target className="w-4 h-4" />
                <span className="font-medium capitalize">{(r.forecastType || "").replace(/_/g, " ")}</span>
                <Badge variant={r.accuracyScore >= 70 ? "default" : "secondary"} className="no-default-hover-elevate no-default-active-elevate text-xs">{r.accuracyScore}% accurate</Badge>
              </div>
              {r.originalPrediction && <p className="text-sm"><span className="text-muted-foreground">Predicted:</span> {r.originalPrediction}</p>}
              {r.outcome && <p className="text-sm"><span className="text-muted-foreground">Outcome:</span> {r.outcome}</p>}
              {r.evaluatedAt && <span className="text-xs text-muted-foreground">{new Date(r.evaluatedAt).toLocaleString()}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
      {results?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No forecast evaluations yet</p>}
    </div>
  );
}

function FutureBriefingTab() {
  const { toast } = useToast();
  const [summary, setSummary] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: briefings, isLoading } = useQuery<any[]>({ queryKey: ["/api/forecast/future-briefings"] });

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forecast/future-briefings", {
        date: new Date().toISOString().split("T")[0],
        summary,
        possibleEscalations: [],
        emergingActors: [],
        fadingTopics: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/future-briefings"] });
      setSummary("");
      setDialogOpen(false);
      toast({ title: "Future briefing created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forecast/future-briefings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forecast/future-briefings"] }),
  });

  return (
    <div className="space-y-4">
      <TabInfo description="Forward-looking intelligence summaries. Preview possible escalations, emerging actors, and topics likely to fade — a briefing on what's coming rather than what already happened." />
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Forward-looking intelligence reports: what to watch next</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-future-briefing">
              <Plus className="w-4 h-4 mr-2" />
              New Future Briefing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Future Briefing</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Summary - What to Watch</Label>
                <Textarea data-testid="input-future-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Key developments to monitor, emerging risks, fading stories..." className="resize-none" />
              </div>
              <Button data-testid="button-create-future-briefing" onClick={() => createMut.mutate()} disabled={!summary || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Skeleton className="h-20 w-full" />}
      {briefings?.map((b: any) => (
        <Card key={b.id} data-testid={`card-future-briefing-${b.id}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">Briefing - {b.date}</span>
                </div>
                {b.summary && <p className="text-sm">{b.summary}</p>}
                {b.possibleEscalations?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Possible Escalations</p>
                    {b.possibleEscalations.map((e: any, i: number) => (
                      <div key={i} className="text-sm flex items-center gap-2 flex-wrap">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>{e.topic} ({e.probability}%)</span>
                      </div>
                    ))}
                  </div>
                )}
                {b.fadingTopics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Fading Topics</p>
                    <div className="flex flex-wrap gap-1">
                      {b.fadingTopics.map((f: any, i: number) => (
                        <Badge key={i} variant="outline" className="no-default-hover-elevate no-default-active-elevate text-xs">{f.topic} ({f.estimatedDaysLeft}d)</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(b.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {briefings?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No future briefings yet</p>}
    </div>
  );
}

export default function ForecastingPage() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-forecasting-title">Predictive Intelligence</h1>
        <p className="text-muted-foreground">Probabilistic foresight powered by historical patterns and signal analysis</p>
      </div>

      <Tabs defaultValue="trajectories">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="trajectories" data-testid="tab-trajectories" className="gap-1"><TrendingUp className="w-3 h-3" /> Trajectories</TabsTrigger>
          <TabsTrigger value="signals" data-testid="tab-signals" className="gap-1"><Zap className="w-3 h-3" /> Signals</TabsTrigger>
          <TabsTrigger value="scenarios" data-testid="tab-scenarios" className="gap-1"><Sparkles className="w-3 h-3" /> Scenarios</TabsTrigger>
          <TabsTrigger value="risks" data-testid="tab-risks" className="gap-1"><Shield className="w-3 h-3" /> Risks</TabsTrigger>
          <TabsTrigger value="influence" data-testid="tab-influence" className="gap-1"><Network className="w-3 h-3" /> Influence</TabsTrigger>
          <TabsTrigger value="attention" data-testid="tab-attention" className="gap-1"><Timer className="w-3 h-3" /> Attention</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alert-priority" className="gap-1"><Bell className="w-3 h-3" /> Alert Priority</TabsTrigger>
          <TabsTrigger value="evaluation" data-testid="tab-evaluation" className="gap-1"><Target className="w-3 h-3" /> Evaluation</TabsTrigger>
          <TabsTrigger value="briefing" data-testid="tab-future-briefing" className="gap-1"><FileText className="w-3 h-3" /> Future Brief</TabsTrigger>
        </TabsList>

        <TabsContent value="trajectories"><TopicForecastsTab /></TabsContent>
        <TabsContent value="signals"><EarlySignalsTab /></TabsContent>
        <TabsContent value="scenarios"><ScenarioTab /></TabsContent>
        <TabsContent value="risks"><RiskScoringTab /></TabsContent>
        <TabsContent value="influence"><InfluenceMapTab /></TabsContent>
        <TabsContent value="attention"><AttentionDecayTab /></TabsContent>
        <TabsContent value="alerts"><AlertPriorityTab /></TabsContent>
        <TabsContent value="evaluation"><ForecastEvalTab /></TabsContent>
        <TabsContent value="briefing"><FutureBriefingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
