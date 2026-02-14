import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface FilterState {
  search: string;
  sentiment: string | undefined;
  category: string | undefined;
  sourceType: string | undefined;
  sourceId: string | undefined;
  dateRange: "all" | "today" | "week" | "month";
}

const defaultFilters: FilterState = {
  search: "",
  sentiment: undefined,
  category: undefined,
  sourceType: undefined,
  sourceId: undefined,
  dateRange: "all",
};

interface FilterContextValue {
  filters: FilterState;
  setFilter: (key: keyof FilterState, value: string | undefined) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const setFilter = useCallback((key: keyof FilterState, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const hasActiveFilters = !!(
    filters.search ||
    filters.sentiment ||
    filters.category ||
    filters.sourceType ||
    filters.sourceId ||
    filters.dateRange !== "all"
  );

  return (
    <FilterContext.Provider value={{ filters, setFilter, resetFilters, hasActiveFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
