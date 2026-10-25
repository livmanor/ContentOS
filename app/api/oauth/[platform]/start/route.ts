import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getMetaAuthUrl } from "@/lib/social/meta";
import { getLinkedInAuthUrl } from "@/lib/social/linkedin";
import { generatePkcePair, getXAuthUrl } from "@/lib/social/x";

function getAppUrl(): string {
  const envUrl = process.env.APP_URL || "http://localhost:3000";
  return envUrl.replace(/\/+$/, "");
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const appUrl = getAppUrl();

  if (!["meta", "linkedin", "x"].includes(platform)) {
    return NextResponse.redirect(
      `${appUrl}/connections?error=${encodeURIComponent(
        `Unsupported platform: ${platform}`
      )}`
    );
  }

  // 1. Require a logged-in user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent(
        "Please sign in before connecting social accounts"
      )}`
    );
  }

  // 2. Resolve their workspace_id
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!workspace || wsError) {
    return NextResponse.redirect(
      `${appUrl}/connections?error=${encodeURIComponent(
        "No workspace found for your account. Please create or join a workspace first."
      )}`
    );
  }

  // 3. Generate random state and store in httpOnly short-lived cookie
  const state = crypto.randomBytes(32).toString("hex");
  const redirectUri = `${appUrl}/api/oauth/${platform}/callback`;

  let authUrl: string;
  let codeVerifier: string | undefined;

  try {
    if (platform === "meta") {
      authUrl = getMetaAuthUrl(redirectUri, state);
    } else if (platform === "linkedin") {
      authUrl = getLinkedInAuthUrl(redirectUri, state);
    } else {
      // X uses PKCE
      const pkce = generatePkcePair();
      codeVerifier = pkce.codeVerifier;
      authUrl = getXAuthUrl(redirectUri, state, pkce.codeChallenge);
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to initiate OAuth";
    return NextResponse.redirect(
      `${appUrl}/connections?error=${encodeURIComponent(message)}`
    );
  }

  const response = NextResponse.redirect(authUrl);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };

  response.cookies.set(`oauth_state_${platform}`, state, cookieOptions);

  if (codeVerifier) {
    response.cookies.set("oauth_verifier_x", codeVerifier, cookieOptions);
  }

  return response;
}
