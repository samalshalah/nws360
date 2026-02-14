import {
  LayoutDashboard, Newspaper, BarChart3, ChevronDown,
  FileBarChart, TrendingUp, Search, MessageSquare, Shield,
  FileText, Network, Plus, List, Hash, Bookmark, Users,
  Activity, GitCompare, Zap, Tag, Brain, Eye, CreditCard,
  HelpCircle, Lightbulb, Plug, Monitor, UsersRound, ExternalLink,
  Home, Bell, Settings, Rss, ClipboardList, Lock, Building2
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

export function buildClientNavTree(t: any): NavGroup[] {
  return [
    {
      key: "home",
      label: "",
      icon: Home,
      items: [
        { key: "dashboard", label: t("nav.dashboard", "Home"), href: "/dashboard", icon: Home },
        { key: "feed", label: t("nav.newsFeed", "Feed"), href: "/feed", icon: Newspaper },
        { key: "saved", label: t("nav.saved", "Saved"), href: "/saved", icon: Bookmark },
      ],
      collapsible: false,
    },
    {
      key: "reports",
      label: t("nav.reports", "Reports"),
      icon: BarChart3,
      capability: "analytics",
      items: [
        { key: "overview", label: t("analyticsPages.nav.overview", "Overview"), href: "/analytics", icon: BarChart3 },
        { key: "trendingTopics", label: t("analyticsPages.nav.trendingTopics", "Trending Topics"), href: "/analytics/trending-topics", icon: TrendingUp },
        { key: "sentimentReports", label: t("analyticsPages.nav.sentimentReports", "Tone Analysis"), href: "/analytics/sentiment-reports", icon: MessageSquare },
        { key: "contentVolume", label: t("analyticsPages.nav.contentVolume", "Coverage Volume"), href: "/analytics/content-volume", icon: FileBarChart },
        { key: "narrativeComparison", label: t("analyticsPages.nav.narrativeComparison", "Narrative Shifts"), href: "/analytics/narrative-comparison", icon: GitCompare },
        { key: "dailyBrief", label: t("analyticsPages.nav.dailyBrief", "Daily Brief"), href: "/analytics/daily-brief", icon: Zap },
        { key: "customReports", label: t("analyticsPages.nav.customReports", "Custom Reports"), href: "/analytics/custom-reports", icon: FileText },
      ],
      collapsible: true,
    },
    {
      key: "intelligence",
      label: t("nav.intelligence", "Intelligence"),
      icon: Brain,
      capability: "intelligence",
      items: [
        { key: "intelligence", label: t("nav.intelligence", "Intelligence Hub"), href: "/intelligence", icon: Brain },
        { key: "forecasting", label: t("nav.forecasting", "Predictions"), href: "/forecasting", icon: TrendingUp, capability: "predictiveIntelligence" },
        { key: "executiveHome", label: t("nav.executiveHome", "Executive View"), href: "/executive", icon: Eye, capability: "executive" },
      ],
      collapsible: true,
    },
    {
      key: "sources",
      label: t("nav.sources", "Sources"),
      icon: Rss,
      capability: "sources",
      items: [
        { key: "manageSources", label: t("nav.manageSources", "My Sources"), href: "/sources/manage", icon: List },
        { key: "addSource", label: t("nav.addSource", "Add Source"), href: "/sources/add", icon: Plus },
        { key: "keywords", label: t("nav.keywords", "Keywords"), href: "/sources/keywords", icon: Hash },
      ],
      collapsible: true,
    },
    {
      key: "more",
      label: t("nav.more", "More"),
      icon: Settings,
      items: [
        { key: "collaboration", label: t("nav.collaboration", "Collaboration"), href: "/collaboration", icon: UsersRound, capability: "collaboration" },
        { key: "knowledge", label: t("nav.knowledge", "Knowledge"), href: "/knowledge", icon: Brain, capability: "knowledgeMemory" },
        { key: "integrations", label: t("nav.integrations", "Integrations"), href: "/integrations", icon: Plug, capability: "integrations" },
        { key: "users", label: t("nav.userManagement", "Team"), href: "/users", icon: Users, capability: "users" },
        { key: "usageBilling", label: t("nav.usageBilling", "Billing"), href: "/usage-billing", icon: CreditCard, capability: "billing" },
        { key: "keywordAnalysis", label: t("analyticsPages.nav.keywordAnalysis", "Keyword Analysis"), href: "/analytics/keyword-analysis", icon: Search, capability: "analytics" },
        { key: "sourceBehavior", label: t("analyticsPages.nav.sourceBehavior", "Source Behavior"), href: "/analytics/source-behavior", icon: Shield, capability: "analytics" },
        { key: "networkMapping", label: t("analyticsPages.nav.networkMapping", "Network Mapping"), href: "/analytics/network-mapping", icon: Network, capability: "analytics" },
        { key: "keywordDetail", label: t("analyticsPages.nav.keywordDetail", "Keyword Detail"), href: "/analytics/keyword-detail", icon: Tag, capability: "analytics" },
        { key: "helpCenter", label: t("nav.helpCenter", "Help"), href: "/help", icon: HelpCircle },
      ],
      collapsible: true,
    },
  ];
}

export function buildAdminNavTree(t: any): NavGroup[] {
  return [
    {
      key: "overview",
      label: t("nav.overview", "Overview"),
      icon: LayoutDashboard,
      items: [
        { key: "adminDashboard", label: t("nav.adminDashboard", "Dashboard"), href: "/admin/dashboard", icon: LayoutDashboard, adminOnly: true },
        { key: "feed", label: t("nav.newsFeed", "News Feed"), href: "/feed", icon: Newspaper },
        { key: "dashboard", label: t("nav.dashboard", "Client View"), href: "/dashboard", icon: Home },
      ],
      collapsible: false,
    },
    {
      key: "tenants",
      label: t("nav.tenants", "Tenants"),
      icon: Building2,
      items: [
        { key: "users", label: t("nav.userManagement", "Users"), href: "/users", icon: Users, capability: "users" },
        { key: "usageBilling", label: t("nav.usageBilling", "Billing"), href: "/usage-billing", icon: CreditCard, capability: "billing" },
      ],
      collapsible: true,
    },
    {
      key: "operations",
      label: t("nav.operations", "Operations"),
      icon: Activity,
      items: [
        { key: "opsDashboard", label: t("nav.opsDashboard", "Queue & Jobs"), href: "/admin/ops", icon: Activity, adminOnly: true },
        { key: "sourceHealth", label: t("nav.sourceHealth", "Source Health"), href: "/sources/health", icon: Monitor, adminOnly: true },
        { key: "manageSources", label: t("nav.manageSources", "Manage Sources"), href: "/sources/manage", icon: List, capability: "sources" },
        { key: "addSource", label: t("nav.addSource", "Add Source"), href: "/sources/add", icon: Plus, capability: "sources" },
        { key: "keywords", label: t("nav.keywords", "Keywords"), href: "/sources/keywords", icon: Hash, capability: "sources" },
      ],
      collapsible: true,
    },
    {
      key: "analytics",
      label: t("nav.analytics", "Analytics"),
      icon: BarChart3,
      capability: "analytics",
      items: [
        { key: "overview", label: t("analyticsPages.nav.overview", "Overview"), href: "/analytics", icon: BarChart3 },
        { key: "trendingTopics", label: t("analyticsPages.nav.trendingTopics", "Trending Topics"), href: "/analytics/trending-topics", icon: TrendingUp },
        { key: "sentimentReports", label: t("analyticsPages.nav.sentimentReports", "Tone Reports"), href: "/analytics/sentiment-reports", icon: MessageSquare },
        { key: "contentVolume", label: t("analyticsPages.nav.contentVolume", "Content Volume"), href: "/analytics/content-volume", icon: FileBarChart },
        { key: "narrativeComparison", label: t("analyticsPages.nav.narrativeComparison", "Narrative Comparison"), href: "/analytics/narrative-comparison", icon: GitCompare },
        { key: "dailyBrief", label: t("analyticsPages.nav.dailyBrief", "Daily Brief"), href: "/analytics/daily-brief", icon: Zap },
        { key: "customReports", label: t("analyticsPages.nav.customReports", "Custom Reports"), href: "/analytics/custom-reports", icon: FileText },
        { key: "keywordAnalysis", label: t("analyticsPages.nav.keywordAnalysis", "Keyword Analysis"), href: "/analytics/keyword-analysis", icon: Search },
        { key: "sourceBehavior", label: t("analyticsPages.nav.sourceBehavior", "Source Behavior"), href: "/analytics/source-behavior", icon: Shield },
        { key: "networkMapping", label: t("analyticsPages.nav.networkMapping", "Network Mapping"), href: "/analytics/network-mapping", icon: Network },
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
        { key: "intelligence", label: t("nav.intelligence", "Intelligence Hub"), href: "/intelligence", icon: Brain },
        { key: "forecasting", label: t("nav.forecasting", "Predictions"), href: "/forecasting", icon: TrendingUp, capability: "predictiveIntelligence" },
        { key: "executiveHome", label: t("nav.executiveHome", "Executive Home"), href: "/executive", icon: Eye, capability: "executive" },
        { key: "collaboration", label: t("nav.collaboration", "Collaboration"), href: "/collaboration", icon: UsersRound, capability: "collaboration" },
        { key: "knowledge", label: t("nav.knowledge", "Knowledge"), href: "/knowledge", icon: Brain, capability: "knowledgeMemory" },
      ],
      collapsible: true,
    },
    {
      key: "security",
      label: t("nav.security", "Security"),
      icon: Lock,
      items: [
        { key: "productIntelligence", label: t("nav.productIntelligence", "Product Analytics"), href: "/admin/product-analytics", icon: Lightbulb, adminOnly: true },
        { key: "integrationMonitor", label: t("nav.integrationMonitor", "Integration Monitor"), href: "/admin/integrations", icon: Plug, adminOnly: true },
        { key: "integrations", label: t("nav.integrations", "Integrations"), href: "/integrations", icon: Plug, capability: "integrations" },
        { key: "saved", label: t("nav.saved", "Saved"), href: "/saved", icon: Bookmark },
        { key: "helpCenter", label: t("nav.helpCenter", "Help"), href: "/help", icon: HelpCircle },
      ],
      collapsible: true,
    },
  ];
}

export function buildNavTree(t: any): NavGroup[] {
  return buildClientNavTree(t);
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
