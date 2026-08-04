import {
  LayoutDashboard, Newspaper, BarChart3,
  FileBarChart, TrendingUp, Search, MessageSquare, Shield,
  FileText, List, Hash, Bookmark, Users,
  Activity, GitCompare, Zap, Brain, CreditCard,
  HelpCircle, Lightbulb, Plug, Monitor, UsersRound, UserCog,
  Home, Bell, Settings, ClipboardList, CheckSquare, BookOpen, SlidersHorizontal, Building2, Landmark
} from "lucide-react";
import { CAPS } from "@shared/schema";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: any;
  caps?: string[];
  adminOnly?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: any;
  caps?: string[];
  adminOnly?: boolean;
  items: NavItem[];
  collapsible: boolean;
}

export interface RouteCapConfig {
  path: string;
  caps?: string[];
  adminOnly?: boolean;
}

export function buildTenantNavTree(t: any): NavGroup[] {
  return [
    {
      key: "home",
      label: "",
      icon: Home,
      items: [
        { key: "dashboard", label: t("nav.dashboard", "Home"), href: "/dashboard", icon: Home, caps: [CAPS.FEED_VIEW] },
        { key: "feed", label: t("nav.latestNews", "News Feed"), href: "/feed", icon: Newspaper, caps: [CAPS.FEED_VIEW] },
        { key: "officialSources", label: t("nav.officialSources", "Official Sources"), href: "/official-sources", icon: Landmark, caps: [CAPS.SOURCES_VIEW] },
      ],
      collapsible: false,
    },
    {
      key: "monitoring",
      label: t("nav.monitoring", "Monitoring"),
      icon: Bell,
      items: [
        { key: "manageSources", label: t("nav.manageSources", "Manage Sources"), href: "/sources/manage", icon: List, caps: [CAPS.SOURCES_VIEW] },
        { key: "keywords", label: t("nav.keywords", "Watchlists"), href: "/sources/keywords", icon: Hash, caps: [CAPS.KEYWORDS_VIEW] },
        { key: "alerts", label: t("nav.alerts", "Alerts"), href: "/alerts", icon: Bell, caps: [CAPS.ALERTS_VIEW] },
      ],
      collapsible: true,
    },
    {
      key: "analytics",
      label: t("nav.analysis", "Analysis"),
      icon: BarChart3,
      caps: [CAPS.ANALYTICS_VIEW],
      items: [
        { key: "overview", label: t("analyticsPages.nav.overview", "Analysis Overview"), href: "/analytics", icon: BarChart3, caps: [CAPS.ANALYTICS_OVERVIEW] },
        { key: "trendingTopics", label: t("analyticsPages.nav.trendingTopics", "Trending Topics"), href: "/analytics/trending-topics", icon: TrendingUp, caps: [CAPS.ANALYTICS_TRENDING_TOPICS] },
        { key: "keywordAnalysis", label: t("analyticsPages.nav.keywordAnalysis", "Keyword & Phrase Analysis"), href: "/analytics/keyword-analysis", icon: Search, caps: [CAPS.ANALYTICS_KEYWORD_ANALYSIS] },
        { key: "contentVolume", label: t("analyticsPages.nav.contentVolume", "Coverage Volume"), href: "/analytics/content-volume", icon: FileBarChart, caps: [CAPS.ANALYTICS_CONTENT_VOLUME] },
        { key: "sourceBehavior", label: t("analyticsPages.nav.sourceBehavior", "Source Behavior"), href: "/analytics/source-behavior", icon: Shield, caps: [CAPS.ANALYTICS_SOURCE_BEHAVIOR] },
      ],
      collapsible: true,
    },
    {
      key: "reports",
      label: t("nav.reports", "Reports"),
      icon: ClipboardList,
      items: [
        { key: "reportBasket", label: t("nav.reportBasket", "Report Basket"), href: "/reports/basket", icon: ClipboardList, caps: [CAPS.ARTICLE_VIEW] },
        { key: "briefings", label: t("nav.briefings", "Briefings"), href: "/briefings", icon: BookOpen, caps: [CAPS.COLLAB_VIEW] },
        { key: "customReports", label: t("analyticsPages.nav.customReports", "Custom Reports"), href: "/analytics/custom-reports", icon: FileText, caps: [CAPS.ANALYTICS_CUSTOM_REPORTS] },
        { key: "saved", label: t("nav.saved", "Saved Articles"), href: "/saved", icon: Bookmark, caps: [CAPS.ARTICLE_SAVE] },
      ],
      collapsible: true,
    },
    {
      key: "aiAddons",
      label: t("nav.aiAddons", "AI Add-ons"),
      icon: Brain,
      caps: [CAPS.INTELLIGENCE_VIEW],
      items: [
        { key: "sentimentReports", label: t("analyticsPages.nav.sentimentReports", "Tone Analysis"), href: "/analytics/sentiment-reports", icon: MessageSquare, caps: [CAPS.ANALYTICS_TONE_REPORTS] },
        { key: "narrativeComparison", label: t("analyticsPages.nav.narrativeComparison", "Narrative Shifts"), href: "/analytics/narrative-comparison", icon: GitCompare, caps: [CAPS.ANALYTICS_NARRATIVE_COMPARISON] },
        { key: "dailyBrief", label: t("analyticsPages.nav.dailyBrief", "AI Daily Brief"), href: "/analytics/daily-brief", icon: Zap, caps: [CAPS.INTELLIGENCE_DAILY_BRIEF] },
        { key: "intelligence", label: t("nav.intelligence", "Intelligence Hub"), href: "/intelligence", icon: Brain, caps: [CAPS.INTELLIGENCE_VIEW] },
        { key: "forecasting", label: t("nav.forecasting", "Predictions"), href: "/forecasting", icon: TrendingUp, caps: [CAPS.INTELLIGENCE_PREDICTIONS] },
      ],
      collapsible: true,
    },
    {
      key: "workspace",
      label: t("nav.clientSystem", "Client System"),
      icon: Settings,
      items: [
        { key: "users", label: t("nav.userManagement", "Team"), href: "/users", icon: Users, caps: [CAPS.USERS_VIEW] },
        { key: "workQueue", label: t("nav.workQueue", "Tasks"), href: "/work-queue", icon: CheckSquare, caps: [CAPS.COLLAB_TASKS] },
        { key: "collaboration", label: t("nav.collaboration", "Collaboration"), href: "/collaboration", icon: UsersRound, caps: [CAPS.COLLAB_VIEW] },
        { key: "knowledge", label: t("nav.knowledge", "Knowledge"), href: "/knowledge", icon: Brain, caps: [CAPS.KNOWLEDGE_VIEW] },
        { key: "integrations", label: t("nav.integrations", "Integrations"), href: "/integrations", icon: Plug, caps: [CAPS.INTEGRATIONS_VIEW] },
        { key: "usageBilling", label: t("nav.usageBilling", "Billing"), href: "/usage-billing", icon: CreditCard, caps: [CAPS.BILLING_VIEW] },
        { key: "clientSettings", label: t("nav.clientSettings", "Client Settings"), href: "/settings", icon: Settings, caps: [CAPS.SETTINGS_VIEW] },
        { key: "helpCenter", label: t("nav.helpCenter", "Help"), href: "/help", icon: HelpCircle },
      ],
      collapsible: true,
    },
    {
      key: "workspaceSettings",
      label: t("nav.workspaceSettings", "Workspace Settings"),
      icon: SlidersHorizontal,
      items: [
        { key: "workspaceRelevance", label: t("nav.workspaceSettings", "Workspace Settings"), href: "/workspace/relevance", icon: SlidersHorizontal, caps: [CAPS.SETTINGS_VIEW] },
      ],
      collapsible: false,
    },
  ];
}

