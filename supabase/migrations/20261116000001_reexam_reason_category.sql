-- Re-exam requests get a reason category chosen from a short list, next to the free-text
-- description. Existing requests become 'other'. Eligibility rules are unchanged.

create type public.reexam_reason as enum ('network_power', 'illness', 'device', 'other');

alter table public.reexam_requests
  add column reason_category public.reexam_reason not null default 'other';

-- request_reexam v2: same checks, plus the category. Drop + create (not an overload) so
-- a 2-argument call keeps working without becoming ambiguous.
drop function public.request_reexam(uuid, text);
create function public.request_reexam(
  p_exam_id  uuid,
  p_reason   text,
  p_category public.reexam_reason default 'other'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_block   text;
  v_id      uuid;
begin
  v_profile := private.require_active_student();
  v_block := private.reexam_block_reason(p_exam_id, v_profile.id);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 1000 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  begin
    insert into public.reexam_requests (exam_id, user_id, reason, reason_category)
    values (p_exam_id, v_profile.id, btrim(p_reason), coalesce(p_category, 'other'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'request_pending' using errcode = 'P0001';
  end;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

revoke execute on function public.request_reexam(uuid, text, public.reexam_reason) from public;
grant execute on function public.request_reexam(uuid, text, public.reexam_reason) to authenticated;

-- Admin list v3: adds reason_category.
create or replace function public.admin_list_reexam_requests(p_status public.reexam_status default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'exam_id', r.exam_id, 'exam_title', e.title, 'exam_subject', e.subject,
             'user_id', r.user_id, 'full_name', p.full_name, 'school', p.school, 'stream', p.stream,
             'is_banned', p.is_banned,
             'reason', r.reason, 'reason_category', r.reason_category,
             'status', r.status, 'admin_note', r.admin_note,
             'created_at', r.created_at, 'reviewed_at', r.reviewed_at, 'reviewer', rv.full_name,
             'reexam_id', r.reexam_id, 'reexam_title', re.title
           ) order by (r.status = 'pending') desc, r.created_at desc)
    from public.reexam_requests r
    join public.exams e on e.id = r.exam_id
    join public.profiles p on p.id = r.user_id
    left join public.profiles rv on rv.id = r.reviewed_by
    left join public.exams re on re.id = r.reexam_id
    where p_status is null or r.status = p_status
  ), '[]'::jsonb);
end;
$$;
