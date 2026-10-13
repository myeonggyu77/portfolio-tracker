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

-- 2026-10: '장비별 자재' 탭용 장비 칸 추가
alter table public.materials add column if not exists equipment text not null default '';

-- 2026-10: MDG 코드 칸 추가 (메모 앞에 "MDG xxxx · "로 넣어뒀던 값은 이 칸으로 옮김)
alter table public.materials add column if not exists mdg_code text not null default '';

-- 2026-10: '자재 신청' 탭(베타)용 신청 테이블 — 신청 1건 = 1행, 자재 내역은 현장 카톡 양식 텍스트 그대로(items_text)
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null default current_date,  -- 신청일
  equipment text not null default '',                -- 장비명
  process text not null default '',                  -- 공정
  location text not null default '',                 -- 위치
  requester text not null default '',                -- 신청자
  delivery_date text not null default '',            -- 반입일(자유 입력, 예: 10/14)
  items_text text not null default '',               -- 자재 내역 텍스트
  status text not null default '신청',               -- (예비) 진행 상태, 아직 화면에서 안 씀
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.material_requests enable row level security;
create policy "authenticated read" on public.material_requests for select to authenticated using (true);
create policy "authenticated insert" on public.material_requests for insert to authenticated with check (true);
create policy "authenticated update" on public.material_requests for update to authenticated using (true) with check (true);
create policy "authenticated delete" on public.material_requests for delete to authenticated using (true);
alter publication supabase_realtime add table public.material_requests;
