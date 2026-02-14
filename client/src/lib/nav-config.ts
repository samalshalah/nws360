import {
  LayoutDashboard, Newspaper, BarChart3, ChevronDown,
  FileBarChart, TrendingUp, Search, MessageSquare, Shield,
  FileText, Network, Plus, List, Hash, Bookmark, Users,
  Activity, GitCompare, Zap, Tag, Brain, Eye, CreditCard,
  HelpCircle, Lightbulb, Plug, Monitor, UsersRound, ExternalLink
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: any;
  capability?: string;
  adminOnly?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: any;
  capability?: string;
  adminOnly?: boolean;
  items: NavItem[];
  collapsible: boolean;
}

export const ADMIN_ONLY_ROUTES = [
  "/admin",
  "/admin/dashboard",
  "/admin/ops",
  "/admin/product-analytics",
  "/admin/integrations",
  "/sources/health",
];

export function buildNavTree(t: any): NavGroup[] {
  return [
    {
      key: "core",
      label: t("nav.core", "Core"),
      icon: LayoutDashboard,
      items: [
        { key: "dashboard", label: t("nav.dashboard", "Dashboard"), href: "/dashboard", icon: LayoutDashboard },
        { key: "feed", label: t("nav.newsFeed", "News Feed"), href: "/feed", icon: Newspaper },
        { key: "saved", label: t("nav.saved", "Saved"), href: "/saved", icon: Bookmark },
      ],
      collapsible: false,
    },
    {
      key: "analytics",
      label: t("nav.analytics", "Analytics"),
      icon: BarChart3,
      capability: "analytics",
      items: [
        { key: "overview", label: t("analyticsPages.nav.overview", "Overview"), href: "/analytics", icon: BarChart3 },
        { key: "contentVolume", label: t("analyticsPages.nav.contentVolume", "Content Volume"), href: "/analytics/content-volume", icon: FileBarChart },
        { key: "trendingTopics", label: t("analyticsPages.nav.trendingTopics", "Trending Topics"), href: "/analytics/trending-topics", icon: TrendingUp },
        { key: "keywordAnalysis", label: t("analyticsPages.nav.keywordAnalysis", "Keyword Analysis"), href: "/analytics/keyword-analysis", icon: Search },
        { key: "sentimentReports", label: t("analyticsPages.nav.sentimentReports", "Tone Reports"), href: "/analytics/sentiment-reports", icon: MessageSquare },
        { key: "sourceBehavior", label: t("analyticsPages.nav.sourceBehavior", "Source Behavior"), href: "/analytics/source-behavior", icon: Shield },
        { key: "customReports", label: t("analyticsPages.nav.customReports", "Custom Reports"), href: "/analytics/custom-reports", icon: FileText },
        { key: "networkMapping", label: t("analyticsPages.nav.networkMapping", "Network Mapping"), href: "/analytics/network-mapping", icon: Network },
        { key: "narrativeComparison", label: t("analyticsPages.nav.narrativeComparison", "Narrative Comparison"), href: "/analytics/narrative-comparison", icon: GitCompare },
        { key: "dailyBrief", label: t("analyticsPages.nav.dailyBrief", "Daily Brief"), href: "/analytics/daily-brief", icon: Zap },
        { key: "keywordDetail", label: t("analyticsPages.nav.keywordDetail", "Keyword Detail"), href: "/analytics/keyword-detail", icon: Tag },
      ],
      collapsible: true,
    },
    {
      key: "intelligence",
      label: t("nav.intelligence", "Intelligence"),
      icon: Brain,
      capability: "intelligence",
      items: [
        { key: "intelligence", label: t("nav.intelligence", "Intelligence"), href: "/intelligence", icon: Brain },
        { key: "forecasting", label: t("nav.forecasting", "Predictive Intelligence"), href: "/forecasting", icon: TrendingUp, capability: "predictiveIntelligence" },
      ],
      collapsible: false,
    },
    {
      key: "sources",
      label: t("nav.sources", "Sources"),
      icon: List,
      capability: "sources",
      items: [
        { key: "addSource", label: t("nav.addSource", "Add Source"), href: "/sources/add", icon: Plus },
        { key: "manageSources", label: t("nav.manageSources", "Manage Sources"), href: "/sources/manage", icon: List },
        { key: "keywords", label: t("nav.keywords", "Keywords"), href: "/sources/keywords", icon: Hash },
      ],
      collapsible: true,
    },
    {
      key: "collaboration",
      label: t("nav.collaboration", "Collaboration"),
      icon: UsersRound,
      capability: "collaboration",
      items: [
        { key: "collaboration", label: t("nav.collaboration", "Collaboration"), href: "/collaboration", icon: UsersRound },
        { key: "knowledge", label: t("nav.knowledge", "Knowledge Memory"), href: "/knowledge", icon: Brain, capability: "knowledgeMemory" },
      ],
      collapsible: false,
    },
    {
      key: "integrations",
      label: t("nav.integrations", "Integrations"),
      icon: Plug,
      capability: "integrations",
      items: [
        { key: "integrations", label: t("nav.integrations", "Integrations"), href: "/integrations", icon: Plug },
      ],
      collapsible: false,
    },
    {
      key: "clientManagement",
      label: t("nav.clientManagement", "Client Management"),
      icon: Users,
      capability: "users",
      items: [
        { key: "users", label: t("nav.userManagement", "Users"), href: "/users", icon: Users },
      ],
      collapsible: false,
    },
    {
      key: "billing",
      label: t("nav.billing", "Billing"),
      icon: CreditCard,
      capability: "billing",
      items: [
        { key: "usageBilling", label: t("nav.usageBilling", "Usage & Billing"), href: "/usage-billing", icon: CreditCard },
      ],
      collapsible: false,
    },
    {
      key: "systemMonitoring",
      label: t("nav.systemMonitoring", "System Monitoring"),
      icon: Monitor,
      capability: "systemAdmin",
      adminOnly: true,
      items: [
        { key: "adminDashboard", label: t("nav.adminDashboard", "Admin Dashboard"), href: "/admin/dashboard", icon: LayoutDashboard, adminOnly: true },
        { key: "opsDashboard", label: t("nav.opsDashboard", "Operations"), href: "/admin/ops", icon: Activity, adminOnly: true },
        { key: "sourceHealth", label: t("nav.sourceHealth", "Source Health"), href: "/sources/health", icon: Monitor, adminOnly: true },
        { key: "productIntelligence", label: t("nav.productIntelligence", "Product Intelligence"), href: "/admin/product-analytics", icon: Lightbulb, adminOnly: true },
        { key: "integrationMonitor", label: t("nav.integrationMonitor", "Integration Monitor"), href: "/admin/integrations", icon: Plug, adminOnly: true },
      ],
      collapsible: true,
    },
    {
      key: "executive",
      label: t("nav.executive", "Executive"),
      icon: Eye,
      capability: "executive",
      items: [
        { key: "executiveHome", label: t("nav.executiveHome", "Executive Home"), href: "/executive", icon: Eye },
      ],
      collapsible: false,
    },
    {
      key: "help",
      label: t("nav.help", "Help"),
      icon: HelpCircle,
      items: [
        { key: "helpCenter", label: t("nav.helpCenter", "Help"), href: "/help", icon: HelpCircle },
      ],
      collapsible: false,
    },
  ];
}

export function filterNavByCapabilities(
  groups: NavGroup[],
  canAccess: (cap: string) => boolean,
  isAdmin: boolean,
): NavGroup[] {
  return groups
    .filter((group) => {
      if (group.adminOnly && !isAdmin) return false;
      if (group.capability && !canAccess(group.capability)) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.capability && !canAccess(item.capability)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function isAdminOnlyRoute(path: string): boolean {
  return ADMIN_ONLY_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}
