import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, ShieldOff, Trash2, UserPlus, Users, Crown, Info, KeyRound, Briefcase } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CAPS, SYSTEM_ROLES, USER_TYPES } from "@shared/schema";
import type { User } from "@shared/schema";

const USER_TYPE_LABELS: Record<string, string> = {
  reader: "Reader",
  analyst: "Analyst",
  editor: "Editor",
  monitor: "Monitor",
  executive: "Executive",
  integrations_manager: "Integrations",
};

const USER_TYPE_DESCRIPTIONS: Record<string, string> = {
  reader: "View articles and saved items",
  analyst: "Full analytics and intelligence access",
  editor: "Content curation and source management",
  monitor: "Operations monitoring and alerts",
  executive: "High-level briefs and executive dashboards",
  integrations_manager: "API keys, webhooks, and integrations",
};

const ROLE_LABELS: Record<string, string> = {
  [SYSTEM_ROLES.SYSTEM_ADMIN]: "System Admin",
  [SYSTEM_ROLES.CLIENT_ADMIN]: "Client Admin",
  [SYSTEM_ROLES.CLIENT_USER]: "User",
  [SYSTEM_ROLES.READONLY_USER]: "Read Only",
};

function CardInfo({ description }: { description: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-card-info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="text-sm max-w-sm">
        {description}
      </PopoverContent>
    </Popover>
  );
}

