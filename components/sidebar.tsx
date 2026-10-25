"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Link2,
  Palette,
  Calendar as CalendarIcon,
  CheckSquare,
  History,
  BarChart3,
  Sparkles,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const navigationItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Connections", href: "/connections", icon: Link2 },
  { name: "Brand & Assets", href: "/brand", icon: Palette },
  { name: "Calendar", href: "/calendar", icon: CalendarIcon },
  { name: "Review", href: "/review", icon: CheckSquare },
  { name: "Publishing Log", href: "/publishing-log", icon: History },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();

      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setEmail(user.email);
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user?.email ?? null);
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch {
      // Supabase env keys may not be set in local test environment
    }
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign out";
      toast.error(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <aside className="w-64 border-r border-border bg-sidebar/50 backdrop-blur-sm flex flex-col shrink-0 min-h-screen">
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
        <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="font-semibold text-base tracking-tight text-foreground block">
            ContentOS
          </span>
          <span className="text-xs text-muted-foreground">Social Autopilot</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2.5">
          <div className="min-w-0">
            <p className="font-medium text-foreground">Account</p>
            <p
              className="mt-0.5 text-muted-foreground truncate"
              title={email ?? "Not signed in"}
            >
              {email ?? "Not signed in"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 h-8 text-xs font-normal text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
