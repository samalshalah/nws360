import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SelectedArticleContextValue {
  selectedArticleId: number | null;
  isDrawerOpen: boolean;
  openArticle: (id: number) => void;
  closeDrawer: () => void;
}

const SelectedArticleContext = createContext<SelectedArticleContextValue | null>(null);

export function SelectedArticleProvider({ children }: { children: ReactNode }) {
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openArticle = useCallback((id: number) => {
    setSelectedArticleId(id);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedArticleId(null), 300);
  }, []);

  return (
    <SelectedArticleContext.Provider value={{ selectedArticleId, isDrawerOpen, openArticle, closeDrawer }}>
      {children}
    </SelectedArticleContext.Provider>
  );
}

export function useSelectedArticle() {
  const ctx = useContext(SelectedArticleContext);
  if (!ctx) throw new Error("useSelectedArticle must be used within SelectedArticleProvider");
  return ctx;
}