export function buildPlatformAdminNavTree(t: any): NavGroup[] {
  return [
    {
      key: "platform",
      label: "",
      icon: LayoutDashboard,
      adminOnly: true,
      items: [
        { key: "adminDashboard", label: t("nav.adminDashboard", "Overview"), href: "/admin", icon: LayoutDashboard, caps: [CAPS.ADMIN_SYSTEM_DASHBOARD] },
        { key: "clients", label: t("nav.clients", "Clients"), href: "/admin/clients", icon: Building2, caps: [CAPS.ADMIN_SYSTEM_DASHBOARD] },
        { key: "adminUsers", label: t("nav.usersAccess", "Users & Access"), href: "/admin/users", icon: UserCog, caps: [CAPS.ADMIN_SYSTEM_DASHBOARD] },
        { key: "clientEnrollment", label: t("nav.clientEnrollment", "Enroll Client"), href: "/admin/clients/new", icon: Users, caps: [CAPS.ADMIN_SYSTEM_DASHBOARD] },
        { key: "publisherCatalog", label: t("nav.publisherCatalog", "Publisher Catalog"), href: "/admin/publishers", icon: Building2, caps: [CAPS.ADMIN_SYSTEM_DASHBOARD] },
        { key: "sourceHealth", label: t("nav.sourceHealth", "Source Health"), href: "/sources/health", icon: Monitor, caps: [CAPS.SOURCE_HEALTH_VIEW] },
        { key: "opsDashboard", label: t("nav.opsDashboard", "Queue & Jobs"), href: "/admin/ops", icon: Activity, caps: [CAPS.ADMIN_OPERATIONS] },
        { key: "integrationMonitor", label: t("nav.integrationMonitor", "Integration Monitor"), href: "/admin/integrations", icon: Plug, caps: [CAPS.INTEGRATION_MONITOR_VIEW] },
        { key: "productIntelligence", label: t("nav.productIntelligence", "Product Analytics"), href: "/admin/product-analytics", icon: Lightbulb, caps: [CAPS.ADMIN_PRODUCT_ANALYTICS] },
      ],
      collapsible: false,
    },
  ];
}

