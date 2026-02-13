import { useQuery } from "@tanstack/react-query";
import { SYSTEM_ROLES } from "@shared/schema";

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

interface Capabilities {
  role: string;
  tenantId: number | null;
  tenantName: string | null;
  isImpersonating: boolean;
  impersonatingUsername: string | null;
  permissions: {
    feeds: boolean;
    analytics: boolean;
    intelligence: boolean;
    sources: boolean;
    users: boolean;
    billing: boolean;
    systemAdmin: boolean;
    collaboration: boolean;
    integrations: boolean;
    settings: boolean;
    exports: boolean;
    readOnly: boolean;
    executive: boolean;
    knowledgeMemory: boolean;
    predictiveIntelligence: boolean;
  };
}

export { SYSTEM_ROLES };

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

  const { data: capabilities } = useQuery<Capabilities>({
    queryKey: ["/api/auth/capabilities"],
    queryFn: async () => {
      const res = await fetch("/api/auth/capabilities");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch capabilities");
      return res.json();
    },
    retry: false,
    staleTime: 30000,
    enabled: !!authContext,
  });

  const hasPermission = (code: string): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === SYSTEM_ROLES.SYSTEM_ADMIN) return true;
    return authContext.permissions.includes(code);
  };

  const hasAnyPermission = (...codes: string[]): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === SYSTEM_ROLES.SYSTEM_ADMIN) return true;
    return codes.some((code) => authContext.permissions.includes(code));
  };

  const hasAllPermissions = (...codes: string[]): boolean => {
    if (!authContext) return false;
    if (authContext.user.role === SYSTEM_ROLES.SYSTEM_ADMIN) return true;
    return codes.every((code) => authContext.permissions.includes(code));
  };

  const canAccess = (capability: keyof Capabilities["permissions"]): boolean => {
    if (!capabilities) return false;
    return capabilities.permissions[capability];
  };

  return {
    authContext,
    capabilities,
    permissions: authContext?.permissions || [],
    organization: authContext?.organization || null,
    impersonation: authContext?.impersonation || { isImpersonating: false, activeOrganizationId: null, activeUserId: null, originalUserId: null },
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccess,
    isAdmin: authContext?.user?.role === SYSTEM_ROLES.SYSTEM_ADMIN,
    isClientAdmin: authContext?.user?.role === SYSTEM_ROLES.CLIENT_ADMIN,
    isClient: authContext?.user?.role === SYSTEM_ROLES.CLIENT_USER,
    isReadonly: authContext?.user?.role === SYSTEM_ROLES.READONLY_USER,
    tenantId: capabilities?.tenantId || authContext?.organization?.id || null,
  };
}
