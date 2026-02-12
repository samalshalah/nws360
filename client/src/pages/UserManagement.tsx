import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
import { Shield, ShieldOff, Trash2, UserPlus, Users, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@shared/schema";

export default function UserManagement() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("client");

  const { data: users, isLoading } = useQuery<(User & { parentId?: number | null })[]>({
    queryKey: ["/api/users"],
  });

  const { data: usage } = useQuery<{ plan: string; seats: { used: number; max: number } }>({
    queryKey: ["/api/subscription/usage"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; role: string }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("userManagement.userCreated") });
      setNewUsername("");
      setNewPassword("");
      setNewRole("client");
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

  const handleDelete = (id: number) => {
    if (window.confirm(t("userManagement.confirmDelete"))) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    createUserMutation.mutate({ username: newUsername.trim(), password: newPassword, role: newRole });
  };

  const getParentUsername = (parentId: number | null | undefined) => {
    if (!parentId || !users) return "-";
    const parent = users.find(u => u.id === parentId);
    return parent ? parent.username : "-";
  };

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

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t("userManagement.createUser")}
          </CardTitle>
          <CardDescription>{t("userManagement.createUserSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="flex flex-col sm:flex-row items-end gap-3 flex-wrap" data-testid="form-create-user">
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
            {currentUser?.role === "admin" && (
              <div className="min-w-[140px] space-y-1">
                <label className="text-sm text-muted-foreground">{t("userManagement.role")}</label>
                <Select value={newRole} onValueChange={setNewRole} data-testid="select-new-role">
                  <SelectTrigger data-testid="select-trigger-new-role">
                    <SelectValue placeholder={t("userManagement.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client" data-testid="select-item-client">{t("userManagement.client")}</SelectItem>
                    <SelectItem value="admin" data-testid="select-item-admin">{t("userManagement.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={createUserMutation.isPending || !newUsername.trim() || !newPassword.trim()} data-testid="button-create-user">
              <UserPlus className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              {createUserMutation.isPending ? t("userManagement.creating") : t("userManagement.createUser")}
            </Button>
          </form>
        </CardContent>
      </Card>

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
                      <TableHead>{t("userManagement.parent")}</TableHead>
                      <TableHead>{t("userManagement.joined")}</TableHead>
                      <TableHead className="text-right rtl:text-left">{t("userManagement.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isCurrentUser = currentUser?.id === u.id;
                      return (
                        <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                          <TableCell className="font-medium">
                            {u.username}
                            {isCurrentUser && (
                              <span className="text-muted-foreground text-xs ml-2 rtl:ml-0 rtl:mr-2">{t("userManagement.you")}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} data-testid={`badge-role-${u.id}`}>
                              {u.role === "admin" ? t("userManagement.admin") : t("userManagement.client")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm" data-testid={`text-parent-${u.id}`}>
                            {getParentUsername(u.parentId)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                          </TableCell>
                          <TableCell className="text-right rtl:text-left">
                            {isCurrentUser ? null : (
                              <div className="flex items-center gap-2 justify-end rtl:justify-start flex-wrap">
                                {currentUser?.role === "admin" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={updateRoleMutation.isPending}
                                    onClick={() => updateRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "client" : "admin" })}
                                    data-testid={`button-toggle-role-${u.id}`}
                                  >
                                    {u.role === "admin" ? (
                                      <><ShieldOff className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />{t("userManagement.makeClient")}</>
                                    ) : (
                                      <><Shield className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />{t("userManagement.makeAdmin")}</>
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={deleteUserMutation.isPending}
                                  onClick={() => handleDelete(u.id)}
                                  className="text-destructive"
                                  data-testid={`button-delete-user-${u.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                                  {t("userManagement.deleteUser")}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {users.map((u) => {
                  const isCurrentUser = currentUser?.id === u.id;
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
                          <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                            {u.role === "admin" ? t("userManagement.admin") : t("userManagement.client")}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("userManagement.parent")}: {getParentUsername(u.parentId)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("userManagement.joined")}: {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                        </div>
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {currentUser?.role === "admin" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updateRoleMutation.isPending}
                                onClick={() => updateRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "client" : "admin" })}
                                data-testid={`button-toggle-role-mobile-${u.id}`}
                              >
                                {u.role === "admin" ? (
                                  <><ShieldOff className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />{t("userManagement.makeClient")}</>
                                ) : (
                                  <><Shield className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />{t("userManagement.makeAdmin")}</>
                                )}
                              </Button>
                            )}
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
    </div>
  );
}