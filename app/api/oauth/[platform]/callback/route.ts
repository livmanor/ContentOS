import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { exchangeMetaTokens, fetchMetaPages } from "@/lib/social/meta";
import {
  exchangeLinkedInCode,
  fetchLinkedInOrganizations,
  fetchLinkedInProfile,
} from "@/lib/social/linkedin";
import { exchangeXCode, fetchXUser } from "@/lib/social/x";

function getAppUrl(): string {
  const envUrl = process.env.APP_URL || "http://localhost:3000";
  return envUrl.replace(/\/+$/, "");
}

function createErrorRedirect(
  appUrl: string,
  platform: string,
  message: string,
  cookieNamesToClear: string[]
): NextResponse {
  const response = NextResponse.redirect(
    `${appUrl}/connections?error=${encodeURIComponent(message)}`
  );
  cookieNamesToClear.forEach((name) => response.cookies.delete(name));
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const appUrl = getAppUrl();
  const stateCookieName = `oauth_state_${platform}`;
  const cookiesToClear = [stateCookieName, "oauth_verifier_x"];

  if (!["meta", "linkedin", "x"].includes(platform)) {
    return createErrorRedirect(
      appUrl,
      platform,
      `Unsupported platform: ${platform}`,
      cookiesToClear
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError =
    searchParams.get("error_description") ||
    searchParams.get("error_message") ||
    searchParams.get("error");

  if (oauthError) {
    return createErrorRedirect(
      appUrl,
      platform,
      `OAuth error from ${platform}: ${oauthError}`,
      cookiesToClear
    );
  }

  if (!code || !state) {
    return createErrorRedirect(
      appUrl,
      platform,
      "Missing code or state parameter in OAuth callback",
      cookiesToClear
    );
  }

  // 1. Verify state cookie
  const cookieStore = await cookies();
  const savedState = cookieStore.get(stateCookieName)?.value;

  if (!savedState || savedState !== state) {
    return createErrorRedirect(
      appUrl,
      platform,
      "Invalid or expired OAuth state parameter. Please try connecting again.",
      cookiesToClear
    );
  }

  // 2. Require a logged-in user and resolve their workspace_id
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return createErrorRedirect(
      appUrl,
      platform,
      "Your session has expired. Please log in and try again.",
      cookiesToClear
    );
  }

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!workspace || wsError) {
    return createErrorRedirect(
      appUrl,
      platform,
      "No workspace found for your account. Please create a workspace first.",
      cookiesToClear
    );
  }

  const redirectUri = `${appUrl}/api/oauth/${platform}/callback`;

  try {
    if (platform === "meta") {
      // 1. Exchange code for short-lived -> long-lived token
      const { longLivedToken } = await exchangeMetaTokens(code, redirectUri);

      // 2. Call /me/accounts to fetch Facebook Pages and connected Instagram accounts
      const pages = await fetchMetaPages(longLivedToken);

      if (!pages || pages.length === 0) {
        return createErrorRedirect(
          appUrl,
          platform,
          "No Facebook Pages found. You must be an administrator or editor of at least one Facebook Page.",
          cookiesToClear
        );
      }

      for (const page of pages) {
        // Upsert Facebook Page row
        const fbPayload = {
          workspace_id: workspace.id,
          platform: "facebook" as const,
          external_id: page.id,
          display_name: page.name,
          avatar_url: page.picture?.data?.url || null,
          access_token_enc: encrypt(page.access_token),
          refresh_token_enc: null,
          token_expires_at: null, // Meta page tokens from long-lived user tokens do not expire
          meta: {},
        };

        const { error: fbError } = await supabase
          .from("social_accounts")
          .upsert(fbPayload, {
            onConflict: "workspace_id,platform,external_id",
          });

        if (fbError) {
          throw new Error(`Failed to save Facebook Page: ${fbError.message}`);
        }

        // If the Page has an Instagram business account, upsert second row
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          const igPayload = {
            workspace_id: workspace.id,
            platform: "instagram" as const,
            external_id: ig.id,
            display_name: ig.username || page.name,
            avatar_url: ig.profile_picture_url || null,
            access_token_enc: encrypt(page.access_token), // Same Page access token used for IG publishing
            refresh_token_enc: null,
            token_expires_at: null,
            meta: {
              page_id: page.id,
              page_name: page.name,
            },
          };

          const { error: igError } = await supabase
            .from("social_accounts")
            .upsert(igPayload, {
              onConflict: "workspace_id,platform,external_id",
            });

          if (igError) {
            throw new Error(`Failed to save Instagram account: ${igError.message}`);
          }
        }
      }
    } else if (platform === "linkedin") {
      // 1. Exchange code at https://www.linkedin.com/oauth/v2/accessToken
      const {
        accessToken,
        refreshToken,
        expiresIn,
      } = await exchangeLinkedInCode(code, redirectUri);

      const tokenExpiresAt = new Date(
        Date.now() + expiresIn * 1000
      ).toISOString();

      const accessTokenEnc = encrypt(accessToken);
      const refreshTokenEnc = refreshToken ? encrypt(refreshToken) : null;

      // 2. Fetch member profile via /v2/userinfo
      const profile = await fetchLinkedInProfile(accessToken);
      const memberUrn = `urn:li:person:${profile.sub}`;

      // 3. Try fetching administered organizations
      const {
        organizations,
        accessDenied: orgsAccessDenied,
      } = await fetchLinkedInOrganizations(accessToken);

      const memberMeta: Record<string, any> = {
        author_urn: memberUrn,
        type: "member",
        sub: profile.sub,
        email: profile.email,
        orgs_access_denied: orgsAccessDenied,
      };

      const memberPayload = {
        workspace_id: workspace.id,
        platform: "linkedin" as const,
        external_id: memberUrn,
        display_name: profile.name,
        avatar_url: profile.picture || null,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_expires_at: tokenExpiresAt,
        meta: memberMeta,
      };

      const { error: memberError } = await supabase
        .from("social_accounts")
        .upsert(memberPayload, {
          onConflict: "workspace_id,platform,external_id",
        });

      if (memberError) {
        throw new Error(
          `Failed to save LinkedIn member account: ${memberError.message}`
        );
      }

      // If administered organizations were fetched, upsert each
      for (const org of organizations) {
        const orgUrn = `urn:li:organization:${org.id}`;
        const orgPayload = {
          workspace_id: workspace.id,
          platform: "linkedin" as const,
          external_id: orgUrn,
          display_name: org.name,
          avatar_url: org.logoUrl || null,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          token_expires_at: tokenExpiresAt,
          meta: {
            author_urn: orgUrn,
            type: "organization",
            org_id: org.id,
          },
        };

        const { error: orgError } = await supabase
          .from("social_accounts")
          .upsert(orgPayload, {
            onConflict: "workspace_id,platform,external_id",
          });

        if (orgError) {
          throw new Error(
            `Failed to save LinkedIn organization ${org.name}: ${orgError.message}`
          );
        }
      }
    } else if (platform === "x") {
      // 1. Retrieve PKCE code_verifier
      const codeVerifier = cookieStore.get("oauth_verifier_x")?.value;
      if (!codeVerifier) {
        return createErrorRedirect(
          appUrl,
          platform,
          "Missing PKCE code verifier cookie. Please try connecting again.",
          cookiesToClear
        );
      }

      // 2. Exchange code with Basic auth & PKCE
      const {
        accessToken,
        refreshToken,
        expiresIn,
      } = await exchangeXCode(code, redirectUri, codeVerifier);

      const tokenExpiresAt = new Date(
        Date.now() + expiresIn * 1000
      ).toISOString();

      const accessTokenEnc = encrypt(accessToken);
      // X refresh tokens rotate on each refresh: store encrypted
      const refreshTokenEnc = encrypt(refreshToken);

      // 3. Fetch user profile
      const userProfile = await fetchXUser(accessToken);

      const xPayload = {
        workspace_id: workspace.id,
        platform: "x" as const,
        external_id: userProfile.id,
        display_name: `@${userProfile.username}`,
        avatar_url: userProfile.profile_image_url || null,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_expires_at: tokenExpiresAt,
        meta: {
          username: userProfile.username,
          name: userProfile.name,
        },
      };

      const { error: xError } = await supabase
        .from("social_accounts")
        .upsert(xPayload, {
          onConflict: "workspace_id,platform,external_id",
        });

      if (xError) {
        throw new Error(`Failed to save X account: ${xError.message}`);
      }
    }

    // Success redirect
    const successResponse = NextResponse.redirect(
      `${appUrl}/connections?connected=${encodeURIComponent(platform)}`
    );
    cookiesToClear.forEach((name) => successResponse.cookies.delete(name));
    return successResponse;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to complete OAuth connection";
    return createErrorRedirect(appUrl, platform, message, cookiesToClear);
  }
}
