-- Admin exam management. All writes to exams / windows / questions / answer_keys go
-- through these security definer functions; clients have no direct write grants.
--
-- Payload (create_exam / update_exam):
-- {
--   "title": "...", "subject": "...", "stream": "natural|social|both",
--   "duration_minutes": 120, "publish": false, "source_file": null,
--   "window": { "starts_at": "<ISO 8601>", "ends_at": "<ISO 8601>" } | null,
--   "questions": [
--     { "id": "<uuid, optional on update>", "body": "...", "options": ["..","..","..",".."],
--       "correct_option": "A|B|C|D", "points": 1, "image_url": null }
--   ]
-- }
-- Questions are numbered by their order in the array (position 1..n).

-- FORCE RLS (set in 20261109000004) would make the security definer functions below —
-- owned by postgres — see zero answer keys, since the table deliberately has no policies.
-- Clients are still locked out: anon/authenticated have no privileges on the table at all.
alter table public.answer_keys no force row level security;

-- ---------------------------------------------------------------------------
-- Validation: returns a list of human-readable problems (empty = valid).
-- ---------------------------------------------------------------------------
create or replace function private.exam_payload_problems(p jsonb, p_publish boolean)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  problems text[] := '{}';
  w        jsonb;
  ws       timestamptz;
  we       timestamptz;
  dur      integer;
  q        jsonb;
  i        integer;
  pts      text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return array['Payload must be a JSON object'];
  end if;

  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 3 and 200 then
    problems := problems || 'Title must be 3–200 characters'::text;
  end if;
  if char_length(btrim(coalesce(p ->> 'subject', ''))) not between 2 and 80 then
    problems := problems || 'Subject must be 2–80 characters'::text;
  end if;
  if coalesce(p ->> 'stream', '') not in ('natural', 'social', 'both') then
    problems := problems || 'Stream must be natural, social or both'::text;
  end if;
  if coalesce(p ->> 'duration_minutes', '') !~ '^\d{1,4}$' then
    problems := problems || 'Duration must be a whole number of minutes'::text;
  else
    dur := (p ->> 'duration_minutes')::integer;
    if dur not between 1 and 600 then
      problems := problems || 'Duration must be 1–600 minutes'::text;
      dur := null;
    end if;
  end if;

  -- Window
  w := p -> 'window';
  if w is null or jsonb_typeof(w) = 'null' then
    if p_publish then
      problems := problems || 'Publishing requires an exam window (start and end time)'::text;
    end if;
  elsif jsonb_typeof(w) <> 'object' then
    problems := problems || 'Window must be an object'::text;
  else
    begin
      ws := (w ->> 'starts_at')::timestamptz;
      we := (w ->> 'ends_at')::timestamptz;
    exception when others then
      ws := null; we := null;
    end;
    if ws is null or we is null then
      problems := problems || 'Window start and end must be valid date/times'::text;
    elsif we <= ws then
      problems := problems || 'Window end must be after its start'::text;
    elsif dur is not null and we - ws < make_interval(mins => dur) then
      problems := problems || 'Window is shorter than the exam duration'::text;
    elsif p_publish and we <= now() then
      problems := problems || 'Window has already ended'::text;
    end if;
  end if;

  -- Questions
  if jsonb_typeof(p -> 'questions') is distinct from 'array'
     or jsonb_array_length(p -> 'questions') = 0 then
    problems := problems || 'Add at least one question'::text;
  elsif jsonb_array_length(p -> 'questions') > 300 then
    problems := problems || 'Too many questions (maximum 300)'::text;
  else
    for q, i in
      select e.value, e.ord from jsonb_array_elements(p -> 'questions') with ordinality e(value, ord)
    loop
      if jsonb_typeof(q) <> 'object' then
        problems := problems || format('Question %s: invalid format', i);
        continue;
      end if;
      if btrim(coalesce(q ->> 'body', '')) = '' then
        problems := problems || format('Question %s: question text is empty', i);
      end if;
      if not public.is_valid_options(q -> 'options') then
        problems := problems || format('Question %s: needs exactly 4 non-empty options', i);
      end if;
      if coalesce(q ->> 'correct_option', '') not in ('A', 'B', 'C', 'D') then
        problems := problems || format('Question %s: missing correct answer', i);
      end if;
      pts := q ->> 'points';
      if pts is not null and (pts !~ '^\d{1,3}$' or pts::integer not between 1 and 100) then
        problems := problems || format('Question %s: points must be 1–100', i);
      end if;
      if nullif(q ->> 'id', '') is not null
         and q ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        problems := problems || format('Question %s: invalid id', i);
      end if;
    end loop;
  end if;

  return problems;
