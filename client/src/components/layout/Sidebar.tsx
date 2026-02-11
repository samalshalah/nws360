import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Newspaper, BarChart3, Settings, LogOut, ChevronDown, FileBarChart, TrendingUp, Search, MessageSquare, Shield, FileText, Network, Plus, List, Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

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
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const isAnalyticsActive = location.startsWith("/analytics");
  const isSourcesActive = location.startsWith("/sources") || location === "/admin";
  const [analyticsOpen, setAnalyticsOpen] = useState(isAnalyticsActive);
  const [sourcesOpen, setSourcesOpen] = useState(isSourcesActive);

  const topNavItems = [
    { name: t("nav.newsFeed"), href: '/feed', icon: Newspaper },
    { name: t("nav.dashboard"), href: '/', icon: LayoutDashboard },
  ];

  return (
    <div className="flex flex-col w-64 border-r border-border bg-card min-h-screen sticky top-0 h-screen rtl:border-r-0 rtl:border-l">
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

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {topNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                data-testid={`nav-${item.href.replace("/", "") || "dashboard"}`}
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
      </nav>

      <div className="p-4 border-t border-border/50 space-y-2">
        <LanguageSelector />
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
