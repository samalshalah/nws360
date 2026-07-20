import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LogOut, ChevronDown, Menu, ExternalLink,
  Shield, X, Users, LayoutDashboard, Newspaper, BarChart3, Bookmark
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
import { buildAdminNavTree, buildClientNavTree, filterNavByCaps, type NavItem, type NavGroup } from "@/lib/nav-config";
import { BreakingNewsBanner } from "@/components/BreakingNewsBanner";
import { RightPanel } from "@/components/layout/RightPanel";

function TenantSwitcher() {
  const { capabilities, isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isAdmin,
  });

  const selectTenantMutation = useMutation({
    mutationFn: async (tenantId: number | null) => {
      await apiRequest("POST", "/api/admin/select-tenant", { tenantId });
    },
    onSuccess: (_data, tenantId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/capabilities"] });
      setLocation(tenantId ? "/feed" : "/admin");
    },
  });

  if (!isAdmin) return null;

  return (
    <div className="px-3 py-2" data-testid="tenant-switcher">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 block px-1">
        Workspace
      </label>
      <Select
        value={capabilities?.tenantId?.toString() || "all"}
        onValueChange={(val) => {
          selectTenantMutation.mutate(val === "all" ? null : parseInt(val));
        }}
      >
        <SelectTrigger className="h-8 text-xs" data-testid="select-tenant">
          <SelectValue placeholder="Control Center" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" data-testid="select-tenant-all">Control Center</SelectItem>
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

function ImpersonationBar() {
  const { impersonation, capabilities, isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isAdmin,
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/admin/clients", impersonation?.activeOrganizationId, "users"],
    queryFn: async () => {
      if (!impersonation?.activeOrganizationId) return [];
      const res = await fetch(`/api/users?clientId=${impersonation.activeOrganizationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!impersonation?.activeOrganizationId && isAdmin,
  });

  const invalidateAuth = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/capabilities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
  };

  const impersonateOrgMutation = useMutation({
    mutationFn: async (orgId: number) => {
      await apiRequest("POST", `/api/admin/impersonate/organization/${orgId}`);
    },
    onSuccess: invalidateAuth,
    onError: () => {},
  });

  const impersonateUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/admin/impersonate/user/${userId}`);
    },
    onSuccess: invalidateAuth,
    onError: () => {},
  });

  const exitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/impersonate/exit");
    },
    onSuccess: () => {
      invalidateAuth();
      window.location.reload();
    },
    onError: () => {},
  });

  if (!isAdmin) return null;

  if (!impersonation?.isImpersonating) {
    return (
      <div
        data-testid="impersonation-bar"
        className="flex items-center gap-2 px-4 py-1.5 border-b border-border/40 bg-muted/20"
      >
        <Shield className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">View as:</span>
        <Select
          value=""
          onValueChange={(val) => {
            if (val) impersonateOrgMutation.mutate(parseInt(val));
          }}
        >
          <SelectTrigger className="h-7 text-xs w-36" data-testid="impersonate-tenant-select">
            <SelectValue placeholder="Select tenant..." />
          </SelectTrigger>
          <SelectContent>
            {clients?.map((c: any) => (
              <SelectItem key={c.id} value={c.id.toString()} data-testid={`impersonate-tenant-${c.id}`}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div
      data-testid="impersonation-bar-active"
      className="flex items-center gap-2 px-4 py-1.5 border-b border-amber-500/20 bg-amber-500/5"
    >
      <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 flex-shrink-0">Viewing as:</span>

      <Select
        value={impersonation.activeOrganizationId?.toString() || ""}
        onValueChange={(val) => {
          if (val) impersonateOrgMutation.mutate(parseInt(val));
        }}
      >
        <SelectTrigger className="h-7 text-xs w-36 border-amber-500/20" data-testid="impersonate-tenant-active">
          <SelectValue placeholder="Tenant" />
        </SelectTrigger>
        <SelectContent>
          {clients?.map((c: any) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {users && users.length > 0 && (
        <Select
          value={impersonation.activeUserId?.toString() || ""}
          onValueChange={(val) => {
            if (val) impersonateUserMutation.mutate(parseInt(val));
          }}
        >
          <SelectTrigger className="h-7 text-xs w-36 border-amber-500/20" data-testid="impersonate-user-select">
            <SelectValue placeholder="Select user..." />
          </SelectTrigger>
          <SelectContent>
            {users.map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                {u.username} ({u.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        data-testid="button-exit-impersonation"
        size="sm"
        variant="ghost"
        className="h-7 text-amber-700 dark:text-amber-300 ml-auto no-default-hover-elevate"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
      >
        <X className="h-3 w-3 mr-1" />
        Exit
      </Button>
    </div>
  );
}

function SidebarNavItem({
  item,
  isActive,
  isSub,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  isSub?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link href={item.href}>
      <div
        onClick={onNavigate}
        data-testid={`nav-${item.key}`}
        className={cn(
          "flex items-center gap-2.5 rounded-md cursor-pointer transition-colors duration-150",
          isSub ? "px-3 py-1.5 text-[13px]" : "px-3 py-2 text-sm",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover-elevate"
        )}
      >
        <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate">{item.label}</span>
      </div>
    </Link>
  );
}

function SidebarNavGroup({
  group,
  location,
  onNavigate,
}: {
  group: NavGroup;
  location: string;
  onNavigate?: () => void;
}) {
  const isGroupActive = group.items.some((item) => location === item.href || location.startsWith(item.href + "/"));
  const [open, setOpen] = useState(isGroupActive || !group.collapsible);

  if (!group.collapsible) {
    return (
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarNavItem
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
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 rounded-md hover:text-muted-foreground transition-colors cursor-pointer"
      >
        <span className="flex-1 text-left rtl:text-right">{group.label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map((item) => (
            <SidebarNavItem
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

function UniversalSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { hasCap, capabilities, isAdmin } = usePermissions();
  const { t } = useTranslation();
  const isPlatformContext = isAdmin && capabilities?.userScope === "platform" && !capabilities?.tenantId;

  const menuStructure = useMemo(
    () => (isPlatformContext ? buildAdminNavTree(t) : buildClientNavTree(t)),
    [t, isPlatformContext],
  );
  const filteredMenu = useMemo(
    () => filterNavByCaps(menuStructure, hasCap, isAdmin),
    [menuStructure, hasCap, capabilities, isAdmin],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            N
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight text-foreground">
              NWS<span className="text-primary">360</span>
            </h1>
            {isAdmin ? (
              <p className="text-[10px] text-muted-foreground/70 leading-tight" data-testid="shell-label-admin">
                Control Center
              </p>
            ) : capabilities?.tenantName ? (
              <p className="text-[10px] text-muted-foreground/70 truncate leading-tight" data-testid="sidebar-tenant-name">
                {capabilities.tenantName}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {isAdmin && <TenantSwitcher />}

      <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {filteredMenu.map((group) => (
          <SidebarNavGroup
            key={group.key}
            group={group}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {isAdmin && (
        <div className="px-3 pb-2">
          <Link href="/">
            <div
              onClick={onNavigate}
              data-testid="nav-dev-public-site"
              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-muted-foreground rounded-md hover-elevate cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Public Site
            </div>
          </Link>
        </div>
      )}

      <div className="px-3 py-3 border-t border-border/40 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <LanguageSelector />
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={() => logout()}
          data-testid="button-sign-out"
          className="flex items-center gap-2.5 px-3 py-2 w-full text-sm text-muted-foreground rounded-md hover-elevate"
        >
          <LogOut className="w-4 h-4" />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}

export function UniversalShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasCap, capabilities, isAdmin } = usePermissions();
  const { t } = useTranslation();
  const dir = document.documentElement.dir || "ltr";
  const drawerSide = dir === "rtl" ? "right" : "left";
  const isPlatformContext = isAdmin && capabilities?.userScope === "platform" && !capabilities?.tenantId;
  const showRightPanel = !isPlatformContext && (location === "/dashboard" || location === "/feed" || location.startsWith("/feed?"));

  const bottomTabs = [
    { name: t("nav.newsFeed", "Feed"), icon: Newspaper, href: "/feed", testId: "nav-bottom-feed" },
    { name: t("nav.dashboard", "Home"), icon: LayoutDashboard, href: "/dashboard", testId: "nav-bottom-dashboard" },
    { name: t("nav.saved", "Saved"), icon: Bookmark, href: "/saved", testId: "nav-bottom-saved" },
    ...(hasCap("analytics_view") ? [{ name: t("nav.analytics", "Reports"), icon: BarChart3, href: "/analytics", testId: "nav-bottom-analytics" }] : []),
  ];

  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md" data-testid="link-skip-to-content">
        Skip to content
      </a>

      <div className="hidden md:flex flex-col w-56 border-r border-border/50 bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
        <UniversalSidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {isAdmin && <ImpersonationBar />}

        <div className="md:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={drawerSide} className="p-0 w-64" data-testid="mobile-sidebar-drawer">
              <UniversalSidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              N
            </div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              NWS<span className="text-primary">360</span>
            </h1>
            {isAdmin && (
              <span className="text-[10px] text-muted-foreground">Control Center</span>
            )}
          </div>
          <ThemeToggle />
        </div>

        <BreakingNewsBanner />
        <main id="main-content" className="flex-1 overflow-y-auto min-h-0 pb-16 md:pb-0" role="main" aria-label="Main content">
          <div className={cn("mx-auto px-4 py-4 md:px-6 md:py-5", isAdmin ? "max-w-7xl" : "max-w-6xl")}>
            {children}
          </div>
        </main>
      </div>

      {showRightPanel && (
        <aside className="hidden lg:flex flex-col w-72 border-l border-border/50 bg-card h-screen sticky top-0 overflow-y-auto rtl:border-l-0 rtl:border-r" role="complementary" aria-label="Insights panel">
          <RightPanel />
        </aside>
      )}

      {capabilities && !isPlatformContext && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/50" style={{ height: 60, paddingBottom: "env(safe-area-inset-bottom)" }} role="navigation" aria-label="Mobile navigation">
          <div className="flex items-center justify-around h-full">
            {bottomTabs.map((tab) => {
              const isActive = location === tab.href || (tab.href === "/feed" && location.startsWith("/feed"));
              return (
                <button
                  key={tab.testId}
                  data-testid={tab.testId}
                  aria-label={tab.name}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setLocation(tab.href)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 rounded-md transition-colors",
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
      )}
    </div>
  );
}
