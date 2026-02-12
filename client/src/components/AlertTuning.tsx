import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Save } from "lucide-react";

interface AlertPreference {
  alertType: string;
  sensitivityScore: number;
  autoTuned: boolean;
}

const ALERT_TYPES = [
  { key: "volume_spike", label: "Volume Spike" },
  { key: "sentiment_shift", label: "Sentiment Shift" },
  { key: "emerging_topic", label: "Emerging Topic" },
  { key: "narrative_change", label: "Narrative Change" },
];

export function AlertTuning() {
  const [localPrefs, setLocalPrefs] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: alertPrefs, isLoading } = useQuery<AlertPreference[]>({
    queryKey: ["/api/alert-preferences"],
  });

  useEffect(() => {
    if (alertPrefs) {
      const mapped: Record<string, number> = {};
      alertPrefs.forEach((p) => {
        mapped[p.alertType] = p.sensitivityScore;
      });
      ALERT_TYPES.forEach((at) => {
        if (!(at.key in mapped)) {
          mapped[at.key] = 50;
        }
      });
      setLocalPrefs(mapped);
      setHasChanges(false);
    }
  }, [alertPrefs]);

  const saveMutation = useMutation({
    mutationFn: async (data: AlertPreference[]) => {
      await apiRequest("POST", "/api/alert-preferences", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-preferences"] });
      setHasChanges(false);
    },
  });

  const handleChange = (alertType: string, value: number) => {
    setLocalPrefs((prev) => ({ ...prev, [alertType]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const payload: AlertPreference[] = ALERT_TYPES.map((at) => ({
      alertType: at.key,
      sensitivityScore: localPrefs[at.key] ?? 50,
      autoTuned: false,
    }));
    saveMutation.mutate(payload);
  };

  const getAutoTuned = (key: string): boolean => {
    return alertPrefs?.find((p) => p.alertType === key)?.autoTuned ?? false;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-alert-tuning">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Alert Sensitivity</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {ALERT_TYPES.map((at) => (
          <div key={at.key} className="space-y-1.5" data-testid={`alert-type-${at.key}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-medium">{at.label}</span>
              <div className="flex items-center gap-2">
                {getAutoTuned(at.key) && (
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-auto-tuned-${at.key}`}>
                    Auto-tuned
                  </Badge>
                )}
                <span className="text-xs tabular-nums text-muted-foreground" data-testid={`value-sensitivity-${at.key}`}>
                  {localPrefs[at.key] ?? 50}
                </span>
              </div>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[localPrefs[at.key] ?? 50]}
              onValueChange={(vals) => handleChange(at.key, vals[0])}
              data-testid={`slider-${at.key}`}
            />
          </div>
        ))}

        {hasChanges && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-alert-preferences"
          >
            <Save />
            {saveMutation.isPending ? "Saving..." : "Save Alert Settings"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
