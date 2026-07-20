import { useQuery } from "@tanstack/react-query";
import { SYSTEM_ROLES, CAPS, type Cap } from "@shared/schema";

interface AuthContext {
  user: {
    id: number;
    username: string;
    role: string;
    userScope: string;
    userType: string | null;
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

interface LegacyPermissions {
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
}

interface Capabilities {
  role: string;
  userScope: string;
  userType: string | null;
  tenantId: number | null;
  tenantName: string | null;
  planTier: string;
  aiEnabled: boolean;
  aiTier: string;
  isImpersonating: boolean;
  impersonatingUsername: string | null;
  capabilities: string[];
  permissions: LegacyPermissions;
}

export { SYSTEM_ROLES, CAPS };

export function usePermissions() {
  const { data: authContext, isLoading: authLoading } = useQuery<AuthContext | null>({
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

  const { data: capabilities, isLoading: capsLoading } = useQuery<Capabilities | null>({
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
    return authContext.permissions.includes(code);
  };

  const hasAnyPermission = (...codes: string[]): boolean => {
    if (!authContext) return false;
    return codes.some((code) => authContext.permissions.includes(code));
  };

  const hasAllPermissions = (...codes: string[]): boolean => {
    if (!authContext) return false;
    return codes.every((code) => authContext.permissions.includes(code));
  };

  const hasCap = (cap: string): boolean => {
    if (!capabilities) return false;
    return capabilities.capabilities.includes(cap);
  };

  const hasAnyCap = (...caps: string[]): boolean => {
    if (!capabilities) return false;
    return caps.some((c) => capabilities.capabilities.includes(c));
  };

  const canAccess = (capability: keyof LegacyPermissions): boolean => {
    if (!capabilities) return false;
    return capabilities.permissions[capability];
  };

  const isPlatformScope = capabilities?.userScope === "platform" || authContext?.user?.userScope === "platform";
  const isTenantScope = capabilities?.userScope === "tenant" || authContext?.user?.userScope === "tenant";
  const hasTenantContext = !!capabilities?.tenantId;

  return {
    authContext,
    capabilities,
    permissions: authContext?.permissions || [],
    organization: authContext?.organization || null,
    impersonation: authContext?.impersonation || { isImpersonating: false, activeOrganizationId: null, activeUserId: null, originalUserId: null },
    isLoading: authLoading || (!!authContext && capsLoading),
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasCap,
    hasAnyCap,
    canAccess,
    isAdmin: authContext?.user?.role === SYSTEM_ROLES.SYSTEM_ADMIN,
    isClientAdmin: authContext?.user?.role === SYSTEM_ROLES.CLIENT_ADMIN,
    isClient: authContext?.user?.role === SYSTEM_ROLES.CLIENT_USER,
    isReadonly: authContext?.user?.role === SYSTEM_ROLES.READONLY_USER,
    isPlatformScope,
    isTenantScope,
    hasTenantContext,
    userType: authContext?.user?.userType || null,
    tenantId: capabilities?.tenantId || authContext?.organization?.id || null,
    planTier: capabilities?.planTier || "starter",
    aiEnabled: capabilities?.aiEnabled || false,
  };
}