export function buildUniversalNavTree(t: any): NavGroup[] {
  return buildTenantNavTree(t);
}

export function filterNavByCaps(
  groups: NavGroup[],
  hasCap: (cap: string) => boolean,
  isAdmin: boolean,
): NavGroup[] {
  return groups
    .filter((group) => {
      if (group.adminOnly && !isAdmin) return false;
      if (group.caps && group.caps.length > 0 && !group.caps.some(c => hasCap(c))) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.caps && item.caps.length > 0 && !item.caps.some(c => hasCap(c))) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export const ROUTE_CAPS: RouteCapConfig[] = [
  { path: "/dashboard", caps: [CAPS.FEED_VIEW] },
  { path: "/feed", caps: [CAPS.FEED_VIEW] },
  { path: "/official-sources", caps: [CAPS.SOURCES_VIEW] },
  { path: "/reports/basket", caps: [CAPS.ARTICLE_VIEW] },
  { path: "/briefings", caps: [CAPS.COLLAB_VIEW] },
  { path: "/alerts", caps: [CAPS.ALERTS_VIEW] },
  { path: "/saved", caps: [CAPS.ARTICLE_SAVE] },
  { path: "/analytics", caps: [CAPS.ANALYTICS_VIEW] },
  { path: "/analytics/content-volume", caps: [CAPS.ANALYTICS_CONTENT_VOLUME] },
  { path: "/analytics/trending-topics", caps: [CAPS.ANALYTICS_TRENDING_TOPICS] },
  { path: "/analytics/keyword-analysis", caps: [CAPS.ANALYTICS_KEYWORD_ANALYSIS] },
  { path: "/analytics/sentiment-reports", caps: [CAPS.ANALYTICS_TONE_REPORTS] },
  { path: "/analytics/source-behavior", caps: [CAPS.ANALYTICS_SOURCE_BEHAVIOR] },
  { path: "/analytics/custom-reports", caps: [CAPS.ANALYTICS_CUSTOM_REPORTS] },
  { path: "/analytics/network-mapping", caps: [CAPS.ANALYTICS_NETWORK_MAPPING] },
  { path: "/analytics/narrative-comparison", caps: [CAPS.ANALYTICS_NARRATIVE_COMPARISON] },
  { path: "/analytics/daily-brief", caps: [CAPS.INTELLIGENCE_DAILY_BRIEF] },
  { path: "/analytics/keyword-detail", caps: [CAPS.ANALYTICS_KEYWORD_ANALYSIS] },
  { path: "/intelligence", caps: [CAPS.INTELLIGENCE_VIEW] },
  { path: "/forecasting", caps: [CAPS.INTELLIGENCE_PREDICTIONS] },
  { path: "/executive", caps: [CAPS.EXECUTIVE_HOME] },
  { path: "/sources/add", caps: [CAPS.SOURCES_ADD] },
  { path: "/sources/manage", caps: [CAPS.SOURCES_VIEW] },
  { path: "/sources/keywords", caps: [CAPS.KEYWORDS_VIEW] },
  { path: "/sources/health", caps: [CAPS.SOURCE_HEALTH_VIEW] },
  { path: "/users", caps: [CAPS.USERS_VIEW] },
  { path: "/usage-billing", caps: [CAPS.BILLING_VIEW] },
  { path: "/integrations", caps: [CAPS.INTEGRATIONS_VIEW] },
  { path: "/collaboration", caps: [CAPS.COLLAB_VIEW] },
  { path: "/work-queue", caps: [CAPS.COLLAB_TASKS] },
  { path: "/workspace/relevance", caps: [CAPS.SETTINGS_VIEW] },
  { path: "/knowledge", caps: [CAPS.KNOWLEDGE_VIEW] },
  { path: "/settings", caps: [CAPS.SETTINGS_VIEW] },
  { path: "/admin/users", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true },
  { path: "/admin/clients", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true },
  { path: "/admin/publishers", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true },
  { path: "/admin", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true },
  { path: "/admin/dashboard", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true },
  { path: "/admin/ops", caps: [CAPS.ADMIN_OPERATIONS], adminOnly: true },
  { path: "/admin/product-analytics", caps: [CAPS.ADMIN_PRODUCT_ANALYTICS], adminOnly: true },
  { path: "/admin/integrations", caps: [CAPS.INTEGRATION_MONITOR_VIEW], adminOnly: true },
];

export function canAccessRoute(
  path: string,
  hasCap: (cap: string) => boolean,
  isAdmin: boolean,
): boolean {
  const config =
    ROUTE_CAPS.find((r) => path === r.path) ||
    ROUTE_CAPS
      .filter((r) => path.startsWith(r.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
  if (!config) return true;
  if (config.adminOnly && !isAdmin) return false;
  if (config.caps && config.caps.length > 0) {
    return config.caps.some(c => hasCap(c));
  }
  return true;
}

export const ADMIN_ONLY_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/clients",
  "/admin/publishers",
  "/admin/dashboard",
  "/admin/ops",
  "/admin/product-analytics",
  "/admin/integrations",
  "/sources/health",
];

export function buildClientNavTree(t: any): NavGroup[] {
  return buildTenantNavTree(t);
}

export function buildAdminNavTree(t: any): NavGroup[] {
  return buildPlatformAdminNavTree(t);
}

export function filterNavByCapabilities(
  groups: NavGroup[],
  canAccess: (cap: string) => boolean,
  isAdmin: boolean,
): NavGroup[] {
  return filterNavByCaps(groups, canAccess, isAdmin);
}

export function isAdminOnlyRoute(path: string): boolean {
  return ADMIN_ONLY_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}
