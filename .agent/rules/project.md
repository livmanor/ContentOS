---
trigger: always_on
---

# social-autopilot: always follow

## Stack (do not substitute any library)
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase: Postgres, Auth, Storage (@supabase/supabase-js, @supabase/ssr)
- AI: Gemini API via @google/genai, structured JSON output validated with zod
- Calendar: FullCalendar (react, core, daygrid, timegrid, list, interaction)
- Charts: recharts
- Scheduler: Supabase pg_cron + pg_net calling /api/cron/publish every minute
- Publishing: Meta Graph API (Facebook Pages, Instagram), LinkedIn Posts API, X API v2

## Rules
1. NEVER publish a post unless posts.status = 'approved' AND scheduled_at <= now().
2. Secrets only in .env.local. Keep .env.example updated. Never expose secrets to client code.
3. Encrypt social access/refresh tokens at rest (AES-256-GCM, key = env TOKEN_ENC_KEY).
4. Every AI call returns JSON validated with zod; retry once on invalid JSON.
5. Every table has workspace_id (or owner_id) with Supabase RLS enabled.
6. Build ONLY the module requested. No extra features, pages or dependencies.
7. All schema changes go in /supabase/migrations as numbered .sql files.
8. After each module: list files created and give manual test steps.
9. Official platform APIs only. No scraping.

## Folder layout
/app, /components, /lib/supabase, /lib/ai, /lib/crypto, /lib/social, /supabase/migrations