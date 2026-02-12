import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pin, Star, Plus, X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPreferences {
  pinnedTopics: string[];
  favoriteEntities: string[];
  preferredSources: number[];
  recommendedPanels: Record<string, string>[];
  frequentSearches: string[];
}

export function DashboardSuggestions() {
  const [collapsed, setCollapsed] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [localTopics, setLocalTopics] = useState<string[] | null>(null);
  const [localEntities, setLocalEntities] = useState<string[] | null>(null);
  const [dismissedPanels, setDismissedPanels] = useState<Set<number>>(new Set());

  const { data: prefs, isLoading } = useQuery<DashboardPreferences>({
    queryKey: ["/api/dashboard-preferences"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<DashboardPreferences>) => {
      await apiRequest("POST", "/api/dashboard-preferences", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-preferences"] });
      setLocalTopics(null);
      setLocalEntities(null);
      setDismissedPanels(new Set());
    },
  });

  const pinnedTopics = localTopics ?? prefs?.pinnedTopics ?? [];
  const favoriteEntities = localEntities ?? prefs?.favoriteEntities ?? [];
  const recommendedPanels = (prefs?.recommendedPanels ?? []).filter(
    (_, i) => !dismissedPanels.has(i)
  );

  const hasPreferences =
    pinnedTopics.length > 0 ||
    favoriteEntities.length > 0 ||
    recommendedPanels.length > 0;

  const hasLocalChanges = localTopics !== null || localEntities !== null || dismissedPanels.size > 0;

  const addTopic = () => {
    const val = topicInput.trim();
    if (!val || pinnedTopics.includes(val)) return;
    setLocalTopics([...pinnedTopics, val]);
    setTopicInput("");
  };

  const removeTopic = (topic: string) => {
    setLocalTopics(pinnedTopics.filter((t) => t !== topic));
  };

  const addEntity = () => {
    const val = entityInput.trim();
    if (!val || favoriteEntities.includes(val)) return;
    setLocalEntities([...favoriteEntities, val]);
    setEntityInput("");
  };

  const removeEntity = (entity: string) => {
    setLocalEntities(favoriteEntities.filter((e) => e !== entity));
  };

  const dismissPanel = (index: number) => {
    setDismissedPanels((prev) => { const next = new Set(Array.from(prev)); next.add(index); return next; });
  };

  const handleSave = () => {
    saveMutation.mutate({
      pinnedTopics,
      favoriteEntities,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-dashboard-suggestions">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Dashboard Suggestions
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="button-toggle-suggestions"
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-4 pt-0 space-y-4">
          {!hasPreferences && !hasLocalChanges && (
            <p className="text-sm text-muted-foreground" data-testid="text-personalize-prompt">
              Personalize your dashboard - pin topics and entities you follow frequently
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Pin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Pinned Topics</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pinnedTopics.map((topic) => (
                <Badge
                  key={topic}
                  variant="secondary"
                  className="gap-1"
                  data-testid={`badge-topic-${topic}`}
                >
                  {topic}
                  <button
                    onClick={() => removeTopic(topic)}
                    className="ml-0.5 opacity-70"
                    data-testid={`button-remove-topic-${topic}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTopic()}
                placeholder="Add topic..."
                className="flex-1"
                data-testid="input-pin-topic"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={addTopic}
                disabled={!topicInput.trim()}
                data-testid="button-add-topic"
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Favorite Entities</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {favoriteEntities.map((entity) => (
                <Badge
                  key={entity}
                  variant="outline"
                  className="gap-1"
                  data-testid={`badge-entity-${entity}`}
                >
                  {entity}
                  <button
                    onClick={() => removeEntity(entity)}
                    className="ml-0.5 opacity-70"
                    data-testid={`button-remove-entity-${entity}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEntity()}
                placeholder="Add entity..."
                className="flex-1"
                data-testid="input-add-entity"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={addEntity}
                disabled={!entityInput.trim()}
                data-testid="button-add-entity"
              >
                <Plus />
              </Button>
            </div>
          </div>

          {recommendedPanels.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Recommended Panels</span>
              <ul className="space-y-1">
                {recommendedPanels.map((panel, idx) => {
                  const originalIdx = (prefs?.recommendedPanels ?? []).indexOf(panel);
                  return (
                    <li
                      key={originalIdx}
                      className="flex items-center justify-between gap-2 text-sm text-foreground"
                      data-testid={`panel-recommendation-${originalIdx}`}
                    >
                      <span>{panel.name || panel.title || `Panel ${originalIdx + 1}`}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => dismissPanel(originalIdx)}
                        data-testid={`button-dismiss-panel-${originalIdx}`}
                      >
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {hasLocalChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-preferences"
            >
              {saveMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
