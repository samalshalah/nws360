import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Newspaper, BarChart3, Settings, LogOut, ChevronDown, FileBarChart, TrendingUp, Search, MessageSquare, Shield, FileText, Network, Plus, List, Hash, Menu, Bookmark, Users, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const analyticsSubPages = [
  { key: "overview", href: "/analytics", icon: BarChart3 },
  { key: "contentVolume", href: "/analytics/content-volume", icon: FileBarChart },
  { key: "trendingTopics", href: "/analytics/trending-topics", icon: TrendingUp },
  { key: "keywordAnalysis", href: "/analytics/keyword-analysis", icon: Search },
  { key: "sentimentReports", href: "/analytics/sentiment-reports", icon: MessageSquare },
  { key: "sourceBehavior", href: "/analytics/source-behavior", icon: Shield },
  { key: "customReports", href: "/analytics/custom-reports", icon: FileText },
  { key: "networkMapping", href: "/analytics/network-mapping", icon: Network },
];

const sourcesSubPages = [
  { key: "addSource", href: "/sources/add", icon: Plus },
  { key: "manageSources", href: "/sources/manage", icon: List },
  { key: "keywords", href: "/sources/keywords", icon: Hash },
  { key: "sourceHealth", href: "/sources/health", icon: Activity },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const isAnalyticsActive = location.startsWith("/analytics");
  const isSourcesActive = location.startsWith("/sources") || location === "/admin";
  const [analyticsOpen, setAnalyticsOpen] = useState(isAnalyticsActive);
  const [sourcesOpen, setSourcesOpen] = useState(isSourcesActive);

  const topNavItems = [
    { name: t("nav.newsFeed"), href: '/feed', icon: Newspaper },
    { name: t("nav.saved"), href: '/saved', icon: Bookmark },
    { name: t("nav.dashboard"), href: '/', icon: LayoutDashboard },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-xl shadow-lg shadow-primary/25">
            N
          </div>
          <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
            NWS<span className="text-primary">360</span>
          </h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {topNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                onClick={onNavigate}
                data-testid={`nav-${item.href === "/" ? "dashboard" : item.href.replace("/", "")}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 ltr:translate-x-1 rtl:-translate-x-1"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground ltr:hover:translate-x-1 rtl:hover:-translate-x-1"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                {item.name}
              </div>
            </Link>
          );
        })}

        <div>
          <button
            onClick={() => setAnalyticsOpen(!analyticsOpen)}
            data-testid="nav-analytics-toggle"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
              isAnalyticsActive && !analyticsOpen
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <BarChart3 className={cn("w-5 h-5", isAnalyticsActive && !analyticsOpen ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
            <span className="flex-1 text-left rtl:text-right">{t("nav.analytics")}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", analyticsOpen ? "rotate-180" : "")} />
          </button>

          {analyticsOpen && (
            <div className="mt-1 space-y-0.5 ltr:ml-4 rtl:mr-4">
              {analyticsSubPages.map((sub) => {
                const isActive = location === sub.href;
                const SubIcon = sub.icon;
                return (
                  <Link key={sub.href} href={sub.href}>
                    <div
                      onClick={onNavigate}
                      data-testid={`nav-analytics-${sub.key}`}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer group",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <SubIcon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                      {t(`analyticsPages.nav.${sub.key}`)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            data-testid="nav-sources-toggle"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
              isSourcesActive && !sourcesOpen
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Settings className={cn("w-5 h-5", isSourcesActive && !sourcesOpen ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
            <span className="flex-1 text-left rtl:text-right">{t("nav.sources")}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", sourcesOpen ? "rotate-180" : "")} />
          </button>

          {sourcesOpen && (
            <div className="mt-1 space-y-0.5 ltr:ml-4 rtl:mr-4">
              {sourcesSubPages.map((sub) => {
                const isActive = location === sub.href;
                const SubIcon = sub.icon;
                return (
                  <Link key={sub.href} href={sub.href}>
                    <div
                      onClick={onNavigate}
                      data-testid={`nav-sources-${sub.key}`}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer group",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <SubIcon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                      {t(`nav.${sub.key}`)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {user && (
          <Link href="/users">
            <div
              onClick={onNavigate}
              data-testid="nav-users"
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
                location === "/users"
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 ltr:translate-x-1 rtl:-translate-x-1"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground ltr:hover:translate-x-1 rtl:hover:-translate-x-1"
              )}
            >
              <Users className={cn("w-5 h-5", location === "/users" ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
              {t("nav.users")}
            </div>
          </Link>
        )}
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

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const dir = document.documentElement.dir || "ltr";
  const drawerSide = dir === "rtl" ? "right" : "left";

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
      <div className="flex items-center gap-2 flex-1">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg shadow-lg shadow-primary/25">
          N
        </div>
        <h1 className="text-lg font-bold font-display tracking-tight text-foreground">
          NWS<span className="text-primary">360</span>
        </h1>
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

  const tabs = [
    { name: t("nav.newsFeed"), icon: Newspaper, href: "/feed", testId: "nav-bottom-feed" },
    { name: t("nav.dashboard"), icon: LayoutDashboard, href: "/", testId: "nav-bottom-dashboard" },
    { name: t("nav.saved"), icon: Bookmark, href: "/saved", testId: "nav-bottom-saved" },
    { name: t("nav.analytics"), icon: BarChart3, href: "/analytics", testId: "nav-bottom-analytics" },
    { name: t("nav.sources"), icon: Settings, href: "/sources/add", testId: "nav-bottom-sources" },
  ];

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
