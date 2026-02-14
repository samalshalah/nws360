import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { getDirection } from "@/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FilterProvider } from "@/contexts/FilterContext";
import { SelectedArticleProvider } from "@/contexts/SelectedArticleContext";
import { AppShell } from "@/components/layout/AppShell";

import Login from "@/pages/Login";
import HomePage from "@/pages/HomePage";
import TopicsPage from "@/pages/TopicsPage";
import AlertsPage from "@/pages/AlertsPage";
import ReportsPage from "@/pages/ReportsPage";
import SourcesPage from "@/pages/SourcesPage";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  return (
    <FilterProvider>
      <SelectedArticleProvider>
        <AppShell>
          <Component />
        </AppShell>
      </SelectedArticleProvider>
    </FilterProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute component={HomePage} />
      </Route>

      <Route path="/home">
        <ProtectedRoute component={HomePage} />
      </Route>
      <Route path="/topics">
        <ProtectedRoute component={TopicsPage} />
      </Route>
      <Route path="/alerts">
        <ProtectedRoute component={AlertsPage} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={ReportsPage} />
      </Route>
      <Route path="/sources">
        <ProtectedRoute component={SourcesPage} />
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
