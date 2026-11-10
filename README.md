# Grade 12 Model Exam Platform

Timed model exams for Ethiopian grade 12 students. React + Vite + TypeScript frontend,
Supabase backend. All rules (timing, grading, one attempt, bans) are enforced in Postgres.

## Development setup (cloud dev project, no Docker)

Development runs against a **cloud Supabase dev project**. There is no local Supabase
stack and Docker is not required.

```powershell
npm install
npx supabase login
npx supabase link --project-ref <DEV_PROJECT_REF>
npm run db:push                    # apply supabase/migrations to the linked project
copy .env.example .env.local       # then fill in URL + anon key (Project Settings → API)
npm run db:types                   # regenerate src/lib/database.types.ts from the linked project
npm run dev                        # http://localhost:5173
```

### Scripts

| Command | What it does |
|---|---|
| `npm run db:new <name>` | Create a new empty migration file |
| `npm run db:push` | `supabase db push --remote`: apply pending migrations to the linked project |
| `npm run db:status` | Compare local migration files with the linked project's history |
| `npm run db:types` | Regenerate TypeScript types from the linked project |
| `npm run db:test:remote` | Run the pgTAP tests in `supabase/tests/` on the linked project **without Docker**. Each file runs in one transaction that always aborts, so nothing is committed. Prints failed assertions by name. Dev project only. |
| `npm run db:test` | `supabase test db --remote` (same tests, but the CLI needs Docker for this) |
| `npm run fn:deploy` | Deploy the Edge Functions in `supabase/functions/` (bundled server-side, no Docker) |
| `npm run typecheck` | `tsc -b` (strict) |

Rules:
- Schema changes are **only** made as migration files in `supabase/migrations/`, then
  `db:push`. Never edit tables, policies or functions in the dashboard.
- After every push, run `db:types` and commit the regenerated types.
- `supabase/seed.sql` is **not** applied by `db push`. It is only useful for a local
  stack. On the cloud dev project, create test data through the app.

### Auto-submit job

`pg_cron` runs `private.auto_submit_expired()` every minute (job
`auto-submit-expired-attempts`). It closes and grades attempts more than 30 s past their
deadline. To check it in the SQL Editor:

```sql
select * from cron.job where jobname = 'auto-submit-expired-attempts';
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

### Live leaderboard (Realtime)

When an attempt is submitted or re-graded, a trigger calls `realtime.send` on the public
broadcast channel `leaderboard:<exam_id>`. The message contains only the exam id. Clients
then re-fetch through `get_leaderboard()`, which checks permissions and never returns user
ids. This needs **Realtime → Settings → "Allow public access"** to stay enabled (the
default). If Realtime is unavailable, the page falls back to refreshing every minute and
shows "Updates every minute" instead of "Live".

`realtime.send` stores broadcasts in `realtime.messages`, which the Realtime service
partitions by day. On a project where no client has connected to Realtime yet, those
partitions don't exist, and the send fails silently (the trigger never blocks a submit).
The `04_results_leaderboard` test "submitting broadcasts…" fails until then. Open any
leaderboard page once, then re-run the tests.

### Edge Functions

`admin-ban` bans or unbans a student. It calls `admin_set_ban()` with the **admin's own
token** (Postgres checks `is_admin()`, sets `is_banned`, closes any exam in progress and
writes the audit log), then bans the auth user with the service role key (blocks sign-in
and token refresh). The service role key exists only inside the function. Hosted projects
inject `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` automatically,
so there are no secrets to set. `verify_jwt` is off in `supabase/config.toml` because the
function verifies the caller itself (`auth.getUser`). Deploy with `npm run fn:deploy`.

### Test users (dev project)

Telegram can't redirect to `localhost`, so `npm run dev` shows an email/password form when
`VITE_ENABLE_DEV_LOGIN=true`.

1. Dashboard → **Authentication → Users → Add user** (auto-confirm), e.g.
   `admin@test.com` and `student@test.com`.
2. Promote the admin in the **SQL Editor** (runs as `postgres`, so the role guard allows it):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'admin@test.com');
   ```
3. Sign in as the student. You'll be sent to profile completion first.

Ban / unban test users from **Admin → Students → (student) → Ban**. That goes through the
`admin-ban` Edge Function, so the auth user is banned too.

### Dev vs production

The dev project keeps the **Email** provider on for these test users. The production
project must have Email **off** and only Telegram on. See
[docs/telegram-setup.md](docs/telegram-setup.md). The dev login form is also compiled out
of production builds, and `VITE_ENABLE_DEV_LOGIN` must never be set on Vercel.

## Layout

- `supabase/migrations/`: the only way the schema changes
- `supabase/tests/`: pgTAP tests proving what students cannot do
- `src/auth/`: session, profile, route guards (UX only; the DB is the security boundary)
- `src/features/`: feature modules (exams, exam room, results…)
- `src/i18n/locales/{en,am}`: UI text (Amharic placeholder)