export default function UserManagement() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { hasCap, isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>(SYSTEM_ROLES.CLIENT_USER);
  const [newUserType, setNewUserType] = useState("reader");
  const [newClientId, setNewClientId] = useState("");
  const [passwordResetUser, setPasswordResetUser] = useState<{ id: number; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: clients } = useQuery<{ id: number; name: string; active: boolean }[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isAdmin,
  });

  const { data: usage } = useQuery<{ plan: string; seats: { used: number; max: number } }>({
    queryKey: ["/api/subscription/usage"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; role: string; userType: string; clientId?: string }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("userManagement.userCreated") });
      setNewUsername("");
      setNewPassword("");
      setNewRole(SYSTEM_ROLES.CLIENT_USER);
      setNewUserType("reader");
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/users/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const updateUserTypeMutation = useMutation({
    mutationFn: async ({ id, userType }: { id: number; userType: string }) => {
      await apiRequest("PATCH", `/api/users/${id}/user-type`, { userType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User type updated" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      await apiRequest("PATCH", `/api/users/${id}/password`, { password });
    },
    onSuccess: () => {
      toast({ title: "Password updated successfully" });
      setPasswordResetUser(null);
      setResetPassword("");
    },
    onError: (error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm(t("userManagement.confirmDelete"))) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    const payload: any = { username: newUsername.trim(), password: newPassword, role: newRole, userType: newUserType };
    if (isAdmin && newClientId) {
      payload.clientId = newClientId;
    }
    createUserMutation.mutate(payload);
  };

  const getParentUsername = (parentId: number | null | undefined) => {
    if (!parentId || !users) return "-";
    const parent = users.find((u: any) => u.id === parentId);
    return parent ? parent.username : "-";
  };

  const canInviteUsers = hasCap(CAPS.USERS_INVITE);
  const canEditUsers = hasCap(CAPS.USERS_EDIT);
  const canAssignRoles = hasCap(CAPS.USERS_ASSIGN_ROLES);
  const canDisableUsers = hasCap(CAPS.USERS_DISABLE);
  const canManageUser = (_u: any) => isAdmin || canEditUsers || canAssignRoles || canDisableUsers;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-user-management-title">
          {t("userManagement.title")}
        </h1>
        <p className="text-muted-foreground">{t("userManagement.subtitle")}</p>
      </div>

      {usage && usage.seats && (
        <Card className="border-border/50 shadow-md" data-testid="card-seat-usage">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold" data-testid="text-seat-usage">
                    Team Usage: {usage.seats.used} / {usage.seats.max === -1 || usage.seats.max >= 999 ? "Unlimited" : usage.seats.max} seats used
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {usage.plan} plan
                  </p>
                </div>
              </div>
              <div className="flex-1 max-w-xs">
                {usage.seats.max > 0 && usage.seats.max < 999 && (
                  <Progress
                    value={(usage.seats.used / usage.seats.max) * 100}
                    className={`h-2 ${usage.seats.used / usage.seats.max > 0.9 ? "[&>div]:bg-destructive" : usage.seats.used / usage.seats.max > 0.7 ? "[&>div]:bg-amber-500" : ""}`}
                    data-testid="progress-seat-usage"
                  />
                )}
              </div>
              {usage.seats.max > 0 && usage.seats.max < 999 && usage.seats.used >= usage.seats.max && (
                <Badge variant="destructive" className="no-default-hover-elevate no-default-active-elevate">
                  <Crown className="w-3 h-3 mr-1" />
                  Upgrade needed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canInviteUsers && (
        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {t("userManagement.createUser")}
              <CardInfo description="Create new team members with specific roles and access levels. The User Type determines which features they can access." />
            </CardTitle>
            <CardDescription>{t("userManagement.createUserSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4" data-testid="form-create-user">
            <div className="flex flex-col sm:flex-row items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px] space-y-1">
                <label className="text-sm text-muted-foreground">{t("userManagement.newUsername")}</label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t("userManagement.newUsername")}
                  data-testid="input-new-username"
                />
              </div>
              <div className="flex-1 min-w-[180px] space-y-1">
                <label className="text-sm text-muted-foreground">{t("userManagement.newPassword")}</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("userManagement.newPassword")}
                  data-testid="input-new-password"
                />
              </div>
              {isAdmin && (
                <div className="min-w-[140px] space-y-1">
                  <label className="text-sm text-muted-foreground">{t("userManagement.role")}</label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger data-testid="select-trigger-new-role">
                      <SelectValue placeholder={t("userManagement.selectRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SYSTEM_ROLES.SYSTEM_ADMIN} data-testid="select-item-admin">System Admin</SelectItem>
                      <SelectItem value={SYSTEM_ROLES.CLIENT_ADMIN} data-testid="select-item-client-admin">Client Admin</SelectItem>
                      <SelectItem value={SYSTEM_ROLES.CLIENT_USER} data-testid="select-item-client">User</SelectItem>
                      <SelectItem value={SYSTEM_ROLES.READONLY_USER} data-testid="select-item-readonly">Read Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="min-w-[150px] space-y-1">
                <label className="text-sm text-muted-foreground">User Type</label>
                <Select value={newUserType} onValueChange={setNewUserType}>
                  <SelectTrigger data-testid="select-trigger-new-user-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} data-testid={`select-item-usertype-${value}`}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && clients && clients.length > 0 && (
                <div className="min-w-[160px] space-y-1">
                  <label className="text-sm text-muted-foreground">Assign to Client</label>
                  <Select value={newClientId} onValueChange={setNewClientId}>
                    <SelectTrigger data-testid="select-trigger-new-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.filter(c => c.active).map(c => (
                        <SelectItem key={c.id} value={String(c.id)} data-testid={`select-client-${c.id}`}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createUserMutation.isPending || !newUsername.trim() || !newPassword.trim()} data-testid="button-create-user">
                <UserPlus className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                {createUserMutation.isPending ? t("userManagement.creating") : t("userManagement.createUser")}
              </Button>
              {newUserType && (
                <span className="text-xs text-muted-foreground" data-testid="text-usertype-description">
                  {USER_TYPE_DESCRIPTIONS[newUserType]}
                </span>
              )}
            </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-md">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm" data-testid="text-no-users">{t("userManagement.noUsers")}</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("userManagement.username")}</TableHead>
                      <TableHead>{t("userManagement.role")}</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>{t("userManagement.joined")}</TableHead>
                      <TableHead className="text-right rtl:text-left">{t("userManagement.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u: any) => {
                      const isCurrentUser = currentUser?.id === u.id;
                      const canManage = canManageUser(u);
                      return (
                        <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                          <TableCell className="font-medium">
                            {u.username}
                            {isCurrentUser && (
                              <span className="text-muted-foreground text-xs ml-2 rtl:ml-0 rtl:mr-2">{t("userManagement.you")}</span>
                            )}
                            {u.disabled && (
                              <Badge variant="outline" className="ml-2 text-[10px] no-default-hover-elevate">Disabled</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === SYSTEM_ROLES.SYSTEM_ADMIN ? "default" : "secondary"} data-testid={`badge-role-${u.id}`}>
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {canEditUsers && canManage && !isCurrentUser ? (
                              <Select
                                value={u.userType || "reader"}
                                onValueChange={(val) => updateUserTypeMutation.mutate({ id: u.id, userType: val })}
                              >
                                <SelectTrigger className="h-8 w-32 text-xs" data-testid={`select-usertype-${u.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground" data-testid={`text-usertype-${u.id}`}>
                                {USER_TYPE_LABELS[u.userType || "reader"] || u.userType || "Reader"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                          </TableCell>
                          <TableCell className="text-right rtl:text-left">
                            {isCurrentUser ? null : canManage ? (
                              <div className="flex items-center gap-2 justify-end rtl:justify-start flex-wrap">
                                {canAssignRoles && (
                                  <Select
                                    value={u.role}
                                    onValueChange={(val) => updateRoleMutation.mutate({ id: u.id, role: val })}
                                  >
                                    <SelectTrigger className="h-8 w-28 text-xs" data-testid={`select-role-${u.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {isAdmin && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setPasswordResetUser({ id: u.id, username: u.username }); setResetPassword(""); }}
                                    data-testid={`button-change-password-${u.id}`}
                                  >
                                    <KeyRound className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                                    Password
                                  </Button>
                                )}
                                {canDisableUsers && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={deleteUserMutation.isPending}
                                    onClick={() => handleDelete(u.id)}
                                    className="text-destructive"
                                    data-testid={`button-delete-user-${u.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {users.map((u: any) => {
                  const isCurrentUser = currentUser?.id === u.id;
                  const canManage = canManageUser(u);
                  return (
                    <Card key={u.id} className="overflow-visible" data-testid={`card-user-${u.id}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-medium">
                            {u.username}
                            {isCurrentUser && (
                              <span className="text-muted-foreground text-xs ml-2 rtl:ml-0 rtl:mr-2">{t("userManagement.you")}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={u.role === SYSTEM_ROLES.SYSTEM_ADMIN ? "default" : "secondary"}>
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                            <Badge variant="outline" className="no-default-hover-elevate">
                              <Briefcase className="w-3 h-3 mr-1" />
                              {USER_TYPE_LABELS[u.userType || "reader"] || "Reader"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("userManagement.joined")}: {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                        </div>
                        {!isCurrentUser && canManage && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {canEditUsers && (
                                <Select
                                  value={u.userType || "reader"}
                                  onValueChange={(val) => updateUserTypeMutation.mutate({ id: u.id, userType: val })}
                                >
                                  <SelectTrigger className="h-8 w-32 text-xs" data-testid={`select-usertype-mobile-${u.id}`}>
                                    <Briefcase className="w-3 h-3 mr-1" />
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {isAdmin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => { setPasswordResetUser({ id: u.id, username: u.username }); setResetPassword(""); }}
                                  data-testid={`button-change-password-mobile-${u.id}`}
                                >
                                  <KeyRound className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                                  Password
                                </Button>
                              )}
                              {canDisableUsers && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={deleteUserMutation.isPending}
                                  onClick={() => handleDelete(u.id)}
                                  className="text-destructive"
                                  data-testid={`button-delete-user-mobile-${u.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                                  {t("userManagement.deleteUser")}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!passwordResetUser} onOpenChange={(open) => { if (!open) setPasswordResetUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password for {passwordResetUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="New password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              data-testid="input-reset-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordResetUser(null)} data-testid="button-cancel-password-reset">
              Cancel
            </Button>
            <Button
              disabled={!resetPassword.trim() || changePasswordMutation.isPending}
              onClick={() => {
                if (passwordResetUser) {
                  changePasswordMutation.mutate({ id: passwordResetUser.id, password: resetPassword });
                }
              }}
              data-testid="button-confirm-password-reset"
            >
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
