import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CreditCard, Check, X, Loader2 } from "lucide-react";

interface TokenOrder {
  id: number;
  clientId: number;
  clientName: string | null;
  requestedBy: number;
  requestedByUsername: string | null;
  tokensRequested: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-status-${status}`}>Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-status-${status}`}>Rejected</Badge>;
    default:
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400" data-testid={`badge-status-${status}`}>Pending</Badge>;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "n/a" : parsed.toLocaleString();
}

export default function AdminTokenOrders() {
  const { toast } = useToast();
  const [resolvingOrder, setResolvingOrder] = useState<TokenOrder | null>(null);
  const [resolveAction, setResolveAction] = useState<"approved" | "rejected" | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const { data, isLoading } = useQuery<TokenOrder[]>({
    queryKey: ["/api/admin/token-orders"],
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: "approved" | "rejected"; adminNote: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/token-orders/${id}`, {
        status,
        adminNote: adminNote.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/token-orders"] });
      toast({ title: "Token order updated" });
      setResolvingOrder(null);
      setResolveAction(null);
      setAdminNote("");
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Update failed", description: error instanceof Error ? error.message : "Please try again." });
    },
  });

  const openResolveDialog = (order: TokenOrder, action: "approved" | "rejected") => {
    setResolvingOrder(order);
    setResolveAction(action);
    setAdminNote("");
  };

  const pendingCount = (data || []).filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-token-orders-title">Token Orders</h1>
        <p className="text-muted-foreground text-sm">Review and resolve client requests for additional daily AI token budget</p>
      </div>

      <Card data-testid="card-token-orders">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            All Orders
            {pendingCount > 0 && (
              <Badge variant="outline" className="ml-2" data-testid="badge-pending-count">{pendingCount} pending</Badge>
            )}
          </CardTitle>
          <CardDescription>Approving a request increases the client's daily token budget by the amount requested.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No token orders yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((order) => (
                  <TableRow key={order.id} data-testid={`row-token-order-${order.id}`}>
                    <TableCell className="font-medium">{order.clientName || `Client #${order.clientId}`}</TableCell>
                    <TableCell>{order.requestedByUsername || `User #${order.requestedBy}`}</TableCell>
                    <TableCell>{order.tokensRequested.toLocaleString()}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{order.note || "—"}</TableCell>
                    <TableCell>{statusBadge(order.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {order.status === "pending" ? (
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openResolveDialog(order, "approved")}
                            data-testid={`button-approve-${order.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openResolveDialog(order, "rejected")}
                            data-testid={`button-reject-${order.id}`}
                          >
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{order.adminNote || "resolved"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!resolvingOrder} onOpenChange={(open) => { if (!open) { setResolvingOrder(null); setResolveAction(null); } }}>
        <DialogContent data-testid="dialog-resolve-token-order">
          <DialogHeader>
            <DialogTitle>{resolveAction === "approved" ? "Approve" : "Reject"} token order</DialogTitle>
            <DialogDescription>
              {resolvingOrder && (
                <>
                  {resolvingOrder.clientName || `Client #${resolvingOrder.clientId}`} requested {resolvingOrder.tokensRequested.toLocaleString()} tokens.
                  {resolveAction === "approved" && " Approving will add this to their daily token budget."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Optional note for the client..."
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            data-testid="input-admin-note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolvingOrder(null); setResolveAction(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!resolvingOrder || !resolveAction) return;
                resolveMutation.mutate({ id: resolvingOrder.id, status: resolveAction, adminNote });
              }}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {resolveAction === "approved" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
