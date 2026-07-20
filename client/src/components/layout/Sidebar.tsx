import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Newspaper, BarChart3, LogOut, ChevronDown,
  FileBarChart, TrendingUp, Search, MessageSquare, Shield,
  FileText, Network, List, Hash, Menu, Bookmark, Users,
  Activity, GitCompare, Zap, Tag, Brain, Eye, CreditCard,
  HelpCircle, Lightbulb, Plug, Monitor, UsersRound, ExternalLink
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MenuItem {
  key: string;
  label: string;
  href: string;
  icon: any;
  capability?: string;
}

interface MenuGroup {
  key: string;
  label: string;
  icon: any;
  capability?: string;
  items: MenuItem[];
  collapsible: boolean;
}

function buildMenuStructure(t: (key: string, fallback?: string) => string): MenuGroup[] {
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
      items: [
        { key: "adminDashboard", label: t("nav.adminDashboard", "Admin Dashboard"), href: "/admin/dashboard", icon: LayoutDashboard },
        { key: "opsDashboard", label: t("nav.opsDashboard", "Operations"), href: "/admin/ops", icon: Activity },
        { key: "sourceHealth", label: t("nav.sourceHealth", "Source Health"), href: "/sources/health", icon: Monitor },
        { key: "productIntelligence", label: t("nav.productIntelligence", "Product Intelligence"), href: "/admin/product-analytics", icon: Lightbulb },
        { key: "integrationMonitor", label: t("nav.integrationMonitor", "Integration Monitor"), href: "/admin/integrations", icon: Plug },
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

function filterMenuByCapabilities(
  groups: MenuGroup[],
  canAccess: (cap: string) => boolean,
): MenuGroup[] {
  return groups
    .filter((group) => {
      if (group.capability && !canAccess(group.capability)) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.capability && !canAccess(item.capability)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

function TenantSwitcher() {
  const { capabilities } = usePermissions();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/admin/clients"],
    enabled: !!capabilities?.permissions?.systemAdmin,
  });

  const selectTenantMutation = useMutation({
    mutationFn: async (tenantId: number | null) => {
      await apiRequest("POST", "/api/admin/select-tenant", { tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/capabilities"] });
    },
  });

  if (!capabilities?.permissions?.systemAdmin) return null;

  return (
    <div className="px-4 pb-3" data-testid="tenant-switcher">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 block">
        Viewing Tenant
      </label>
      <Select
        value={capabilities.tenantId?.toString() || "all"}
        onValueChange={(val) => {
          selectTenantMutation.mutate(val === "all" ? null : parseInt(val));
        }}
      >
        <SelectTrigger className="h-8 text-xs" data-testid="select-tenant">
          <SelectValue placeholder="All Tenants" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" data-testid="select-tenant-all">All Tenants</SelectItem>
          {clients?.map((c: any) => (
            <SelectItem key={c.id} value={c.id.toString()} data-testid={`select-tenant-${c.id}`}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ImpersonationIndicator() {
  const { capabilities } = usePermissions();
  if (!capabilities?.isImpersonating) return null;

  return (
    <div
      data-testid="sidebar-impersonation-indicator"
      className="mx-4 mb-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium"
    >
      <span className="block">Viewing as:</span>
      <span className="font-semibold">
        {capabilities.impersonatingUsername || "Unknown"}
        {capabilities.tenantName ? ` (${capabilities.tenantName})` : ""}
      </span>
    </div>
  );
}

function NavItem({
  item,
  isActive,
  isSub,
  onNavigate,
}: {
  item: MenuItem;
  isActive: boolean;
  isSub?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  if (isSub) {
    return (
      <Link href={item.href}>
        <div
          onClick={onNavigate}
          data-testid={`nav-${item.key}`}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer group",
            isActive
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
          {item.label}
        </div>
      </Link>
    );
  }

  return (
    <Link href={item.href}>
      <div
        onClick={onNavigate}
        data-testid={`nav-${item.key}`}
        className={cn(
          "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
          isActive
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 ltr:translate-x-1 rtl:-translate-x-1"
            : "text-muted-foreground hover:bg-muted hover:text-foreground ltr:hover:translate-x-1 rtl:hover:-translate-x-1"
        )}
      >
        <Icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
        {item.label}
      </div>
    </Link>
  );
}

function NavGroup({
  group,
  location,
  onNavigate,
}: {
  group: MenuGroup;
  location: string;
  onNavigate?: () => void;
}) {
  const isGroupActive = group.items.some((item) => location === item.href || location.startsWith(item.href + "/"));
  const [open, setOpen] = useState(isGroupActive);
  const GroupIcon = group.icon;

  if (!group.collapsible) {
    if (group.items.length === 1) {
      return (
        <NavItem
          item={group.items[0]}
          isActive={location === group.items[0].href}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            isActive={location === item.href}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        data-testid={`nav-${group.key}-toggle`}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
          isGroupActive && !open
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <GroupIcon className={cn("w-5 h-5", isGroupActive && !open ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
        <span className="flex-1 text-left rtl:text-right">{group.label}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 ltr:ml-4 rtl:mr-4">
          {group.items.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              isActive={location === item.href}
              isSub
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { canAccess, capabilities } = usePermissions();
  const { t } = useTranslation();

  const menuStructure = useMemo(() => buildMenuStructure(t), [t]);
  const filteredMenu = useMemo(
    () => filterMenuByCapabilities(menuStructure, (cap) => canAccess(cap as any)),
    [menuStructure, canAccess, capabilities],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-xl shadow-lg shadow-primary/25">
            N
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
              NWS<span className="text-primary">360</span>
            </h1>
            {capabilities?.tenantName && !capabilities.isImpersonating && (
              <p className="text-[10px] text-muted-foreground truncate" data-testid="sidebar-tenant-name">
                {capabilities.tenantName}
              </p>
            )}
          </div>
        </div>
      </div>

      <TenantSwitcher />
      <ImpersonationIndicator />

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {filteredMenu.map((group) => (
          <NavGroup
            key={group.key}
            group={group}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {user && canAccess("systemAdmin") && (
        <div className="px-4 pb-2">
          <div className="border-t border-border/50 pt-3 mb-1">
            <span className="px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Developer Tools</span>
          </div>
          <Link href="/">
            <div
              onClick={onNavigate}
              data-testid="nav-dev-public-site"
              className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground rounded-lg hover:bg-muted hover:text-foreground transition-all duration-200 cursor-pointer group"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
              Public Site
            </div>
          </Link>
        </div>
      )}

      <div className="p-4 border-t border-border/50 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <LanguageSelector />
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={() => logout()}
          data-testid="button-sign-out"
          className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-muted-foreground rounded-xl hover-elevate"
        >
          <LogOut className="w-5 h-5" />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const dir = document.documentElement.dir || "ltr";
  const drawerSide = dir === "rtl" ? "right" : "left";
  const { capabilities } = usePermissions();

  return (
    <div className="md:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side={drawerSide} className="p-0 w-72" data-testid="mobile-sidebar-drawer">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg shadow-lg shadow-primary/25">
          N
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold font-display tracking-tight text-foreground">
            NWS<span className="text-primary">360</span>
          </h1>
          {capabilities?.tenantName && !capabilities.isImpersonating && (
            <p className="text-[9px] text-muted-foreground truncate">
              {capabilities.tenantName}
            </p>
          )}
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}

export function Sidebar() {
  return (
    <div className="hidden md:flex flex-col w-60 border-r border-border bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
      <SidebarContent />
    </div>
  );
}

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { canAccess, capabilities } = usePermissions();

  const allTabs = [
    { name: t("nav.newsFeed", "Feed"), icon: Newspaper, href: "/feed", testId: "nav-bottom-feed" },
    { name: t("nav.dashboard", "Dashboard"), icon: LayoutDashboard, href: "/dashboard", testId: "nav-bottom-dashboard" },
    { name: t("nav.saved", "Saved"), icon: Bookmark, href: "/saved", testId: "nav-bottom-saved" },
    { name: t("nav.analytics", "Analytics"), icon: BarChart3, href: "/analytics", testId: "nav-bottom-analytics", capability: "analytics" },
    { name: t("nav.sources", "Sources"), icon: List, href: "/sources/manage", testId: "nav-bottom-sources", capability: "sources" },
  ];

  const tabs = allTabs.filter((tab) => {
    if (!tab.capability) return true;
    return canAccess(tab.capability as any);
  });

  if (!capabilities) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border" style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom)" }} role="navigation" aria-label="Mobile navigation">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = location === tab.href || (tab.href === "/feed" && location.startsWith("/feed"));

          return (
            <button
              key={tab.testId}
              data-testid={tab.testId}
              aria-label={tab.name}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setLocation(tab.href)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-2 py-1 rounded-lg transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{tab.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
