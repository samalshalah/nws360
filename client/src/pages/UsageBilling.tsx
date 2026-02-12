import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Users,
  Tag,
  Rss,
  BarChart3,
  Brain,
  Key,
  Check,
  X,
  AlertTriangle,
  Crown,
  Shield,
  Sparkles,
} from "lucide-react";

interface UsageData {
  plan: string;
  status: string;
  seats: { used: number; max: number };
  keywords: { used: number; max: number };
  sources: { used: number; max: number };
  analyticsLevel: string;
  aiBriefLevel: string;
  apiAccess: boolean;
}

const PLAN_DETAILS = {
  basic: {
    label: "Basic",
    icon: Shield,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    badgeVariant: "secondary" as const,
    users: 3,
    keywords: 10,
    sources: 5,
    analytics: "Standard",
    aiBrief: "Summary",
    apiAccess: false,
  },
  pro: {
    label: "Pro",
    icon: Crown,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    badgeVariant: "default" as const,
    users: 10,
    keywords: 50,
    sources: 20,
    analytics: "Advanced",
    aiBrief: "Full",
    apiAccess: true,
  },
  enterprise: {
    label: "Enterprise",
    icon: Sparkles,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    badgeVariant: "default" as const,
    users: "Unlimited",
    keywords: "Unlimited",
    sources: "Unlimited",
    analytics: "Full",
    aiBrief: "Custom",
    apiAccess: true,
  },
};

