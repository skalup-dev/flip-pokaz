-- ===== Klocek 7: Paragony i materiały (dokumenty zakupów przy mieszkaniu) =====
-- Wgrywane w Supabase po sql/06_szef_firmy.sql. Można uruchomić kilka razy, niczego nie usuwa z danych.
-- Zdjęcie dokumentu leży w Bibliotece › Paragony (tabela pliki, folder 'paragony'),
-- a tu są dane z dokumentu: sklep, co kupiono, kwota, data, kto zapłacił, kto dodał, czy sprawdzone.
-- Do budżetu materiałów (wydane) wchodzą tylko dokumenty „Sprawdzone”; „Do sprawdzenia” aplikacja pokazuje osobno jako „czeka”.
-- Klocek 8 (Pieniądze) nie potrzebuje nowych tabel: używa kolumn mieszkania z 06 i sum z tej tabeli.

create table if not exists public.paragony (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null references auth.users(id) on delete cascade,      -- zawsze Właściciel aplikacji (właściciel mieszkania)
  dodal uuid default auth.uid() references auth.users(id) on delete set null, -- kto dodał (Właściciel aplikacji albo szef firmy)
  plik uuid references public.pliki(id) on delete set null,                  -- zdjęcie albo PDF dokumentu w Bibliotece › Paragony
  sklep text not null check (length(trim(sklep)) between 1 and 120),
  co text check (co is null or length(co) <= 300),
  kwota numeric(12,2) not null check (kwota >= 0),
  data date not null default current_date,
  zaplacil text not null default 'firma' check (zaplacil in ('firma','wlasciciel')),
  sprawdzone boolean not null default false,
  sprawdzil uuid references auth.users(id) on delete set null,
  sprawdzono timestamptz,
  utworzono timestamptz not null default now()
);
-- Odczyt ze zdjęcia (Tesseract w telefonie, później ewentualnie AI). Ręczne wpisanie = 'reczny'.
alter table public.paragony add column if not exists nip text check (nip is null or nip ~ '^[0-9]{10}$');
alter table public.paragony add column if not exists tekst_surowy text check (tekst_surowy is null or length(tekst_surowy) <= 20000);
alter table public.paragony add column if not exists zrodlo_odczytu text not null default 'reczny' check (zrodlo_odczytu in ('reczny','tesseract','ai'));
alter table public.paragony add column if not exists pewnosc smallint check (pewnosc is null or pewnosc between 0 and 100);
alter table public.paragony add column if not exists pola_niepewne text[] not null default '{}'
  check (pola_niepewne <@ array['sklep','co','kwota','data','nip','pozycje']::text[]);
alter table public.paragony add column if not exists pozycje jsonb not null default '[]'::jsonb
  check (jsonb_typeof(pozycje) = 'array' and jsonb_array_length(pozycje) <= 200);
create index if not exists paragony_mieszkanie_idx on public.paragony(mieszkanie);
create index if not exists paragony_plik_idx on public.paragony(plik);
alter table public.paragony enable row level security;

-- Pilnuje zasad niezależnie od tego, co wyśle aplikacja:
-- właściciel wiersza = właściciel mieszkania, „dodał” = zalogowana osoba,
-- firma dodaje tylko paragony zapłacone przez firmę i zawsze „do sprawdzenia”,
-- zdjęcie musi być z folderu Paragony tego samego mieszkania, „kto i kiedy sprawdził” ustawia baza.
create or replace function public.paragony_pilnuj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.wlasciciel := public.wlasciciel_mieszkania(new.mieszkanie);
    new.dodal := auth.uid();
    if new.wlasciciel is distinct from auth.uid() then   -- szef firmy
      new.zaplacil := 'firma';
      new.sprawdzone := false;
    end if;
  else
    new.mieszkanie := old.mieszkanie; new.wlasciciel := old.wlasciciel; new.dodal := old.dodal; new.utworzono := old.utworzono;
    new.tekst_surowy := old.tekst_surowy; new.zrodlo_odczytu := old.zrodlo_odczytu; new.pewnosc := old.pewnosc; new.pozycje := old.pozycje;
    if new.plik is distinct from old.plik and new.plik is not null then new.plik := old.plik; end if;   -- zdjęcia nie da się podmienić, można je tylko stracić (usunięcie z Biblioteki)
  end if;
  if new.plik is not null and not exists (
       select 1 from public.pliki f where f.id = new.plik and f.mieszkanie = new.mieszkanie and f.folder = 'paragony') then
    raise exception 'Zdjęcie dokumentu musi być w Bibliotece › Paragony tego mieszkania';
  end if;
  if new.sprawdzone and (tg_op = 'INSERT' or not old.sprawdzone) then
    new.sprawdzil := auth.uid(); new.sprawdzono := now();
  elsif not new.sprawdzone then
    new.sprawdzil := null; new.sprawdzono := null;
  else
    new.sprawdzil := old.sprawdzil; new.sprawdzono := old.sprawdzono;
  end if;
  return new;
end $$;
revoke all on function public.paragony_pilnuj() from public, anon;
drop trigger if exists paragony_pilnuj on public.paragony;
create trigger paragony_pilnuj before insert or update on public.paragony
  for each row execute function public.paragony_pilnuj();

-- Właściciel aplikacji: widzi, dodaje, poprawia, sprawdza i usuwa dokumenty swoich mieszkań
drop policy if exists paragony_wlasciciel on public.paragony;
create policy paragony_wlasciciel on public.paragony for all to authenticated
  using (wlasciciel = auth.uid())
  with check (wlasciciel = auth.uid() and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
-- Szef firmy (aktywny dostęp): widzi dokumenty zapłacone przez firmę albo dodane przez siebie, dodaje nowe.
-- Nie poprawia i nie usuwa (brak zasad update/delete dla firmy).
drop policy if exists paragony_firma_odczyt on public.paragony;
create policy paragony_firma_odczyt on public.paragony for select to authenticated
  using (public.jest_firma_mieszkania(mieszkanie) and (zaplacil = 'firma' or dodal = auth.uid()));
drop policy if exists paragony_firma_dodanie on public.paragony;
create policy paragony_firma_dodanie on public.paragony for insert to authenticated
  with check (public.jest_firma_mieszkania(mieszkanie) and wlasciciel = public.wlasciciel_mieszkania(mieszkanie)
              and zaplacil = 'firma' and not sprawdzone);

revoke all on public.paragony from anon, public;
grant select, insert, delete on public.paragony to authenticated;
grant update (sklep, co, kwota, data, zaplacil, sprawdzone, nip, pola_niepewne) on public.paragony to authenticated;
