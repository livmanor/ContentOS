import { META_API_VERSION, META_SCOPES } from "./constants";

export interface MetaPageItem {
  id: string;
  name: string;
  access_token: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
}

export function getMetaAuthUrl(redirectUri: string, state: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    throw new Error("META_APP_ID environment variable is missing");
  }

  const url = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");

  return url.toString();
}

export async function exchangeMetaTokens(
  code: string,
  redirectUri: string
): Promise<{ longLivedToken: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("META_APP_ID or META_APP_SECRET is missing");
  }

  // 1. Exchange authorization code for short-lived user token
  const tokenUrl = new URL(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
  );
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    throw new Error(
      tokenData.error?.message || "Failed to exchange Meta authorization code"
    );
  }

  const shortLivedToken = tokenData.access_token;
  if (!shortLivedToken) {
    throw new Error("No access_token returned by Meta code exchange");
  }

  // 2. Exchange short-lived token for long-lived user token
  const exchangeUrl = new URL(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
  );
  exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const exchangeRes = await fetch(exchangeUrl.toString());
  const exchangeData = await exchangeRes.json();

  if (!exchangeRes.ok || exchangeData.error) {
    throw new Error(
      exchangeData.error?.message || "Failed to exchange for Meta long-lived token"
    );
  }

  const longLivedToken = exchangeData.access_token;
  if (!longLivedToken) {
    throw new Error("No long-lived access_token returned by Meta exchange");
  }

  return { longLivedToken };
}

export async function fetchMetaPages(
  longLivedToken: string
): Promise<MetaPageItem[]> {
  const accountsUrl = new URL(
    `https://graph.facebook.com/${META_API_VERSION}/me/accounts`
  );
  accountsUrl.searchParams.set(
    "fields",
    "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}"
  );
  accountsUrl.searchParams.set("access_token", longLivedToken);

  const accountsRes = await fetch(accountsUrl.toString());
  const accountsData = await accountsRes.json();

  if (!accountsRes.ok || accountsData.error) {
    throw new Error(
      accountsData.error?.message || "Failed to fetch Facebook Pages from Meta"
    );
  }

  return (accountsData.data as MetaPageItem[]) || [];
}