function getUsageColor(used: number, max: number): string {
  if (max === -1 || max === 999) return "bg-green-500";
  const pct = (used / max) * 100;
  if (pct > 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function getUsagePercent(used: number, max: number): number {
  if (max === -1 || max === 999) return used > 0 ? Math.min((used / 100) * 100, 30) : 5;
  return Math.min((used / max) * 100, 100);
}

function formatMax(max: number): string {
  if (max === -1 || max === 999) return "unlimited";
  return max.toString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
    case "trial":
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
    case "suspended":
      return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
    default:
      return <Badge data-testid="badge-status">{status}</Badge>;
  }
}

function UsageMeter({
  label,
  used,
  max,
  icon: Icon,
  testId,
}: {
  label: string;
  used: number;
  max: number;
  icon: typeof Users;
  testId: string;
}) {
  const isUnlimited = max === -1 || max === 999;
  const percent = getUsagePercent(used, max);
  const colorClass = getUsageColor(used, max);
  const displayMax = formatMax(max);

  return (
    <Card data-testid={testId}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className="text-sm text-muted-foreground" data-testid={`${testId}-count`}>
            {used} / {isUnlimited ? "unlimited" : displayMax} used
          </span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all ${colorClass}`}
            style={{ width: `${percent}%` }}
            data-testid={`${testId}-bar`}
          />
        </div>
        {!isUnlimited && (
          <p className="text-xs text-muted-foreground">
            {Math.round(percent)}% of your plan limit
          </p>
        )}
        {isUnlimited && (
          <p className="text-xs text-muted-foreground">Unlimited on your plan</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function UsageBilling() {
  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ["/api/subscription/usage"],
  });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-usage-title">Usage & Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor your consumption and manage your plan</p>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No subscription data available.
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = data.plan as keyof typeof PLAN_DETAILS;
  const planInfo = PLAN_DETAILS[currentPlan] || PLAN_DETAILS.basic;
  const PlanIcon = planInfo.icon;

  const planFeatures = [
    { feature: "Users", key: "users", icon: Users },
    { feature: "Keywords", key: "keywords", icon: Tag },
    { feature: "Sources", key: "sources", icon: Rss },
    { feature: "Analytics", key: "analytics", icon: BarChart3 },
    { feature: "AI Briefing", key: "aiBrief", icon: Brain },
    { feature: "API Access", key: "apiAccess", icon: Key },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-usage-title">Usage & Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor your consumption and manage your plan</p>
      </div>

      <Card data-testid="card-current-plan">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`p-2 rounded-md ${planInfo.color}`}>
              <PlanIcon className="w-5 h-5" />
            </div>
            <CardTitle className="text-xl" data-testid="text-plan-name">{planInfo.label} Plan</CardTitle>
            <Badge variant={planInfo.badgeVariant} data-testid="badge-plan">{planInfo.label}</Badge>
          </div>
          {getStatusBadge(data.status)}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analytics:</span>
              <span className="text-sm font-medium capitalize" data-testid="text-analytics-level">{data.analyticsLevel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">AI Brief:</span>
              <span className="text-sm font-medium capitalize" data-testid="text-ai-brief-level">{data.aiBriefLevel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">API Access:</span>
              {data.apiAccess ? (
                <Check className="w-4 h-4 text-green-500" data-testid="icon-api-enabled" />
              ) : (
                <X className="w-4 h-4 text-red-500" data-testid="icon-api-disabled" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UsageMeter
          label="Seats"
          used={data.seats.used}
          max={data.seats.max}
          icon={Users}
          testId="meter-seats"
        />
        <UsageMeter
          label="Keywords"
          used={data.keywords.used}
          max={data.keywords.max}
          icon={Tag}
          testId="meter-keywords"
        />
        <UsageMeter
          label="Sources"
          used={data.sources.used}
          max={data.sources.max}
          icon={Rss}
          testId="meter-sources"
        />
      </div>

      <Card data-testid="card-plan-comparison">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Plan Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                {(["basic", "pro", "enterprise"] as const).map((plan) => (
                  <TableHead
                    key={plan}
                    className={plan === currentPlan ? "bg-primary/5" : ""}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold">{PLAN_DETAILS[plan].label}</span>
                      {plan === currentPlan && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-current-${plan}`}>
                          Current Plan
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {planFeatures.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <row.icon className="w-4 h-4 text-muted-foreground" />
                      <span>{row.feature}</span>
                    </div>
                  </TableCell>
                  {(["basic", "pro", "enterprise"] as const).map((plan) => {
                    const planData = PLAN_DETAILS[plan];
                    const val = planData[row.key as "users" | "keywords" | "sources" | "analytics" | "aiBrief" | "apiAccess"];
                    return (
                      <TableCell
                        key={plan}
                        className={`text-center ${plan === currentPlan ? "bg-primary/5" : ""}`}
                        data-testid={`cell-${row.key}-${plan}`}
                      >
                        {typeof val === "boolean" ? (
                          val ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-red-500 mx-auto" />
                          )
                        ) : (
                          <span className="text-sm">{String(val)}</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow>
                <TableCell />
                {(["basic", "pro", "enterprise"] as const).map((plan) => (
                  <TableCell key={plan} className={`text-center ${plan === currentPlan ? "bg-primary/5" : ""}`}>
                    {plan !== currentPlan && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-${plan === "enterprise" ? "contact-sales" : "upgrade"}-${plan}`}
                        onClick={() => window.open("mailto:support@nws360.com?subject=Plan Change Request", "_blank")}
                      >
                        {plan === "enterprise" ? "Contact Sales" : "Upgrade"}
                      </Button>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card data-testid="card-billing-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Billing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.status === "trial" && (
            <div className="flex items-start gap-3 p-4 rounded-md bg-amber-500/10">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-600 dark:text-amber-400" data-testid="text-trial-message">
                  You are currently on a trial
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upgrade to a paid plan to continue using all features after your trial ends.
                </p>
              </div>
            </div>
          )}
          {data.status === "active" && (
            <div className="flex items-start gap-3 p-4 rounded-md bg-green-500/10">
              <Check className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-600 dark:text-green-400" data-testid="text-active-message">
                  Your subscription is active
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your plan is fully active with all features enabled.
                </p>
              </div>
            </div>
          )}
          {data.status === "suspended" && (
            <div className="flex items-start gap-3 p-4 rounded-md bg-red-500/10">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-600 dark:text-red-400" data-testid="text-suspended-message">
                  Your subscription is suspended
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please contact support to restore your account access.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
