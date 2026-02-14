import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LogOut, ChevronDown, Menu,
  LayoutDashboard, Newspaper, BarChart3, Bookmark
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { buildNavTree, filterNavByCapabilities, type NavItem, type NavGroup } from "@/lib/nav-config";
import { BreakingNewsBanner } from "@/components/BreakingNewsBanner";
import { RightPanel } from "@/components/layout/RightPanel";

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

function ClientSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();
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
            {capabilities?.tenantName && (
              <p className="text-[10px] text-muted-foreground truncate" data-testid="sidebar-tenant-name">
                {capabilities.tenantName}
              </p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {filteredMenu.map((group) => (
          <SidebarNavGroup
            key={group.key}
            group={group}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

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

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canAccess, capabilities } = usePermissions();
  const { t } = useTranslation();
  const dir = document.documentElement.dir || "ltr";
  const drawerSide = dir === "rtl" ? "right" : "left";
  const showRightPanel = location === "/dashboard" || location === "/feed" || location.startsWith("/feed?");

  const bottomTabs = [
    { name: t("nav.newsFeed", "Feed"), icon: Newspaper, href: "/feed", testId: "nav-bottom-feed" },
    { name: t("nav.dashboard", "Dashboard"), icon: LayoutDashboard, href: "/dashboard", testId: "nav-bottom-dashboard" },
    { name: t("nav.saved", "Saved"), icon: Bookmark, href: "/saved", testId: "nav-bottom-saved" },
    { name: t("nav.analytics", "Analytics"), icon: BarChart3, href: "/analytics", testId: "nav-bottom-analytics", capability: "analytics" },
  ].filter((tab) => !tab.capability || canAccess(tab.capability as any));

  const [, setLocation] = useLocation();

  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md" data-testid="link-skip-to-content">
        Skip to content
      </a>

      <div className="hidden md:flex flex-col w-60 border-r border-border bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
        <ClientSidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <div className="md:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={drawerSide} className="p-0 w-72" data-testid="mobile-sidebar-drawer">
              <ClientSidebarContent onNavigate={() => setMobileOpen(false)} />
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
              {capabilities?.tenantName && (
                <p className="text-[9px] text-muted-foreground truncate">
                  {capabilities.tenantName}
                </p>
              )}
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

      {capabilities && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border" style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom)" }} role="navigation" aria-label="Mobile navigation">
          <div className="flex items-center justify-around h-16">
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
      )}
    </div>
  );
}
