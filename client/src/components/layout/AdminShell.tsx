import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LogOut, ChevronDown, Menu, ExternalLink,
  Shield, X, Users
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
import { buildNavTree, filterNavByCapabilities, type NavItem, type NavGroup } from "@/lib/nav-config";
import { BreakingNewsBanner } from "@/components/BreakingNewsBanner";
import { RightPanel } from "@/components/layout/RightPanel";

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

function ImpersonationBar() {
  const { impersonation, capabilities } = usePermissions();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/admin/clients"],
    enabled: !!capabilities?.permissions?.systemAdmin,
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/admin/clients", impersonation?.activeOrganizationId, "users"],
    queryFn: async () => {
      if (!impersonation?.activeOrganizationId) return [];
      const res = await fetch(`/api/users?clientId=${impersonation.activeOrganizationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!impersonation?.activeOrganizationId && !!capabilities?.permissions?.systemAdmin,
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

  if (!capabilities?.permissions?.systemAdmin) return null;

  if (!impersonation?.isImpersonating) {
    return (
      <div
        data-testid="impersonation-bar"
        className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30"
      >
        <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground font-medium flex-shrink-0">Impersonate:</span>
        <Select
          value=""
          onValueChange={(val) => {
            if (val) impersonateOrgMutation.mutate(parseInt(val));
          }}
        >
          <SelectTrigger className="h-7 text-xs w-40" data-testid="impersonate-tenant-select">
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
      className="flex items-center gap-3 px-4 py-2 border-b border-amber-500/30 bg-amber-500/10"
    >
      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex-shrink-0">Viewing as:</span>

      <Select
        value={impersonation.activeOrganizationId?.toString() || ""}
        onValueChange={(val) => {
          if (val) impersonateOrgMutation.mutate(parseInt(val));
        }}
      >
        <SelectTrigger className="h-7 text-xs w-40 border-amber-500/30" data-testid="impersonate-tenant-active">
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
          <SelectTrigger className="h-7 text-xs w-40 border-amber-500/30" data-testid="impersonate-user-select">
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
  const [open, setOpen] = useState(isGroupActive);
  const GroupIcon = group.icon;

  if (!group.collapsible) {
    if (group.items.length === 1) {
      return (
        <SidebarNavItem
          item={group.items[0]}
          isActive={location === group.items[0].href}
          onNavigate={onNavigate}
        />
      );
    }
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

function AdminSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { canAccess, capabilities, isAdmin } = usePermissions();
  const { t } = useTranslation();

  const menuStructure = useMemo(() => buildNavTree(t), [t]);
  const filteredMenu = useMemo(
    () => filterNavByCapabilities(menuStructure, (cap) => canAccess(cap as any), isAdmin),
    [menuStructure, canAccess, capabilities, isAdmin],
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
            <p className="text-[10px] text-muted-foreground" data-testid="shell-label-admin">
              Control Center
            </p>
          </div>
        </div>
      </div>

      <TenantSwitcher />

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Admin navigation">
        {filteredMenu.map((group) => (
          <SidebarNavGroup
            key={group.key}
            group={group}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

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
          className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-muted-foreground rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
        >
          <LogOut className="w-5 h-5" />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const dir = document.documentElement.dir || "ltr";
  const drawerSide = dir === "rtl" ? "right" : "left";
  const showRightPanel = location === "/dashboard" || location === "/feed" || location.startsWith("/feed?");

  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md" data-testid="link-skip-to-content">
        Skip to content
      </a>

      <div className="hidden md:flex flex-col w-60 border-r border-border bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
        <AdminSidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <ImpersonationBar />

        <div className="md:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={drawerSide} className="p-0 w-72" data-testid="mobile-sidebar-drawer">
              <AdminSidebarContent onNavigate={() => setMobileOpen(false)} />
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
              <p className="text-[9px] text-muted-foreground">Control Center</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <BreakingNewsBanner />
        <main id="main-content" className="flex-1 overflow-y-auto min-h-0 pb-16 md:pb-0" role="main" aria-label="Main content">
          <div className="max-w-7xl mx-auto p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>

      {showRightPanel && (
        <aside className="hidden lg:flex flex-col w-72 border-l border-border bg-card h-screen sticky top-0 overflow-y-auto rtl:border-l-0 rtl:border-r" role="complementary" aria-label="Insights panel">
          <RightPanel />
        </aside>
      )}
    </div>
  );
}
