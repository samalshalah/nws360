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
import { buildClientNavTree, filterNavByCapabilities, type NavItem, type NavGroup } from "@/lib/nav-config";
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

  return (
    <Link href={item.href}>
      <div
        onClick={onNavigate}
        data-testid={`nav-${item.key}`}
        className={cn(
          "flex items-center gap-3 rounded-md cursor-pointer transition-colors duration-150",
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
  const [open, setOpen] = useState(isGroupActive);
  const GroupIcon = group.icon;

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

function ClientSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { canAccess, capabilities, isAdmin } = usePermissions();
  const { t } = useTranslation();

  const menuStructure = useMemo(() => buildClientNavTree(t), [t]);
  const filteredMenu = useMemo(
    () => filterNavByCapabilities(menuStructure, (cap) => canAccess(cap as any), isAdmin),
    [menuStructure, canAccess, capabilities, isAdmin],
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
            {capabilities?.tenantName && (
              <p className="text-[10px] text-muted-foreground/70 truncate leading-tight" data-testid="sidebar-tenant-name">
                {capabilities.tenantName}
              </p>
            )}
          </div>
        </div>
      </div>

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
    { name: t("nav.dashboard", "Home"), icon: LayoutDashboard, href: "/dashboard", testId: "nav-bottom-dashboard" },
    { name: t("nav.saved", "Saved"), icon: Bookmark, href: "/saved", testId: "nav-bottom-saved" },
    { name: t("nav.analytics", "Reports"), icon: BarChart3, href: "/analytics", testId: "nav-bottom-analytics", capability: "analytics" },
  ].filter((tab) => !tab.capability || canAccess(tab.capability as any));

  const [, setLocation] = useLocation();

  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md" data-testid="link-skip-to-content">
        Skip to content
      </a>

      <div className="hidden md:flex flex-col w-56 border-r border-border/50 bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
        <ClientSidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <div className="md:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={drawerSide} className="p-0 w-64" data-testid="mobile-sidebar-drawer">
              <ClientSidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              N
            </div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              NWS<span className="text-primary">360</span>
            </h1>
          </div>
          <ThemeToggle />
        </div>

        <BreakingNewsBanner />
        <main id="main-content" className="flex-1 overflow-y-auto min-h-0 pb-16 md:pb-0" role="main" aria-label="Main content">
          <div className="max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-5">
            {children}
          </div>
        </main>
      </div>

      {showRightPanel && (
        <aside className="hidden lg:flex flex-col w-72 border-l border-border/50 bg-card h-screen sticky top-0 overflow-y-auto rtl:border-l-0 rtl:border-r" role="complementary" aria-label="Insights panel">
          <RightPanel />
        </aside>
      )}

      {capabilities && (
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
