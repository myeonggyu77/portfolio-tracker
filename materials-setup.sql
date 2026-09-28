-- 자재관리(materials.html)용 Supabase 설정 — 2026-09 이미 실행 완료(참고용 기록)
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  process text not null default '',        -- 공정
  sub_process text not null default '',    -- 세부공정
  material_name text not null default '',  -- 자재명
  fitting text not null default '',        -- 피팅값
  vendor text not null default '',         -- 업체
  memo text not null default '',           -- 메모
  photos jsonb not null default '[]'::jsonb, -- [{path, thumb}] (Storage 'material-photos' 버킷 경로)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.materials enable row level security;
create policy "authenticated read" on public.materials for select to authenticated using (true);
create policy "authenticated insert" on public.materials for insert to authenticated with check (true);
create policy "authenticated update" on public.materials for update to authenticated using (true) with check (true);
create policy "authenticated delete" on public.materials for delete to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-photos', 'material-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "material photos read" on storage.objects for select to authenticated using (bucket_id = 'material-photos');
create policy "material photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'material-photos');
create policy "material photos delete" on storage.objects for delete to authenticated using (bucket_id = 'material-photos');

-- 다른 기기에서 입력한 내용이 실시간으로 반영되도록
alter publication supabase_realtime add table public.materials;
