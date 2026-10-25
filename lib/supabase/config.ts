export function getSupabaseEnv() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url) {
    // Strip trailing /rest/v1 or trailing slashes if accidentally included in env
    url = url.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  }

  return {
    url,
    anonKey,
  };
}
