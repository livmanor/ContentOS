export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "x";

export interface SocialAccount {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  external_id: string;
  display_name: string | null;
  avatar_url: string | null;
  access_token_enc?: string;
  refresh_token_enc?: string | null;
  token_expires_at: string | null;
  meta: Record<string, any>;
  created_at: string;
}

export type SafeSocialAccount = Omit<
  SocialAccount,
  "access_token_enc" | "refresh_token_enc"
>;

export interface TokenRefreshResult {
  refreshed: boolean;
  account?: SocialAccount;
  error?: string;
}
