import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { getDirection } from "@/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import { canAccessRoute } from "@/lib/nav-config";
import { UniversalShell } from "@/components/layout/UniversalShell";

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
import AdminDashboard from "@/pages/AdminDashboard";
import Saved from "@/pages/Saved";
import UserManagement from "@/pages/UserManagement";
import SourceHealth from "@/pages/SourceHealth";
import OpsDashboard from "@/pages/OpsDashboard";
import IntelligencePage from "@/pages/IntelligencePage";
import OnboardingWizard from "@/pages/OnboardingWizard";
import UsageBilling from "@/pages/UsageBilling";
import ExecutiveHome from "@/pages/ExecutiveHome";
import DemoPage from "@/pages/DemoPage";
import HelpCenter from "@/pages/HelpCenter";
import ProductAnalytics from "@/pages/ProductAnalytics";
import Integrations from "@/pages/Integrations";
import IntegrationMonitoring from "@/pages/IntegrationMonitoring";
import Collaboration from "@/pages/Collaboration";
import Knowledge from "@/pages/Knowledge";
import Forecasting from "@/pages/Forecasting";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";
import NotAuthorized from "@/pages/NotAuthorized";

function ShellGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { hasCap, isAdmin, isLoading: permLoading } = usePermissions();
  const [location, setLocation] = useLocation();

  if (isLoading || (user && permLoading)) {
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

  if (!canAccessRoute(location, hasCap, isAdmin)) {
    setTimeout(() => setLocation("/not-authorized"), 0);
    return null;
  }

  return <UniversalShell>{children}</UniversalShell>;
}

function ProtectedPage({ component: Component }: { component: any }) {
  return (
    <ShellGate>
      <Component />
    </ShellGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={OnboardingWizard} />

      <Route path="/" component={Landing} />
      <Route path="/demo" component={DemoPage} />

      <Route path="/not-authorized">
        <ShellGate>
          <NotAuthorized />
        </ShellGate>
      </Route>

      <Route path="/dashboard">
        <ProtectedPage component={Dashboard} />
      </Route>
      <Route path="/feed">
        <ProtectedPage component={Feed} />
      </Route>
      <Route path="/saved">
        <ProtectedPage component={Saved} />
      </Route>

      <Route path="/analytics">
        <ProtectedPage component={Analytics} />
      </Route>
      <Route path="/analytics/content-volume">
        <ProtectedPage component={ContentVolume} />
      </Route>
      <Route path="/analytics/trending-topics">
        <ProtectedPage component={TrendingTopics} />
      </Route>
      <Route path="/analytics/keyword-analysis">
        <ProtectedPage component={KeywordAnalysis} />
      </Route>
      <Route path="/analytics/sentiment-reports">
        <ProtectedPage component={SentimentReports} />
      </Route>
      <Route path="/analytics/source-behavior">
        <ProtectedPage component={SourceBehavior} />
      </Route>
      <Route path="/analytics/custom-reports">
        <ProtectedPage component={CustomReports} />
      </Route>
      <Route path="/analytics/network-mapping">
        <ProtectedPage component={NetworkMapping} />
      </Route>
      <Route path="/analytics/narrative-comparison">
        <ProtectedPage component={NarrativeComparison} />
      </Route>
      <Route path="/analytics/daily-brief">
        <ProtectedPage component={DailyBrief} />
      </Route>
      <Route path="/analytics/keyword-detail">
        <ProtectedPage component={KeywordDetail} />
      </Route>

      <Route path="/intelligence">
        <ProtectedPage component={IntelligencePage} />
      </Route>
      <Route path="/forecasting">
        <ProtectedPage component={Forecasting} />
      </Route>

      <Route path="/sources/add">
        <ProtectedPage component={() => <Admin tab="add" />} />
      </Route>
      <Route path="/sources/manage">
        <ProtectedPage component={() => <Admin tab="manage" />} />
      </Route>
      <Route path="/sources/keywords">
        <ProtectedPage component={() => <Admin tab="keywords" />} />
      </Route>

      <Route path="/sources/health">
        <ProtectedPage component={SourceHealth} />
      </Route>
      <Route path="/admin/dashboard">
        <ProtectedPage component={AdminDashboard} />
      </Route>
      <Route path="/admin/ops">
        <ProtectedPage component={OpsDashboard} />
      </Route>
      <Route path="/admin/product-analytics">
        <ProtectedPage component={ProductAnalytics} />
      </Route>
      <Route path="/admin/integrations">
        <ProtectedPage component={IntegrationMonitoring} />
      </Route>
      <Route path="/admin">
        <ProtectedPage component={Admin} />
      </Route>

      <Route path="/users">
        <ProtectedPage component={UserManagement} />
      </Route>
      <Route path="/usage-billing">
        <ProtectedPage component={UsageBilling} />
      </Route>
      <Route path="/executive">
        <ProtectedPage component={ExecutiveHome} />
      </Route>
      <Route path="/help">
        <ProtectedPage component={HelpCenter} />
      </Route>
      <Route path="/integrations">
        <ProtectedPage component={Integrations} />
      </Route>
      <Route path="/collaboration">
        <ProtectedPage component={Collaboration} />
      </Route>
      <Route path="/knowledge">
        <ProtectedPage component={Knowledge} />
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
