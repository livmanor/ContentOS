import { LINKEDIN_SCOPES } from "./constants";

export interface LinkedInProfile {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
}

export interface LinkedInOrganization {
  id: string;
  name: string;
  vanityName?: string;
  logoUrl?: string;
}

export function getLinkedInAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    throw new Error("LINKEDIN_CLIENT_ID environment variable is missing");
  }

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));

  return url.toString();
}

export async function exchangeLinkedInCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  refreshTokenExpiresIn?: number;
}> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET is missing");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      data.error_description || data.error || "Failed to exchange LinkedIn authorization code"
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
}

export async function fetchLinkedInProfile(
  accessToken: string
): Promise<LinkedInProfile> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();

  if (!res.ok || !data.sub) {
    throw new Error(data.message || "Failed to fetch LinkedIn user profile");
  }

  return {
    sub: data.sub,
    name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim() || "LinkedIn User",
    given_name: data.given_name,
    family_name: data.family_name,
    picture: data.picture,
    email: data.email,
  };
}

export async function fetchLinkedInOrganizations(
  accessToken: string
): Promise<{ organizations: LinkedInOrganization[]; accessDenied: boolean }> {
  try {
    const res = await fetch(
      "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    if (res.status === 403 || res.status === 401) {
      // Access denied / product not approved on LinkedIn App
      return { organizations: [], accessDenied: true };
    }

    if (!res.ok) {
      return { organizations: [], accessDenied: true };
    }

    const data = await res.json();
    const elements = data.elements || [];

    const organizations: LinkedInOrganization[] = [];

    for (const elem of elements) {
      if (elem.state !== "APPROVED" && elem.state !== undefined) {
        continue;
      }

      const orgUrn: string = elem.organization || "";
      const orgId = orgUrn.replace("urn:li:organization:", "").trim();
      if (!orgId) continue;

      let orgName = `Organization (${orgId})`;
      let logoUrl: string | undefined;

      // Try fetching details for org
      try {
        const detailRes = await fetch(
          `https://api.linkedin.com/v2/organizations/${orgId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          orgName = detail.localizedName || detail.vanityName || orgName;
        }
      } catch {
        // Silently use fallback name
      }

      organizations.push({
        id: orgId,
        name: orgName,
        logoUrl,
      });
    }

    return { organizations, accessDenied: false };
  } catch {
    return { organizations: [], accessDenied: true };
  }
}

export async function refreshLinkedInToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET is missing");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      data.error_description || data.error || "Failed to refresh LinkedIn token"
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}
