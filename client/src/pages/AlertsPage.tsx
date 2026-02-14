import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Bell, TrendingUp, MessageSquare, Hash } from "lucide-react";

interface Alert {
  id: string;
  name: string;
  type: "keyword" | "spike" | "sentiment";
  delivery: string;
  enabled: boolean;
}

const DEMO_ALERTS: Alert[] = [
  { id: "1", name: "Breaking News Spike", type: "spike", delivery: "Email", enabled: true },
  { id: "2", name: "Negative Sentiment Alert", type: "sentiment", delivery: "In-app", enabled: true },
  { id: "3", name: "Competitor Mentions", type: "keyword", delivery: "Email + In-app", enabled: false },
  { id: "4", name: "Industry Keywords", type: "keyword", delivery: "Email", enabled: true },
];

const typeIcons: Record<string, typeof Hash> = {
  keyword: Hash,
  spike: TrendingUp,
  sentiment: MessageSquare,
};

const typeColors: Record<string, string> = {
  keyword: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  spike: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  sentiment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS);
  const [dialogOpen, setDialogOpen] = useState(false);

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">Get notified about important changes in your media landscape.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-create-alert">
              <Plus className="w-4 h-4 mr-1" /> Create Alert
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Alert Name</Label>
                <Input placeholder="e.g., Competitor Mentions" data-testid="input-alert-name" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select defaultValue="keyword">
                  <SelectTrigger data-testid="select-alert-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Keyword Match</SelectItem>
                    <SelectItem value="spike">Volume Spike</SelectItem>
                    <SelectItem value="sentiment">Sentiment Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delivery</Label>
                <Select defaultValue="email">
                  <SelectTrigger data-testid="select-alert-delivery">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="inapp">In-app</SelectItem>
                    <SelectItem value="both">Email + In-app</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)} data-testid="button-save-alert">
                Save Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const TypeIcon = typeIcons[alert.type] || Bell;
          return (
            <Card key={alert.id} className="p-4" data-testid={`card-alert-${alert.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <TypeIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-foreground truncate" data-testid={`text-alert-name-${alert.id}`}>
                      {alert.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className={`text-[10px] ${typeColors[alert.type]}`}>
                        {alert.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{alert.delivery}</span>
                    </div>
                  </div>
                </div>
                <Switch
                  checked={alert.enabled}
                  onCheckedChange={() => toggleAlert(alert.id)}
                  data-testid={`switch-alert-${alert.id}`}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
