import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldOff, Trash2, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@shared/schema";

export default function UserManagement() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/users"],
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

  if (error && (error as Error).message?.includes("403")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShieldAlert className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-lg font-medium" data-testid="text-access-denied">{t("userManagement.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-user-management-title">
          {t("userManagement.title")}
        </h1>
        <p className="text-muted-foreground">{t("userManagement.subtitle")}</p>
      </div>

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
                          <TableCell className="text-muted-foreground text-sm">
                            {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                          </TableCell>
                          <TableCell className="text-right rtl:text-left">
                            {isCurrentUser ? null : (
                              <div className="flex items-center gap-2 justify-end rtl:justify-start flex-wrap">
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
                          {t("userManagement.joined")}: {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : "-"}
                        </div>
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2 flex-wrap">
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