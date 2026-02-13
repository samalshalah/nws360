import { useQuery } from "@tanstack/react-query";

interface AuthContext {
  user: {
    id: number;
    username: string;
    role: string;
    clientId: number | null;
    disabled: boolean;
    createdAt: string;
  };
  organization: {
    id: number;
    name: string;
    organizationType: string;
    defaultLanguage: string;
    active: boolean;
  } | null;
  permissions: string[];
  impersonation: {
    isImpersonating: boolean;
    activeOrganizationId: number | null;
    activeUserId: number | null;
    originalUserId: number | null;
  };
}

export function usePermissions() {
  const { data: authContext, isLoading } = useQuery<AuthContext>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth context");
      return res.json();
    },
    retry: false,
    staleTime: 30000,
  });

  const hasPermission = (code: string): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === "admin") return true;
    return authContext.permissions.includes(code);
  };

  const hasAnyPermission = (...codes: string[]): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === "admin") return true;
    return codes.some((code) => authContext.permissions.includes(code));
  };

  const hasAllPermissions = (...codes: string[]): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === "admin") return true;
    return codes.every((code) => authContext.permissions.includes(code));
  };

  return {
    authContext,
    permissions: authContext?.permissions || [],
    organization: authContext?.organization || null,
    impersonation: authContext?.impersonation || { isImpersonating: false, activeOrganizationId: null, activeUserId: null, originalUserId: null },
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin: authContext?.user?.role === "admin",
    isClient: authContext?.user?.role === "client",
  };
}
