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
     can't be added, extended or reopened (enforce in the DB, not only the UI). Extending
     or reopening a window BEFORE release is allowed (it simply moves the release time).
   - **Re-exams after release (Phase 5): "Create re-exam"** makes a NEW exam that copies
     the original's questions and answer keys, with the question order shuffled and each
     question's option order shuffled (answer keys remapped to the new letters). It is
     restricted to the approved students (restricted window + `window_allowed_users`),
     starts as a draft that the admin can edit before publishing, and has its own separate
     results and leaderboard. It never changes the original exam or its leaderboard.
4. **Server clock only.** Use `now()` / `clock_timestamp()` for every time check. Store UTC,
   display East Africa Time (`Africa/Addis_Ababa`, UTC+3). Admin datetime inputs are EAT.
   In React, any time-based decision or countdown uses `useServerClock` / `useServerNow`
   (`src/features/exam-room/useServerClock.ts`), never `Date.now()` directly. Device clocks
   can be hours off; one dev machine was 11 h fast, which silently blocked publishing.
5. **Service role key only inside Edge Functions.** Never in frontend code or `VITE_*` vars.
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
- `attempts.deadline_at` / `started_at` are set by trigger and immutable afterwards.
- After pushing: `npm run db:types` and commit `src/lib/database.types.ts`.
- Tests: pgTAP in `supabase/tests/`, one file per area, each in a rolled-back transaction.
  Test fixtures must not depend on or count seed data.

## Frontend conventions

- All UI text goes through i18next (`src/i18n/locales/en/common.json`; `am` is reserved).
- Every page has loading, empty and error states (`src/components/states`).
- Confirm every destructive action (`useConfirm`).
- Route guards in `src/auth/guards.tsx` are UX only.

## Commands

`npm run dev` · `npm run typecheck` · `npm run build` · `npm run db:push` ·
`npm run db:types` · `npm run db:test` · `npm run db:status`
