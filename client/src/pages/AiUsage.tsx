import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Brain, Languages, FileText, Sparkles } from "lucide-react";

type AiUsageHistoryDayRow = { date: string; type: string; totalTokens: number; jobCount: number };
type AiUsageHistoryTotal = { type: string; totalTokens: number; jobCount: number };

interface AiUsageResponse {
  from: string;
  to: string;
  byDay: AiUsageHistoryDayRow[];
  totalsByType: AiUsageHistoryTotal[];
  totalTokens: number;
  totalJobs: number;
  aiTokenBudgets: { analysis: number; translation: number; summaries: number };
}

type Category = "analysis" | "translation" | "summaries";

const CATEGORY_LABELS: Record<Category, string> = {
  analysis: "Analysis",
  translation: "Translation",
  summaries: "Summaries",
};

const CATEGORY_ICONS: Record<Category, typeof Brain> = {
  analysis: Brain,
  translation: Languages,
  summaries: FileText,
};

const CATEGORY_COLORS: Record<Category, string> = {
  analysis: "#6366f1",
  translation: "#22c55e",
  summaries: "#f59e0b",
};

function typeToCategory(type: string): Category | null {
  if (type === "classification" || type === "prediction" || type === "qa") return "analysis";
  if (type === "summary" || type === "brief") return "summaries";
  if (type === "translation") return "translation";
  return null;
}

const RANGE_OPTIONS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AiUsage() {
  const [range, setRange] = useState<RangeKey>("30d");

  const { from, to } = useMemo(() => {
    const opt = RANGE_OPTIONS.find((r) => r.key === range) || RANGE_OPTIONS[1];
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - opt.days * 24 * 60 * 60 * 1000);
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }, [range]);

  const { data, isLoading } = useQuery<AiUsageResponse>({
    queryKey: [`/api/ai-usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`],
  });

  const categoryTotals = useMemo(() => {
    const totals: Record<Category, { tokens: number; jobs: number }> = {
      analysis: { tokens: 0, jobs: 0 },
      translation: { tokens: 0, jobs: 0 },
      summaries: { tokens: 0, jobs: 0 },
    };
    for (const row of data?.totalsByType || []) {
      const category = typeToCategory(row.type);
      if (!category) continue;
      totals[category].tokens += row.totalTokens;
      totals[category].jobs += row.jobCount;
    }
    return totals;
  }, [data]);

  const todayCategoryTokens = useMemo(() => {
    const totals: Record<Category, number> = { analysis: 0, translation: 0, summaries: 0 };
    const key = todayKey();
    for (const row of data?.byDay || []) {
      if (row.date !== key) continue;
      const category = typeToCategory(row.type);
      if (!category) continue;
      totals[category] += row.totalTokens;
    }
    return totals;
  }, [data]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, { date: string; analysis: number; translation: number; summaries: number }>();
    for (const row of data?.byDay || []) {
      const category = typeToCategory(row.type);
      if (!category) continue;
      const entry = byDate.get(row.date) || { date: row.date, analysis: 0, translation: 0, summaries: 0 };
      entry[category] += row.totalTokens;
      byDate.set(row.date, entry);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-ai-usage-title">AI Usage</h1>
        <p className="text-muted-foreground text-sm">Token consumption by feature, tracked against your daily budgets</p>
      </div>

      <div className="flex items-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant={range === opt.key ? "default" : "outline"}
            onClick={() => setRange(opt.key)}
            data-testid={`button-range-${opt.key}`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => {
              const Icon = CATEGORY_ICONS[category];
              const budget = data?.aiTokenBudgets?.[category] ?? 0;
              const usedToday = todayCategoryTokens[category];
              const percent = budget > 0 ? Math.min(100, Math.round((usedToday / budget) * 100)) : 0;
              return (
                <Card key={category} data-testid={`card-usage-${category}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      {CATEGORY_LABELS[category]}
                    </CardTitle>
                    <CardDescription>
                      {categoryTotals[category].tokens.toLocaleString()} tokens / {categoryTotals[category].jobs.toLocaleString()} jobs in range
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Today</span>
                      <span className="font-medium" data-testid={`text-today-${category}`}>
                        {usedToday.toLocaleString()} {budget > 0 ? `/ ${budget.toLocaleString()}` : ""}
                      </span>
                    </div>
                    {budget > 0 ? (
                      <Progress value={percent} data-testid={`progress-${category}`} />
                    ) : (
                      <Badge variant="outline" className="text-xs">No daily budget configured</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-usage-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Daily token usage by category
              </CardTitle>
              <CardDescription>{data?.totalTokens.toLocaleString() || 0} tokens across {data?.totalJobs.toLocaleString() || 0} jobs in the selected range</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No AI usage recorded in this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="analysis" name="Analysis" stackId="usage" fill={CATEGORY_COLORS.analysis} />
                    <Bar dataKey="translation" name="Translation" stackId="usage" fill={CATEGORY_COLORS.translation} />
                    <Bar dataKey="summaries" name="Summaries" stackId="usage" fill={CATEGORY_COLORS.summaries} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
