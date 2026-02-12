import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar, MobileBottomNav, MobileHeader } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { getDirection } from "@/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";

import { BreakingNewsBanner } from "@/components/BreakingNewsBanner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Feed from "@/pages/Feed";
import Analytics from "@/pages/Analytics";
import ContentVolume from "@/pages/analytics/ContentVolume";
import TrendingTopics from "@/pages/analytics/TrendingTopics";
import KeywordAnalysis from "@/pages/analytics/KeywordAnalysis";
import SentimentReports from "@/pages/analytics/SentimentReports";
import SourceBehavior from "@/pages/analytics/SourceBehavior";
import CustomReports from "@/pages/analytics/CustomReports";
import NetworkMapping from "@/pages/analytics/NetworkMapping";
import NarrativeComparison from "@/pages/analytics/NarrativeComparison";
import DailyBrief from "@/pages/analytics/DailyBrief";
import KeywordDetail from "@/pages/analytics/KeywordDetail";
import Admin from "@/pages/Admin";
import Saved from "@/pages/Saved";
import UserManagement from "@/pages/UserManagement";
import SourceHealth from "@/pages/SourceHealth";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, ...rest }: { component: any, path?: string }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  const showRightPanel = location === "/" || location === "/feed" || location.startsWith("/feed?");

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <MobileHeader />
        <BreakingNewsBanner />
        <main className="flex-1 overflow-y-auto min-h-0 pb-16 md:pb-0">
          <div className="max-w-7xl mx-auto p-4 md:p-6">
            <Component />
          </div>
        </main>
      </div>
      {showRightPanel && (
        <div className="hidden lg:flex flex-col w-72 border-l border-border bg-card h-screen sticky top-0 overflow-y-auto rtl:border-l-0 rtl:border-r">
          <RightPanel />
        </div>
      )}
      <MobileBottomNav />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/feed">
        <ProtectedRoute component={Feed} />
      </Route>
      <Route path="/saved">
        <ProtectedRoute component={Saved} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={Analytics} />
      </Route>
      <Route path="/analytics/content-volume">
        <ProtectedRoute component={ContentVolume} />
      </Route>
      <Route path="/analytics/trending-topics">
        <ProtectedRoute component={TrendingTopics} />
      </Route>
      <Route path="/analytics/keyword-analysis">
        <ProtectedRoute component={KeywordAnalysis} />
      </Route>
      <Route path="/analytics/sentiment-reports">
        <ProtectedRoute component={SentimentReports} />
      </Route>
      <Route path="/analytics/source-behavior">
        <ProtectedRoute component={SourceBehavior} />
      </Route>
      <Route path="/analytics/custom-reports">
        <ProtectedRoute component={CustomReports} />
      </Route>
      <Route path="/analytics/network-mapping">
        <ProtectedRoute component={NetworkMapping} />
      </Route>
      <Route path="/analytics/narrative-comparison">
        <ProtectedRoute component={NarrativeComparison} />
      </Route>
      <Route path="/analytics/daily-brief">
        <ProtectedRoute component={DailyBrief} />
      </Route>
      <Route path="/analytics/keyword-detail">
        <ProtectedRoute component={KeywordDetail} />
      </Route>
      <Route path="/sources/add">
        <ProtectedRoute component={() => <Admin tab="add" />} />
      </Route>
      <Route path="/sources/manage">
        <ProtectedRoute component={() => <Admin tab="manage" />} />
      </Route>
      <Route path="/sources/keywords">
        <ProtectedRoute component={() => <Admin tab="keywords" />} />
      </Route>
      <Route path="/sources/health">
        <ProtectedRoute component={SourceHealth} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={Admin} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UserManagement} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language?.split("-")[0] || "en";
    const dir = getDirection(lang);
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;

    const handleLanguageChanged = (lng: string) => {
      const d = getDirection(lng);
      document.documentElement.dir = d;
      document.documentElement.lang = lng;
    };
    i18n.on("languageChanged", handleLanguageChanged);
    return () => { i18n.off("languageChanged", handleLanguageChanged); };
  }, [i18n]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
