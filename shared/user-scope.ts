export const PLATFORM_USER_SCOPE = "platform";
export const TENANT_USER_SCOPE = "tenant";

export interface UserScopeClientInput {
  userScope?: string | null;
  clientId?: number | null;
}

export interface ExistingUserScopeClient {
  userScope?: string | null;
  clientId?: number | null;
}

export interface NormalizeUserScopeClientOptions {
  mode: "create" | "update";
  existing?: ExistingUserScopeClient | null;
}

function isValidClientId(clientId: unknown): clientId is number {
  return typeof clientId === "number" && Number.isInteger(clientId) && clientId > 0;
}

export function normalizeUserScopeClientAssignment(
  input: UserScopeClientInput,
  options: NormalizeUserScopeClientOptions,
): { userScope: string; clientId: number | null } {
  const existingScope = options.existing?.userScope || TENANT_USER_SCOPE;
  const userScope = input.userScope || existingScope;
  const hasClientInput = Object.prototype.hasOwnProperty.call(input, "clientId");
  const clientId = hasClientInput ? input.clientId ?? null : options.existing?.clientId ?? null;

  if (userScope === PLATFORM_USER_SCOPE) {
    if (options.mode === "create" && clientId !== null) {
      throw new Error("Platform users cannot be assigned to a tenant client");
    }
    return { userScope, clientId: null };
  }

  if (!isValidClientId(clientId)) {
    throw new Error("Tenant users require a valid clientId");
  }

  return { userScope, clientId };
}
