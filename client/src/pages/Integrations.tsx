import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Webhook,
  Mail,
  MessageSquare,
  Code,
  Upload,
  Shield,
  Bell,
  Plus,
  Trash2,
  TestTube,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  Loader2,
  Info,
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

const EVENT_TYPES = [
  { value: "new_major_story", label: "New Major Story" },
  { value: "keyword_spike", label: "Keyword Spike Alert" },
  { value: "daily_briefing_ready", label: "Daily Briefing Ready" },
  { value: "sentiment_shift", label: "Sentiment Shift" },
  { value: "system_warning", label: "System Warning" },
];

const WIDGET_TYPES = [
  { value: "trending_topics", label: "Trending Topics" },
  { value: "sentiment_overview", label: "Sentiment Overview" },
  { value: "entity_tracker", label: "Entity Tracker" },
  { value: "daily_briefing", label: "Daily Briefing" },
];

function WebhooksTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: webhooks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/webhooks"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/webhooks", { url: newUrl, eventTypes: selectedEvents, description: newDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/webhooks"] });
      setDialogOpen(false);
      setNewUrl("");
      setNewDesc("");
      setSelectedEvents([]);
      toast({ title: "Webhook created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/webhooks"] });
      toast({ title: "Webhook deleted" });
    },
  });

  const testMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/integrations/webhooks/${id}/test`),
    onSuccess: () => toast({ title: "Test webhook sent" }),
    onError: (e: any) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const toggleEvent = (val: string) => {
    setSelectedEvents(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
  };

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-webhooks-title">Webhooks</h3>
            <TabInfo description="Send automated HTTP callbacks to external systems when events occur — new major stories, keyword spikes, daily briefings, or sentiment shifts. Signed with HMAC SHA-256 for security." />
          </div>
          <p className="text-sm text-muted-foreground">Send signed POST requests to external systems when events occur</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-webhook"><Plus className="w-4 h-4 mr-2" />Add Webhook</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Webhook</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Endpoint URL</Label>
                <Input data-testid="input-webhook-url" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://your-system.com/webhook" />
              </div>
              <div>
                <Label>Description</Label>
                <Input data-testid="input-webhook-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
              </div>
              <div>
                <Label>Events</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {EVENT_TYPES.map(et => (
                    <Badge
                      key={et.value}
                      data-testid={`badge-event-${et.value}`}
                      className={`cursor-pointer toggle-elevate ${selectedEvents.includes(et.value) ? "toggle-elevated bg-primary text-primary-foreground" : ""}`}
                      onClick={() => toggleEvent(et.value)}
                    >
                      {selectedEvents.includes(et.value) && <Check className="w-3 h-3 mr-1" />}
                      {et.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button data-testid="button-create-webhook" onClick={() => createMut.mutate()} disabled={!newUrl || selectedEvents.length === 0 || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Webhook
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!webhooks || webhooks.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No webhooks configured yet. Add one to start receiving events.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh: any) => (
            <Card key={wh.id} data-testid={`card-webhook-${wh.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono truncate" data-testid={`text-webhook-url-${wh.id}`}>{wh.url}</code>
                      <Badge variant={wh.active ? "default" : "secondary"}>{wh.active ? "Active" : "Inactive"}</Badge>
                    </div>
                    {wh.description && <p className="text-xs text-muted-foreground">{wh.description}</p>}
                    <div className="flex gap-1 flex-wrap">
                      {(wh.eventTypes || []).map((et: string) => (
                        <Badge key={et} variant="outline" className="text-xs">{et.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" data-testid={`button-test-webhook-${wh.id}`} onClick={() => testMut.mutate(wh.id)} disabled={testMut.isPending}>
                      <TestTube className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" data-testid={`button-delete-webhook-${wh.id}`} onClick={() => deleteMut.mutate(wh.id)}>
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

function CommunicationTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState("slack");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");

  const { data: configs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/communication"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/communication", { platform, webhookUrl, channelName, sendAlerts: true, sendBriefing: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/communication"] });
      setDialogOpen(false);
      toast({ title: "Channel connected" });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: boolean }) =>
      apiRequest("PATCH", `/api/integrations/communication/${id}`, { [field]: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/communication"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/communication/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/communication"] });
      toast({ title: "Channel removed" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-communication-title">Communication Channels</h3>
            <TabInfo description="Connect Slack or Microsoft Teams channels to receive real-time news alerts and briefing summaries directly in your team's communication platform." />
          </div>
          <p className="text-sm text-muted-foreground">Connect Slack or Microsoft Teams to receive alerts and briefings</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-channel"><Plus className="w-4 h-4 mr-2" />Add Channel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Connect Channel</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="teams">Microsoft Teams</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Incoming Webhook URL</Label>
                <Input data-testid="input-channel-webhook" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder={platform === "slack" ? "https://hooks.slack.com/services/..." : "https://outlook.office.com/webhook/..."} />
              </div>
              <div>
                <Label>Channel Name</Label>
                <Input data-testid="input-channel-name" value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="#news-alerts" />
              </div>
              <Button data-testid="button-connect-channel" onClick={() => createMut.mutate()} disabled={!webhookUrl || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Connect
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!configs || configs.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No channels connected. Add a Slack or Teams channel.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg: any) => (
            <Card key={cfg.id} data-testid={`card-channel-${cfg.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{cfg.platform}</span>
                        {cfg.channelName && <span className="text-sm text-muted-foreground">{cfg.channelName}</span>}
                        <Badge variant={cfg.active ? "default" : "secondary"}>{cfg.active ? "Active" : "Inactive"}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(cfg.id)} data-testid={`button-remove-channel-${cfg.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-6 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={cfg.sendAlerts} onCheckedChange={v => toggleMut.mutate({ id: cfg.id, field: "sendAlerts", value: v })} data-testid={`switch-alerts-${cfg.id}`} />
                    Send Alerts
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={cfg.sendBriefing} onCheckedChange={v => toggleMut.mutate({ id: cfg.id, field: "sendBriefing", value: v })} data-testid={`switch-briefing-${cfg.id}`} />
                    Morning Briefing
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={cfg.sendWeeklySummary} onCheckedChange={v => toggleMut.mutate({ id: cfg.id, field: "sendWeeklySummary", value: v })} data-testid={`switch-weekly-${cfg.id}`} />
                    Weekly Summary
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [topicInput, setTopicInput] = useState("");

  const { data: subs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/email-subscriptions"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/email-subscriptions", {
      email,
      frequency,
      topics: topicInput ? topicInput.split(",").map(t => t.trim()) : [],
      sendAlerts: true,
      sendBriefing: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/email-subscriptions"] });
      setDialogOpen(false);
      setEmail("");
      setTopicInput("");
      toast({ title: "Subscription created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/email-subscriptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/email-subscriptions"] });
      toast({ title: "Subscription removed" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-email-title">Email Subscriptions</h3>
            <TabInfo description="Set up email subscriptions for automated intelligence delivery. Schedule daily or weekly digests sent directly to stakeholders' inboxes." />
          </div>
          <p className="text-sm text-muted-foreground">Custom email schedules with topic-based filtering</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-email-sub"><Plus className="w-4 h-4 mr-2" />Add Subscription</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Email Subscription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email Address</Label>
                <Input data-testid="input-sub-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger data-testid="select-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realtime">Real-time</SelectItem>
                    <SelectItem value="daily">Daily Digest</SelectItem>
                    <SelectItem value="weekly">Weekly Summary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Topics (comma-separated, optional)</Label>
                <Input data-testid="input-sub-topics" value={topicInput} onChange={e => setTopicInput(e.target.value)} placeholder="economy, tech, politics" />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for all topics</p>
              </div>
              <Button data-testid="button-create-email-sub" onClick={() => createMut.mutate()} disabled={!email || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Subscribe
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!subs || subs.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No email subscriptions. Create one to receive updates.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {subs.map((sub: any) => (
            <Card key={sub.id} data-testid={`card-email-sub-${sub.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-sub-email-${sub.id}`}>{sub.email}</span>
                      <Badge variant="outline" className="capitalize">{sub.frequency}</Badge>
                      <Badge variant={sub.active ? "default" : "secondary"}>{sub.active ? "Active" : "Paused"}</Badge>
                    </div>
                    {sub.topics && sub.topics.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {sub.topics.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                      </div>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(sub.id)} data-testid={`button-delete-sub-${sub.id}`}>
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

function EmbedsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [widgetType, setWidgetType] = useState("trending_topics");
  const [domainInput, setDomainInput] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: embeds, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/embeds"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/embeds", {
      widgetType,
      allowedDomains: domainInput ? domainInput.split(",").map(d => d.trim()) : [],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/embeds"] });
      setDialogOpen(false);
      toast({ title: "Widget created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/embeds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/embeds"] });
      toast({ title: "Widget removed" });
    },
  });

  const copyCode = (embed: any) => {
    const baseUrl = window.location.origin;
    const code = `<iframe src="${baseUrl}/embed/${embed.token}" width="400" height="500" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code);
    setCopiedId(embed.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Embed code copied" });
  };

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-embeds-title">Embeddable Widgets</h3>
            <TabInfo description="Generate embeddable widgets that display live news feeds, trending topics, or sentiment gauges on external websites and internal portals." />
          </div>
          <p className="text-sm text-muted-foreground">Embed NWS360 panels into your own portals via iframe</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-embed"><Plus className="w-4 h-4 mr-2" />Create Widget</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Embeddable Widget</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Widget Type</Label>
                <Select value={widgetType} onValueChange={setWidgetType}>
                  <SelectTrigger data-testid="select-widget-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WIDGET_TYPES.map(wt => <SelectItem key={wt.value} value={wt.value}>{wt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Allowed Domains (comma-separated, optional)</Label>
                <Input data-testid="input-embed-domains" value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="portal.yourcompany.com" />
                <p className="text-xs text-muted-foreground mt-1">Leave empty to allow all domains</p>
              </div>
              <Button data-testid="button-create-embed" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Widget
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!embeds || embeds.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No widgets created. Create one to embed in external portals.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {embeds.map((emb: any) => (
            <Card key={emb.id} data-testid={`card-embed-${emb.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{emb.widgetType.replace(/_/g, " ")}</Badge>
                      <Badge variant={emb.active ? "default" : "secondary"}>{emb.active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="bg-muted p-2 rounded text-xs font-mono truncate" data-testid={`text-embed-code-${emb.id}`}>
                      {`<iframe src="${window.location.origin}/embed/${emb.token}" width="400" height="500" frameborder="0"></iframe>`}
                    </div>
                    {emb.allowedDomains && emb.allowedDomains.length > 0 && (
                      <p className="text-xs text-muted-foreground">Allowed: {emb.allowedDomains.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => copyCode(emb)} data-testid={`button-copy-embed-${emb.id}`}>
                      {copiedId === emb.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => window.open(`/embed/${emb.token}`, "_blank")} data-testid={`button-preview-embed-${emb.id}`}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(emb.id)} data-testid={`button-delete-embed-${emb.id}`}>
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

function ExportsTab() {
  const { toast } = useToast();
  const [exportType, setExportType] = useState("articles");
  const [format, setFormat] = useState("json");

  const { data: jobs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/exports"],
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/export", { exportType, format, filters: {} });
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nws360-${exportType}-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nws360-${exportType}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/exports"] });
      toast({ title: "Export complete" });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1">
          <h3 className="text-lg font-semibold" data-testid="text-exports-title">Data Export</h3>
          <TabInfo description="Export your data in JSON or CSV format. Download articles, analytics, or briefings for offline analysis, presentations, or integration with other tools." />
        </div>
        <p className="text-sm text-muted-foreground">Export insights in JSON or CSV format for external systems</p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Data Type</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger data-testid="select-export-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="articles">Articles</SelectItem>
                  <SelectItem value="entities">Entities</SelectItem>
                  <SelectItem value="stories">Story Clusters</SelectItem>
                  <SelectItem value="trends">Trends</SelectItem>
                  <SelectItem value="briefings">Briefings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger data-testid="select-export-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending} data-testid="button-export">
            {exportMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export Data
          </Button>
        </CardContent>
      </Card>

      {jobs && jobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Exports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.slice(0, 10).map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell className="capitalize">{j.exportType}</TableCell>
                    <TableCell className="uppercase">{j.format}</TableCell>
                    <TableCell><Badge variant={j.status === "completed" ? "default" : "secondary"}>{j.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DataImportTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connType, setConnType] = useState("private_rss");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const { data: connectors, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/import-connectors"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/import-connectors", { connectorType: connType, name, url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/import-connectors"] });
      setDialogOpen(false);
      setName("");
      setUrl("");
      toast({ title: "Connector created" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/import-connectors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/import-connectors"] });
      toast({ title: "Connector removed" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-import-title">Data Import</h3>
            <TabInfo description="Import data from external sources — CSV files, API endpoints, or other intelligence platforms. Bring in historical data or supplement your feeds." />
          </div>
          <p className="text-sm text-muted-foreground">Connect private RSS feeds or upload internal data sources</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-connector"><Plus className="w-4 h-4 mr-2" />Add Connector</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Data Connector</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Connector Type</Label>
                <Select value={connType} onValueChange={setConnType}>
                  <SelectTrigger data-testid="select-connector-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private_rss">Private RSS Feed</SelectItem>
                    <SelectItem value="internal_report">Internal Reports</SelectItem>
                    <SelectItem value="document_upload">Document Upload</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input data-testid="input-connector-name" value={name} onChange={e => setName(e.target.value)} placeholder="Internal News Feed" />
              </div>
              {connType !== "document_upload" && (
                <div>
                  <Label>URL</Label>
                  <Input data-testid="input-connector-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://internal.company.com/feed.xml" />
                </div>
              )}
              <Button data-testid="button-create-connector" onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Connector
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!connectors || connectors.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No data connectors. Add a private RSS feed or document source.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {connectors.map((c: any) => (
            <Card key={c.id} data-testid={`card-connector-${c.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline">{c.connectorType.replace(/_/g, " ")}</Badge>
                        <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      {c.url && <p className="text-xs text-muted-foreground font-mono truncate max-w-md">{c.url}</p>}
                      <p className="text-xs text-muted-foreground">{c.itemsImported || 0} items imported</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(c.id)} data-testid={`button-delete-connector-${c.id}`}>
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

function SsoTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [provider, setProvider] = useState("google");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");

  const { data: configs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/integrations/sso"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/sso", { provider, entityId, ssoUrl, defaultRole: "client" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/sso"] });
      setDialogOpen(false);
      toast({ title: "SSO provider added" });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/integrations/sso/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/sso"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/sso/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/sso"] });
      toast({ title: "SSO config removed" });
    },
  });

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold" data-testid="text-sso-title">Single Sign-On (SSO)</h3>
            <TabInfo description="Configure Single Sign-On with Google, Microsoft, or SAML providers. Simplify authentication for your organization while maintaining security." />
          </div>
          <p className="text-sm text-muted-foreground">Enterprise login via Google Workspace, Microsoft Entra ID, or SAML</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-sso"><Plus className="w-4 h-4 mr-2" />Add Provider</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Configure SSO Provider</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger data-testid="select-sso-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Workspace</SelectItem>
                    <SelectItem value="microsoft">Microsoft Entra ID</SelectItem>
                    <SelectItem value="saml">SAML Provider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entity ID / Client ID</Label>
                <Input data-testid="input-sso-entity" value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="your-client-id" />
              </div>
              <div>
                <Label>SSO URL / Metadata URL</Label>
                <Input data-testid="input-sso-url" value={ssoUrl} onChange={e => setSsoUrl(e.target.value)} placeholder="https://accounts.google.com/..." />
              </div>
              <Button data-testid="button-create-sso" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Add Provider
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!configs || configs.length === 0) ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No SSO providers configured. Enterprise clients can connect identity providers here.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg: any) => (
            <Card key={cfg.id} data-testid={`card-sso-${cfg.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{cfg.provider}</span>
                        <Badge variant={cfg.active ? "default" : "secondary"}>{cfg.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      {cfg.entityId && <p className="text-xs text-muted-foreground">{cfg.entityId}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={cfg.active} onCheckedChange={v => toggleMut.mutate({ id: cfg.id, active: v })} data-testid={`switch-sso-active-${cfg.id}`} />
                    <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(cfg.id)} data-testid={`button-delete-sso-${cfg.id}`}>
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

function MobileNotificationsTab() {
  const { toast } = useToast();

  const { data: prefs, isLoading } = useQuery<any>({
    queryKey: ["/api/integrations/mobile-notifications"],
  });

  const saveMut = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/integrations/mobile-notifications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/mobile-notifications"] });
      toast({ title: "Notification preferences saved" });
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const p = prefs || { criticalAlerts: true, briefingReady: true, entityChanges: false, severityLevel: "high" };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1">
          <h3 className="text-lg font-semibold" data-testid="text-mobile-title">Mobile Notifications</h3>
          <TabInfo description="Configure push notification preferences for mobile devices. Choose which alert types and priority levels trigger mobile notifications." />
        </div>
        <p className="text-sm text-muted-foreground">Control push notification preferences and severity levels</p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <span className="font-medium">Critical Alerts</span>
              <p className="text-xs text-muted-foreground">High-priority breaking news and system alerts</p>
            </div>
            <Switch checked={p.criticalAlerts} onCheckedChange={v => saveMut.mutate({ ...p, criticalAlerts: v })} data-testid="switch-critical-alerts" />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <span className="font-medium">Briefing Ready</span>
              <p className="text-xs text-muted-foreground">Notify when daily briefing is generated</p>
            </div>
            <Switch checked={p.briefingReady} onCheckedChange={v => saveMut.mutate({ ...p, briefingReady: v })} data-testid="switch-briefing-ready" />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <span className="font-medium">Entity Changes</span>
              <p className="text-xs text-muted-foreground">Notify when tracked entities have significant updates</p>
            </div>
            <Switch checked={p.entityChanges} onCheckedChange={v => saveMut.mutate({ ...p, entityChanges: v })} data-testid="switch-entity-changes" />
          </label>
          <div>
            <Label>Minimum Severity Level</Label>
            <Select value={p.severityLevel} onValueChange={v => saveMut.mutate({ ...p, severityLevel: v })}>
              <SelectTrigger data-testid="select-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (all notifications)</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High (critical only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Integrations() {
  return (
    <div className="space-y-6" data-testid="page-integrations">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Integrations</h1>
        <p className="text-muted-foreground mt-1">Connect NWS360 with external systems, communication platforms, and enterprise tools</p>
      </div>

      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1" data-testid="tabs-integrations">
          <TabsTrigger value="webhooks" data-testid="tab-webhooks" className="gap-1.5"><Webhook className="w-4 h-4" />Webhooks</TabsTrigger>
          <TabsTrigger value="communication" data-testid="tab-communication" className="gap-1.5"><MessageSquare className="w-4 h-4" />Communication</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email" className="gap-1.5"><Mail className="w-4 h-4" />Email</TabsTrigger>
          <TabsTrigger value="embeds" data-testid="tab-embeds" className="gap-1.5"><Code className="w-4 h-4" />Embeds</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-exports" className="gap-1.5"><Download className="w-4 h-4" />Exports</TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import" className="gap-1.5"><Upload className="w-4 h-4" />Data Import</TabsTrigger>
          <TabsTrigger value="sso" data-testid="tab-sso" className="gap-1.5"><Shield className="w-4 h-4" />SSO</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications" className="gap-1.5"><Bell className="w-4 h-4" />Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
        <TabsContent value="communication"><CommunicationTab /></TabsContent>
        <TabsContent value="email"><EmailTab /></TabsContent>
        <TabsContent value="embeds"><EmbedsTab /></TabsContent>
        <TabsContent value="exports"><ExportsTab /></TabsContent>
        <TabsContent value="import"><DataImportTab /></TabsContent>
        <TabsContent value="sso"><SsoTab /></TabsContent>
        <TabsContent value="notifications"><MobileNotificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
