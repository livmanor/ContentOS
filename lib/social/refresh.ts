import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "../supabase/config";
import { createClient as createServerClient } from "../supabase/server";
import { decrypt, encrypt } from "../crypto";
import { refreshLinkedInToken } from "./linkedin";
import { refreshXToken } from "./x";
import { SocialAccount, TokenRefreshResult } from "./types";

function getServiceClient(): SupabaseClient | null {
  const { url } = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return null;
}

/**
 * Refreshes tokens expiring within 24 hours per platform:
 * - Meta: long-lived page tokens need no refresh.
 * - LinkedIn: exchanges refresh token for new access token.
 * - X: exchanges refresh token for new access and ROTATED refresh token.
 */
export async function refreshIfNeeded(
  account: SocialAccount,
  clientOverride?: SupabaseClient
): Promise<TokenRefreshResult> {
  // Meta page access tokens are permanent / long-lived and need no refresh
  if (account.platform === "facebook" || account.platform === "instagram") {
    return { refreshed: false, account };
  }

  if (!account.token_expires_at) {
    return { refreshed: false, account };
  }

  const expiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  // If token is valid for more than 24 hours, no refresh needed
  if (expiresAt - now > twentyFourHoursMs) {
    return { refreshed: false, account };
  }

  if (!account.refresh_token_enc) {
    return {
      refreshed: false,
      error: `Account ${account.id} (${account.platform}) is expiring soon but has no refresh token`,
    };
  }

  let dbClient: SupabaseClient;
  if (clientOverride) {
    dbClient = clientOverride;
  } else {
    const serviceClient = getServiceClient();
    if (serviceClient) {
      dbClient = serviceClient;
    } else {
      dbClient = (await createServerClient()) as unknown as SupabaseClient;
    }
  }

  try {
    const rawRefreshToken = decrypt(account.refresh_token_enc);

    if (account.platform === "x") {
      const refreshed = await refreshXToken(rawRefreshToken);
      const newAccessTokenEnc = encrypt(refreshed.accessToken);
      // X rotates refresh tokens: save new refresh token immediately
      const newRefreshTokenEnc = encrypt(refreshed.refreshToken);
      const newTokenExpiresAt = new Date(
        Date.now() + refreshed.expiresIn * 1000
      ).toISOString();

      const { data: updated, error: updateError } = await dbClient
        .from("social_accounts")
        .update({
          access_token_enc: newAccessTokenEnc,
          refresh_token_enc: newRefreshTokenEnc,
          token_expires_at: newTokenExpiresAt,
        })
        .eq("id", account.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(
          `Failed to save refreshed X tokens: ${updateError.message}`
        );
      }

      return { refreshed: true, account: updated as SocialAccount };
    }

    if (account.platform === "linkedin") {
      const refreshed = await refreshLinkedInToken(rawRefreshToken);
      const newAccessTokenEnc = encrypt(refreshed.accessToken);
      const newRefreshTokenEnc = refreshed.refreshToken
        ? encrypt(refreshed.refreshToken)
        : account.refresh_token_enc;
      const newTokenExpiresAt = new Date(
        Date.now() + refreshed.expiresIn * 1000
      ).toISOString();

      const { data: updated, error: updateError } = await dbClient
        .from("social_accounts")
        .update({
          access_token_enc: newAccessTokenEnc,
          refresh_token_enc: newRefreshTokenEnc,
          token_expires_at: newTokenExpiresAt,
        })
        .eq("id", account.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(
          `Failed to save refreshed LinkedIn tokens: ${updateError.message}`
        );
      }

      return { refreshed: true, account: updated as SocialAccount };
    }

    return {
      refreshed: false,
      error: `Unsupported platform for refresh: ${account.platform}`,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to refresh token";
    return {
      refreshed: false,
      error: message,
    };
  }
}

/**
 * Finds and refreshes all tokens across workspaces expiring within 24 hours.
 * Exported for scheduler (e.g. cron job).
 */
export async function refreshAllExpiring(): Promise<{
  total: number;
  refreshed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const serviceClient = getServiceClient();
  const dbClient: SupabaseClient = serviceClient
    ? serviceClient
    : (((await createServerClient()) as unknown) as SupabaseClient);

  const thresholdTime = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: expiringAccounts, error } = await dbClient
    .from("social_accounts")
    .select("*")
    .not("token_expires_at", "is", null)
    .lte("token_expires_at", thresholdTime)
    .not("refresh_token_enc", "is", null);

  if (error || !expiringAccounts) {
    return {
      total: 0,
      refreshed: 0,
      errors: [
        {
          id: "query",
          error: error?.message || "Failed to query expiring accounts",
        },
      ],
    };
  }

  let refreshedCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const account of expiringAccounts as SocialAccount[]) {
    const result = await refreshIfNeeded(account, dbClient);
    if (result.refreshed) {
      refreshedCount++;
    } else if (result.error) {
      errors.push({ id: account.id, error: result.error });
    }
  }

  return {
    total: expiringAccounts.length,
    refreshed: refreshedCount,
    errors,
  };
}