end;
$$;

create or replace function private.raise_if_problems(problems text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if cardinality(problems) > 0 then
    -- detail carries a JSON array the admin UI can list; message is a readable fallback.
    raise exception 'Invalid exam: %', array_to_string(problems, '; ')
      using errcode = '22023', detail = array_to_json(problems)::text;
  end if;
end;
$$;

create or replace function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Upsert questions + answer keys to match the payload exactly (by id when given,
-- otherwise new rows), and delete questions that are no longer present.
-- ---------------------------------------------------------------------------
create or replace function private.sync_questions(p_exam_id uuid, p_questions jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  q     jsonb;
  i     integer;
  v_id  uuid;
  opts  jsonb;
  keep  uuid[] := '{}';
begin
  set constraints public.questions_exam_position_key deferred;

  for q, i in
    select e.value, e.ord from jsonb_array_elements(p_questions) with ordinality e(value, ord)
  loop
    select jsonb_agg(btrim(o.value) order by o.ord)
      into opts
      from jsonb_array_elements_text(q -> 'options') with ordinality o(value, ord);

    v_id := nullif(q ->> 'id', '')::uuid;
    if v_id is not null then
      update public.questions
         set position  = i,
             body      = btrim(q ->> 'body'),
             options   = opts,
             image_url = nullif(btrim(coalesce(q ->> 'image_url', '')), ''),
             points    = coalesce((q ->> 'points')::integer, 1)
       where id = v_id and exam_id = p_exam_id;
      if not found then
        v_id := null;  -- unknown id (e.g. from another exam): insert as new
      end if;
    end if;

    if v_id is null then
      insert into public.questions (exam_id, position, body, options, image_url, points)
      values (p_exam_id, i, btrim(q ->> 'body'), opts,
              nullif(btrim(coalesce(q ->> 'image_url', '')), ''),
              coalesce((q ->> 'points')::integer, 1))
      returning id into v_id;
    end if;

    insert into public.answer_keys (question_id, correct_option)
    values (v_id, (q ->> 'correct_option')::public.answer_option)
    on conflict (question_id) do update
      set correct_option = excluded.correct_option
      where public.answer_keys.correct_option is distinct from excluded.correct_option;

    keep := keep || v_id;
  end loop;

  delete from public.questions where exam_id = p_exam_id and id <> all (keep);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grading (shared with submit_exam / auto-submit in Phase 3).
-- ---------------------------------------------------------------------------
create or replace function private.grade_attempts(p_exam_id uuid, p_attempt_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  update public.attempts a
     set score = coalesce((
           select sum(q.points)
           from public.attempt_answers aa
           join public.questions q   on q.id = aa.question_id and q.exam_id = a.exam_id
           join public.answer_keys k on k.question_id = q.id
           where aa.attempt_id = a.id and aa.selected_option = k.correct_option
         ), 0),
         max_score = (select coalesce(sum(q.points), 0) from public.questions q where q.exam_id = a.exam_id)
   where a.exam_id = p_exam_id
     and a.submitted_at is not null
     and (p_attempt_id is null or a.id = p_attempt_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_exam
-- ---------------------------------------------------------------------------
create or replace function public.create_exam(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publish boolean;
  v_exam_id uuid;
begin
  perform private.require_admin();
  v_publish := coalesce((payload ->> 'publish')::boolean, false);
  perform private.raise_if_problems(private.exam_payload_problems(payload, v_publish));

  insert into public.exams (title, subject, stream, duration_minutes, published_at, source_file, created_by)
  values (
    btrim(payload ->> 'title'),
    btrim(payload ->> 'subject'),
    (payload ->> 'stream')::public.exam_stream,
    (payload ->> 'duration_minutes')::integer,
    case when v_publish then now() end,
    nullif(payload ->> 'source_file', ''),
    auth.uid()
  )
  returning id into v_exam_id;

  if jsonb_typeof(payload -> 'window') = 'object' then
    insert into public.exam_windows (exam_id, starts_at, ends_at, created_by)
    values (v_exam_id,
            (payload -> 'window' ->> 'starts_at')::timestamptz,
            (payload -> 'window' ->> 'ends_at')::timestamptz,
            auth.uid());
  end if;

  perform private.sync_questions(v_exam_id, payload -> 'questions');
  return v_exam_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_exam: full replace of meta, main window and questions. Refused once any
-- attempt exists; use update_answer_keys for answer fixes after that.
-- ---------------------------------------------------------------------------
create or replace function public.update_exam(p_exam_id uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam      public.exams;
  v_publish   boolean;
  v_window_id uuid;
begin
  perform private.require_admin();

  -- Row lock: serialises with start_exam (which takes a share lock on the exam row),
  -- so no attempt can appear between the check below and our changes.
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.attempts where exam_id = p_exam_id) then
    raise exception 'This exam already has attempts. Only answer keys can be changed.'
      using errcode = '55000';
  end if;

  v_publish := coalesce((payload ->> 'publish')::boolean, v_exam.published_at is not null);
  perform private.raise_if_problems(private.exam_payload_problems(payload, v_publish));

  update public.exams
     set title            = btrim(payload ->> 'title'),
         subject          = btrim(payload ->> 'subject'),
         stream           = (payload ->> 'stream')::public.exam_stream,
         duration_minutes = (payload ->> 'duration_minutes')::integer,
         published_at     = case when v_publish then coalesce(v_exam.published_at, now()) end,
         source_file      = coalesce(nullif(payload ->> 'source_file', ''), source_file)
   where id = p_exam_id;

  -- Main (non-reopen) window. Reopen windows are managed in Phase 5.
  select id into v_window_id
  from public.exam_windows
  where exam_id = p_exam_id and not is_reopen
  order by starts_at
  limit 1;

  if jsonb_typeof(payload -> 'window') = 'object' then
    if v_window_id is null then
      insert into public.exam_windows (exam_id, starts_at, ends_at, created_by)
      values (p_exam_id,
              (payload -> 'window' ->> 'starts_at')::timestamptz,
              (payload -> 'window' ->> 'ends_at')::timestamptz,
              auth.uid());
    else
      update public.exam_windows
         set starts_at = (payload -> 'window' ->> 'starts_at')::timestamptz,
             ends_at   = (payload -> 'window' ->> 'ends_at')::timestamptz
       where id = v_window_id;
    end if;
  elsif v_window_id is not null then
    delete from public.exam_windows where id = v_window_id;
  end if;

  perform private.sync_questions(p_exam_id, payload -> 'questions');
  return p_exam_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_answer_keys: allowed at any time; re-grades submitted attempts if anything changed.
-- p_keys: [{ "question_id": "<uuid>", "correct_option": "A|B|C|D" }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.update_answer_keys(p_exam_id uuid, p_keys jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k         jsonb;
  v_changed integer := 0;
  v_n       integer;
  v_regraded integer := 0;
begin
  perform private.require_admin();
  perform 1 from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'Keys must be an array' using errcode = '22023';
  end if;

  for k in select value from jsonb_array_elements(p_keys) loop
    if coalesce(k ->> 'correct_option', '') not in ('A', 'B', 'C', 'D') then
      raise exception 'Invalid correct option for question %', k ->> 'question_id' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.questions
      where id = nullif(k ->> 'question_id', '')::uuid and exam_id = p_exam_id
    ) then
      raise exception 'Question % is not part of this exam', k ->> 'question_id' using errcode = '22023';
    end if;

    update public.answer_keys
       set correct_option = (k ->> 'correct_option')::public.answer_option
     where question_id = (k ->> 'question_id')::uuid
       and correct_option is distinct from (k ->> 'correct_option')::public.answer_option;
    get diagnostics v_n = row_count;
    v_changed := v_changed + v_n;
  end loop;

  if v_changed > 0 then
    v_regraded := private.grade_attempts(p_exam_id);
  end if;

  return jsonb_build_object('changed', v_changed, 'regraded', v_regraded);
end;
$$;

-- ---------------------------------------------------------------------------
-- regrade_exam: recompute scores of all submitted attempts.
-- ---------------------------------------------------------------------------
create or replace function public.regrade_exam(p_exam_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return private.grade_attempts(p_exam_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_exam: only when nobody has attempted it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform 1 from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.attempts where exam_id = p_exam_id) then
    raise exception 'This exam has attempts and cannot be deleted.' using errcode = '55000';
  end if;
  delete from public.exams where id = p_exam_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_get_exam: everything needed by the editor, INCLUDING correct answers.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_exam(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'id',               e.id,
    'title',            e.title,
    'subject',          e.subject,
    'stream',           e.stream,
    'duration_minutes', e.duration_minutes,
    'published_at',     e.published_at,
    'source_file',      e.source_file,
    'created_at',       e.created_at,
    'updated_at',       e.updated_at,
    'status',           s.status,
    'attempt_count',    (select count(*) from public.attempts a where a.exam_id = e.id),
    'window', (
      select jsonb_build_object('id', w.id, 'starts_at', w.starts_at, 'ends_at', w.ends_at)
      from public.exam_windows w
      where w.exam_id = e.id and not w.is_reopen
      order by w.starts_at
      limit 1
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             q.id,
               'position',       q.position,
               'body',           q.body,
               'options',        q.options,
               'image_url',      q.image_url,
               'points',         q.points,
               'correct_option', k.correct_option
             ) order by q.position)
      from public.questions q
      left join public.answer_keys k on k.question_id = q.id
      where q.exam_id = e.id
    ), '[]'::jsonb)
  )
  into result
  from public.exams e
  join public.exam_status s on s.exam_id = e.id
  where e.id = p_exam_id;

  if result is null then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_list_exams: one row per exam with derived status and counts.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_exams()
returns table (
  id               uuid,
  title            text,
  subject          text,
  stream           public.exam_stream,
  duration_minutes integer,
  published_at     timestamptz,
  created_at       timestamptz,
  status           public.exam_state,
  next_starts_at   timestamptz,
  live_ends_at     timestamptz,
  last_ends_at     timestamptz,
  window_starts_at timestamptz,
  window_ends_at   timestamptz,
  question_count   integer,
  attempt_count    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select
    e.id, e.title, e.subject, e.stream, e.duration_minutes, e.published_at, e.created_at,
    s.status, s.next_starts_at, s.live_ends_at, s.last_ends_at,
    mw.starts_at, mw.ends_at,
    (select count(*)::integer from public.questions q where q.exam_id = e.id),
    (select count(*)::integer from public.attempts a where a.exam_id = e.id)
  from public.exams e
  join public.exam_status s on s.exam_id = e.id
  left join lateral (
    select w.starts_at, w.ends_at
    from public.exam_windows w
    where w.exam_id = e.id and not w.is_reopen
    order by w.starts_at
    limit 1
  ) mw on true
  order by coalesce(mw.starts_at, e.created_at) desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: default privileges already revoke EXECUTE from API roles; grant the
-- admin entry points to authenticated (each one checks is_admin() itself).
-- ---------------------------------------------------------------------------
grant execute on function public.create_exam(jsonb)              to authenticated;
grant execute on function public.update_exam(uuid, jsonb)        to authenticated;
grant execute on function public.update_answer_keys(uuid, jsonb) to authenticated;
grant execute on function public.regrade_exam(uuid)              to authenticated;
grant execute on function public.delete_exam(uuid)               to authenticated;
grant execute on function public.admin_get_exam(uuid)            to authenticated;
grant execute on function public.admin_list_exams()              to authenticated;
