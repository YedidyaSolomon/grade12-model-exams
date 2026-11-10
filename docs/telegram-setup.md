# Telegram sign-in setup (manual steps)

Students sign in with Telegram through a Supabase **custom OIDC provider**
(`custom:telegram`, issuer `https://oauth.telegram.org`). This only works on the
**cloud** Supabase project: Telegram can't redirect to `127.0.0.1`, so local
development uses the seeded email/password dev login instead (see README).

> Menu names in BotFather and the Supabase dashboard change from time to time. If a
> label below doesn't match exactly, look for the closest equivalent.

## 1. Create the bot (BotFather)

1. In Telegram, open **@BotFather** → `/newbot`. Pick a display name (e.g. *Grade 12
   Model Exams*) and a username ending in `bot`.
2. Save the **bot token**. Sign-in doesn't use it; Phase 6 notifications do. It will be
   stored as an Edge Function secret, **never** in the frontend or in git.
3. Open the bot's settings in BotFather (`/mybots` → your bot → **Bot Settings**) and
   find the **Web Login / OpenID Connect** section.
   - Add the allowed redirect URI:
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - Add your site's domain (your Vercel domain, e.g. `exams.example.com`).
   - Copy the **Client ID** and **Client Secret** it gives you.

## 2. Configure Supabase (cloud project)

**Authentication → Sign In / Providers → Add provider → Custom OIDC**

| Field | Value |
|---|---|
| Identifier | `telegram` (the client calls it `custom:telegram`) |
| Issuer URL | `https://oauth.telegram.org` (discovery is automatic) |
| Client ID / Secret | from BotFather |
| Scopes | `openid profile` |
| Allow users without email (`email_optional`) | **On** (Telegram doesn't share email) |

**Authentication → URL Configuration**

- Site URL: `https://<your-vercel-domain>`
- Redirect URLs: `https://<your-vercel-domain>/auth/callback`
  (add Vercel preview URLs too if you want to test previews, e.g.
  `https://*-<team>.vercel.app/auth/callback`)

**Authentication → Sign In / Providers → Email: turn OFF.**
This is the real switch that disables the dev login in production. The frontend hides
the dev form in production builds too, but that's just UI.

## 3. Apply the database

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push --remote # runs supabase/migrations (NOT seed.sql)
```

## 4. Make yourself admin

Sign in once with Telegram so your profile row exists. Then in **SQL Editor** (runs
as `postgres`, so the role guard allows it):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users order by created_at desc limit 1);
-- or pick the right row by telegram_username
```

## 5. Vercel environment variables

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon / publishable key |

Do **not** set `VITE_ENABLE_DEV_LOGIN` on Vercel, and never add the service role key.

## Troubleshooting

- **"Unsupported provider"**: the provider identifier isn't exactly `telegram`, or the
  provider is disabled.
- **Redirect error at Telegram**: the BotFather redirect URI must exactly equal
  `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
- **Lands on /login again**: `/auth/callback` on your domain is missing from Supabase's
  Redirect URLs.
- **Name or photo missing on the profile**: check the user's `raw_user_meta_data` in
  `auth.users`. The signup trigger reads `full_name|name`, `avatar_url|picture`,
  `preferred_username|user_name`, `provider_id|sub`. Adjust `handle_new_user()` in a
  new migration if Telegram uses different claim names.
