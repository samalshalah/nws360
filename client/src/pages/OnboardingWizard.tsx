import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Globe, Tag, Rss, Bell, ChevronLeft, ChevronRight,
  Check, X, Plus, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const INDUSTRIES = [
  "Media", "Government", "Finance", "Technology", "Healthcare",
  "Legal", "Security", "Education", "NGO", "Other",
];

const COUNTRIES = [
  "US", "UK", "Canada", "France", "Germany", "Spain", "Turkey", "UAE",
  "Saudi Arabia", "Egypt", "Lebanon", "Jordan", "Israel", "India",
  "China", "Japan", "Australia", "Brazil", "Mexico", "South Africa",
];

const SOURCES = [
  "BBC News", "CNN", "Al Jazeera", "Reuters", "Fox News",
  "The Guardian", "Associated Press", "New York Times",
  "Washington Post", "Bloomberg",
];

const KEYWORD_SUGGESTIONS: Record<string, string[]> = {
  Media: ["breaking news", "press conference", "editorial", "broadcast"],
  Government: ["policy", "legislation", "election", "regulation"],
  Finance: ["market", "stocks", "investment", "economy"],
  Technology: ["AI", "startup", "cybersecurity", "innovation"],
  Healthcare: ["pandemic", "clinical trial", "public health", "pharma"],
  Legal: ["lawsuit", "regulation", "compliance", "court ruling"],
  Security: ["threat", "intelligence", "defense", "surveillance"],
  Education: ["curriculum", "university", "research", "scholarship"],
  NGO: ["humanitarian", "charity", "advocacy", "development"],
  Other: ["trending", "analysis", "report", "update"],
};

const STEP_ICONS: LucideIcon[] = [Building2, Globe, Tag, Rss, Bell];
const STEP_TITLES = [
  "What industry are you in?",
  "Which countries do you want to track?",
  "Add your tracking keywords",
  "Select preferred news sources",
  "Set up your notifications",
];

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [notifications, setNotifications] = useState({
    emailBriefing: true,
    weeklyReport: false,
    alertNotifications: true,
  });

  const { data: onboardingState, isLoading } = useQuery({
    queryKey: ["/api/onboarding"],
  });

  useEffect(() => {
    if (onboardingState && (onboardingState as any)?.completed) {
      setLocation("/dashboard");
    }
  }, [onboardingState, setLocation]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/onboarding", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
  });

  const saveProgress = (nextStep: number, extra?: Record<string, unknown>) => {
    saveMutation.mutate({
      currentStep: nextStep,
      industry,
      countries,
      selectedKeywords: keywords,
      selectedSources: sources,
      notificationPreferences: notifications,
      ...extra,
    });
  };

  const handleNext = () => {
    if (step < 5) {
      const next = step + 1;
      setStep(next);
      saveProgress(next);
    } else {
      saveProgress(5, { completed: true });
      toast({ title: "Setup complete!", description: "Your workspace is ready." });
      setLocation("/dashboard");
    }
  };

  const handleBack = () => {
    if (step > 1) {
      const prev = step - 1;
      setStep(prev);
      saveProgress(prev);
    }
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const toggleCountry = (c: string) => {
    setCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const toggleSource = (s: string) => {
    setSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const StepIcon = STEP_ICONS[step - 1];
  const progressValue = (step / 5) * 100;
  const suggestions = KEYWORD_SUGGESTIONS[industry] || KEYWORD_SUGGESTIONS["Other"];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-onboarding-title">
              Welcome to NWS360
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Step {step} of 5
          </p>
        </div>

        <Progress value={progressValue} className="h-2" data-testid="progress-onboarding" />

        <div className="flex items-center justify-center gap-3 pb-2">
          {STEP_ICONS.map((Icon, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isDone = stepNum < step;
            return (
              <div
                key={i}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${stepNum}`}
              >
                {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <StepIcon className="w-5 h-5 text-primary" />
              {STEP_TITLES[step - 1]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setIndustry(ind)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-md border transition-colors hover-elevate ${
                      industry === ind
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                    data-testid={`industry-${ind.toLowerCase()}`}
                  >
                    <Building2 className={`w-6 h-6 ${industry === ind ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-medium ${industry === ind ? "text-foreground" : "text-muted-foreground"}`}>
                      {ind}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {COUNTRIES.map((country) => {
                  const selected = countries.includes(country);
                  return (
                    <button
                      key={country}
                      type="button"
                      onClick={() => toggleCountry(country)}
                      className={`flex items-center gap-2 p-3 rounded-md border transition-colors hover-elevate ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      data-testid={`country-${country.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                        selected ? "bg-primary border-primary" : "border-muted-foreground"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className={`text-sm ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                        {country}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="Type a keyword and press Enter"
                    data-testid="input-keyword"
                  />
                  <Button onClick={addKeyword} data-testid="button-add-keyword">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="gap-1">
                        {kw}
                        <button
                          type="button"
                          onClick={() => removeKeyword(kw)}
                          className="ml-1"
                          data-testid={`remove-keyword-${kw.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {suggestions && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Suggested for {industry || "your industry"}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions
                        .filter((s) => !keywords.includes(s))
                        .map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => setKeywords([...keywords, s])}
                            data-testid={`suggestion-${s.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {s}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOURCES.map((source) => {
                  const selected = sources.includes(source);
                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => toggleSource(source)}
                      className={`flex items-center gap-3 p-3 rounded-md border transition-colors hover-elevate ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      data-testid={`source-${source.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                        selected ? "bg-primary border-primary" : "border-muted-foreground"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <Rss className={`w-4 h-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                        {source}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 rounded-md border border-border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Email Daily Briefing</p>
                    <p className="text-xs text-muted-foreground">
                      Receive a summary of top stories every morning
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailBriefing}
                    onCheckedChange={(v) => setNotifications({ ...notifications, emailBriefing: v })}
                    data-testid="switch-email-briefing"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4 rounded-md border border-border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Weekly PDF Report</p>
                    <p className="text-xs text-muted-foreground">
                      Get a comprehensive weekly analysis delivered as PDF
                    </p>
                  </div>
                  <Switch
                    checked={notifications.weeklyReport}
                    onCheckedChange={(v) => setNotifications({ ...notifications, weeklyReport: v })}
                    data-testid="switch-weekly-report"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4 rounded-md border border-border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Alert Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Instant alerts when breaking news matches your keywords
                    </p>
                  </div>
                  <Switch
                    checked={notifications.alertNotifications}
                    onCheckedChange={(v) => setNotifications({ ...notifications, alertNotifications: v })}
                    data-testid="switch-alert-notifications"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={saveMutation.isPending}
            data-testid="button-next"
          >
            {step === 5 ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                Complete Setup
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
