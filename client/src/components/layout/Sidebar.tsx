import { Link, useLocation } from "wouter";
import { LayoutDashboard, Newspaper, BarChart3, Settings, LogOut, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'News Feed', href: '/feed', icon: Newspaper },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Admin', href: '/admin', icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="flex flex-col w-64 border-r border-border bg-card min-h-screen sticky top-0 h-screen">
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-xl shadow-lg shadow-primary/25">
            N
          </div>
          <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
            NWS<span className="text-primary">360</span>
          </h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 translate-x-1"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50">
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-muted-foreground rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
