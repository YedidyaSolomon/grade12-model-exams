-- Storage buckets.
--   exam-sources    : private. Original uploaded Excel/Word/PDF files. Admin only.
--   question-images : public read (images are shown inside the exam room and contain
--                     no answers), admin-only write. Paths are random UUIDs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('exam-sources', 'exam-sources', false, 20 * 1024 * 1024, array[
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-excel',
     'text/csv',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/pdf'
   ]),
  ('question-images', 'question-images', true, 2 * 1024 * 1024, array[
     'image/png', 'image/jpeg', 'image/webp', 'image/gif'
   ])
on conflict (id) do nothing;

create policy "exam-sources: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'exam-sources' and (select public.is_admin()));

create policy "exam-sources: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'exam-sources' and (select public.is_admin()));

create policy "exam-sources: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'exam-sources' and (select public.is_admin()))
  with check (bucket_id = 'exam-sources' and (select public.is_admin()));

create policy "exam-sources: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'exam-sources' and (select public.is_admin()));

-- question-images: public bucket => reads go through the public URL, no select policy needed.
create policy "question-images: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (select public.is_admin()));

create policy "question-images: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'question-images' and (select public.is_admin()))
  with check (bucket_id = 'question-images' and (select public.is_admin()));

create policy "question-images: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (select public.is_admin()));
