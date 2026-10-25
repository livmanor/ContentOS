import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Link2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Building2,
  User,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SafeSocialAccount } from "@/lib/social/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectionsToastHandler } from "./toast-handler";
import { DisconnectButton } from "./disconnect-button";

function getTokenStatus(
  platform: string,
  tokenExpiresAt: string | null
): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: typeof CheckCircle2;
  detail?: string;
} {
  // Meta Page access tokens generated via long-lived user tokens do not expire
  if (platform === "facebook" || platform === "instagram" || !tokenExpiresAt) {
    return {
      label: "Healthy",
      variant: "default",
      icon: CheckCircle2,
      detail: "Permanent token",
    };
  }

  const expiresTime = new Date(tokenExpiresAt).getTime();
  const now = Date.now();
  const diffMs = expiresTime - now;

  if (diffMs <= 0) {
    return {
      label: "Expired",
      variant: "destructive",
      icon: AlertCircle,
      detail: "Re-authentication required",
    };
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    const hours = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
    return {
      label: `Expires in ${hours}h`,
      variant: "secondary",
      icon: Clock,
      detail: "Expiring today",
    };
  }

  if (days <= 7) {
    return {
      label: `Expires in ${days}d`,
      variant: "secondary",
      icon: Clock,
      detail: `Expires in ${days} days`,
    };
  }

  return {
    label: "Healthy",
    variant: "default",
    icon: CheckCircle2,
    detail: `Valid for ${days} days`,
  };
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "facebook") {
    return (
      <svg className="h-5 w-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }

  if (platform === "instagram") {
    return (
      <svg className="h-5 w-5 text-[#E4405F]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    );
  }

  if (platform === "linkedin") {
    return (
      <svg className="h-5 w-5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
      </svg>
    );
  }

  // X (formerly Twitter)
  return (
    <svg className="h-5 w-5 text-foreground" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Resolve user workspace
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let accounts: SafeSocialAccount[] = [];

  if (workspace) {
    // Non-token columns only (never select access_token_enc or refresh_token_enc)
    const { data } = await supabase
      .from("social_accounts")
      .select(
        "id, workspace_id, platform, external_id, display_name, avatar_url, token_expires_at, meta, created_at"
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });

    if (data) {
      accounts = data as SafeSocialAccount[];
    }
  }

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      <Suspense fallback={null}>
        <ConnectionsToastHandler />
      </Suspense>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Link2 className="h-7 w-7 text-primary" />
            Social Connections
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your official social accounts to automate scheduling, publishing, and analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border border-border/50">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>OAuth 2.0 with AES-256 encrypted tokens at rest</span>
        </div>
      </div>

      {/* Connect Buttons Section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground tracking-tight">
          Connect New Platforms
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Meta (Facebook + Instagram) */}
          <Card className="border-border hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
                  <PlatformIcon platform="facebook" />
                </div>
                <div>
                  <CardTitle className="text-base">Facebook + Instagram</CardTitle>
                  <CardDescription className="text-xs">
                    Meta Graph API v21.0
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              <p className="text-xs text-muted-foreground">
                Connect your Facebook Pages and linked Instagram Business accounts with permanent page tokens.
              </p>
              <Link
                href="/api/oauth/meta/start"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Connect Facebook + Instagram
              </Link>
            </CardContent>
          </Card>

          {/* LinkedIn */}
          <Card className="border-border hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-[#0A66C2]/10 flex items-center justify-center">
                  <PlatformIcon platform="linkedin" />
                </div>
                <div>
                  <CardTitle className="text-base">LinkedIn</CardTitle>
                  <CardDescription className="text-xs">
                    Member profile & Company Pages
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              <p className="text-xs text-muted-foreground">
                Publish to your personal profile or administered company pages with automatic token refresh.
              </p>
              <Link
                href="/api/oauth/linkedin/start"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Connect LinkedIn
              </Link>
            </CardContent>
          </Card>

          {/* X */}
          <Card className="border-border hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <PlatformIcon platform="x" />
                </div>
                <div>
                  <CardTitle className="text-base">X (Twitter)</CardTitle>
                  <CardDescription className="text-xs">
                    API v2 OAuth 2.0 PKCE
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              <p className="text-xs text-muted-foreground">
                Connect your X account securely via PKCE with automatic refresh token rotation.
              </p>
              <Link
                href="/api/oauth/x/start"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Connect X
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Connected Accounts Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Connected Accounts ({accounts.length})
          </h2>
        </div>

        {accounts.length === 0 ? (
          <Card className="border-dashed border-2 border-border/80 bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Link2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">No accounts connected yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Click on one of the connect options above to connect your Meta, LinkedIn, or X accounts.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => {
              const status = getTokenStatus(account.platform, account.token_expires_at);
              const StatusIcon = status.icon;
              const isOrg = account.meta?.type === "organization";
              const orgsAccessDenied = Boolean(account.meta?.orgs_access_denied);

              return (
                <Card
                  key={account.id}
                  className="border-border shadow-sm flex flex-col justify-between overflow-hidden"
                >
                  <CardHeader className="p-4 pb-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {/* Avatar / Icon */}
                        {account.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={account.avatar_url}
                            alt={account.display_name || account.platform}
                            className="h-11 w-11 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold border border-border">
                            {account.display_name?.charAt(0).toUpperCase() || (
                              <PlatformIcon platform={account.platform} />
                            )}
                          </div>
                        )}

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate block" title={account.display_name || ""}>
                              {account.display_name || "Unnamed Account"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <PlatformIcon platform={account.platform} />
                            <span className="text-xs text-muted-foreground capitalize">
                              {account.platform}
                            </span>
                            {isOrg && (
                              <span className="inline-flex items-center text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.2 rounded font-medium">
                                <Building2 className="h-2.5 w-2.5 mr-0.5" />
                                Page
                              </span>
                            )}
                            {account.meta?.type === "member" && (
                              <span className="inline-flex items-center text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.2 rounded font-medium">
                                <User className="h-2.5 w-2.5 mr-0.5" />
                                Profile
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <Badge variant={status.variant} className="text-[11px] gap-1 shrink-0">
                        <StatusIcon className="h-3 w-3" />
                        <span>{status.label}</span>
                      </Badge>
                    </div>

                    {/* LinkedIn Organization Access Note if applicable */}
                    {orgsAccessDenied && (
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-md border border-amber-500/20">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>Company pages require LinkedIn Community Management approval.</span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-0">
                    <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
                      <span className="text-[11px] text-muted-foreground" title={status.detail}>
                        {status.detail}
                      </span>
                      <DisconnectButton
                        accountId={account.id}
                        displayName={account.display_name}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
