# Grade 12 Model Exam Platform

Timed model exams for Ethiopian grade 12 students. React + Vite + TypeScript (strict),
Tailwind v4 + shadcn-style components, React Router, TanStack Query, react-i18next.
Backend: Supabase (Postgres, Auth, RLS, RPC, pg_cron, Realtime, Storage, Edge Functions).
Development runs against the cloud dev project (no Docker). See README.md for setup.

## Non-negotiable rules

1. **Never trust the browser.** Timing, grading, the one-attempt rule, bans and result
   visibility are enforced in Postgres (RLS, column grants, `security definer` RPCs).
   React code only mirrors them for UX.
2. **Correct answers never reach a student before results are released.** They live in
   `answer_keys`, which no API role can read. Admins read them only through admin RPCs.
3. **Results are hidden until the exam is closed.** "Closed" means EVERY window of the
   exam has ended, including reopen and restricted windows (`private.results_released`).
   Before that, a student gets no score, percentage, rank, total, time taken, per-question
   right/wrong, correct answers or leaderboard rows: not their own, not anyone else's,
   by any route (RPC, direct table read, dashboard, Realtime payload). They may see only
   that they submitted (submitted at / auto-submitted) and when results will be published
   (`private.results_release_at`). **Admins can see everything at any time.**
   - Any new RPC or view that touches `attempts.score`, `max_score`, `private.leaderboard`
     or `answer_keys` must check `public.is_admin() or private.results_released(exam_id)`.
   - Students have no SELECT on `attempts.score` / `attempts.max_score` (column grants).
     Don't re-grant them.
   - Realtime messages carry ids only, never scores.
   - Add a pgTAP assertion to `supabase/tests/05_results_hidden.test.sql` for any new path.
   - **Once released, results are never hidden again.** After release, an exam's windows
     can't be added, extended or reopened, and no retake can be granted. Enforced by
     `private.require_unreleased()` in the RPCs, plus the `exam_windows_guard_release`
     trigger as a backstop (it blocks any window insert/update on a published exam whose
     windows have all ended and that has submitted attempts). Extending a window or adding
     one (optionally restricted via `window_allowed_users`) BEFORE release is allowed; it
     simply moves the release time.
   - **Re-exams after release: "Create re-exam"** (`admin_create_reexam`, or approving a
     request) makes a NEW exam (`exams.reexam_of` = the ORIGINAL exam, never another
     re-exam). It copies the questions in shuffled order, with each question's options
     shuffled and its answer key remapped. It starts as an editable draft and has its own
     results and leaderboard. Only students in `reexam_students` can see or start it
     (exams RLS, `private.can_access_exam`, `student_dashboard`, and the
     `attempts_reexam_guard` trigger). It never changes the original exam.
4. **Server clock only.** Use `now()` / `clock_timestamp()` for every time check. Store UTC,
   display East Africa Time (`Africa/Addis_Ababa`, UTC+3). Admin datetime inputs are EAT.
   In React, any time-based decision or countdown uses `useServerClock` / `useServerNow`
   (`src/features/exam-room/useServerClock.ts`), never `Date.now()` directly. Device clocks
   can be hours off; one dev machine was 11 h fast, which silently blocked publishing.
5. **Service role key only inside Edge Functions.** Never in frontend code or `VITE_*` vars.
   An Edge Function that changes app data calls the database RPC with the CALLER's token
   first (so Postgres checks `is_admin()` and writes the audit log), and only then uses the
   service role for auth-level work. See `supabase/functions/admin-ban`.
6. **Mobile-first, slow data.** Lazy-load non-student routes, keep payloads small, no heavy
   animations or images.

## Database conventions

- Every schema change is a new file in `supabase/migrations/`. Never edit a migration that
  has been pushed (check `npm run db:status`); write a follow-up migration instead.
- Deny by default: new tables get RLS enabled, and the `postgres` default privileges
  already revoke table and function access from `anon` / `authenticated`. Grant
  explicitly and minimally.
- Internal helpers go in the `private` schema (not exposed by the API). Public RPCs are
  `security definer`, `set search_path = ''`, check `private.require_admin()` or
  `private.require_active_student()` first, and get an explicit `grant execute ... to authenticated`.
- Student-facing errors: `raise exception '<code>' using errcode = 'P0001'`, where `<code>`
  is listed in `STUDENT_ERROR_CODES` (`src/features/exam-room/types.ts`) and translated
  under `errors.<code>` in the locale files.
- `attempts.deadline_at` / `started_at` are set by trigger and immutable afterwards. The one
  exception is `admin_extend_window`, which may only move an open attempt's deadline later
  (guarded by the `app.window_extension` transaction setting in `attempts_guard_update`).
- **Admin actions are audited.** Every admin RPC that changes students, windows, retakes or
  re-exams calls `private.audit(action, user_id, exam_id, details)`. `admin_audit_log` is
  append-only (admins can SELECT; nobody gets INSERT/UPDATE/DELETE). Add new action names
  to `audit.actions` in the locale file.
- Admin RPC errors are plain readable messages (`private.admin_error`, errcode 55000 /
  22023 / P0002 / 42501). The UI shows `error.message` as-is.
- Bans: `admin_set_ban` closes the student's open attempts, and `require_active_student` /
  `submit_exam` reject a banned user (`banned`). Never ban with a direct UPDATE; use the
  `admin-ban` Edge Function so the auth user is banned too.
- Banned in the UI: go to `/suspended` through `useGoSuspended` / `<GoSuspended />`, which
  refresh the cached profile first (a plain `<Navigate>` loops with the route guard).
- After pushing: `npm run db:types` and commit `src/lib/database.types.ts`.
- Tests: pgTAP in `supabase/tests/`, one file per area, each in a rolled-back transaction.
  Test fixtures must not depend on or count seed data. Run them on the dev project with
  `npm run db:test:remote` (no Docker needed). Write assertions as top-level
  `select ok(...)` / `select is(...)` etc. so that script can report them by name.

## Frontend conventions

- All UI text goes through i18next (`src/i18n/locales/en/common.json`; `am` is reserved).
- Every page has loading, empty and error states (`src/components/states`).
- Confirm every destructive action (`useConfirm`).
- Route guards in `src/auth/guards.tsx` are UX only.

## Commands

`npm run dev` · `npm run typecheck` · `npm run build` · `npm run db:push` ·
`npm run db:types` · `npm run db:test:remote` · `npm run db:status` · `npm run fn:deploy`
