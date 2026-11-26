-- =========================================================
-- Lier un parent avec un code donné par l'élève (25/11)
-- Avant : le parent tapait l'e-mail de n'importe quel élève et voyait aussitôt son solde, ses repas et ses allergies.
-- Maintenant : l'élève crée un code à 6 caractères (valable 24 h, un seul usage) depuis son Profil,
-- et le parent le saisit. Sans le téléphone de l'enfant, pas de lien.
-- Relançable.
-- =========================================================

create table if not exists public.codes_parent (
  eleve_id  uuid primary key references public.profiles (id) on delete cascade,
  code      text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  expire_le timestamptz not null
);

alter table public.codes_parent enable row level security;

-- L'élève relit son propre code ; tout le reste passe par les fonctions ci-dessous
grant select on public.codes_parent to authenticated;
drop policy if exists codes_parent_lecture on public.codes_parent;
create policy codes_parent_lecture on public.codes_parent
  for select to authenticated
  using (eleve_id = auth.uid());

-- Élève : crée (ou remplace) son code pour un parent. Renvoie { ok, message, code, expire_le }.
create or replace function public.creer_code_parent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet     constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  nouveau_code text;
  fin          timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null or public.mon_role() is distinct from 'eleve' then
    return jsonb_build_object('ok', false, 'message', 'Seul un élève peut inviter un parent.');
  end if;

  loop
    nouveau_code := '';
    for i in 1..6 loop
      nouveau_code := nouveau_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.codes_parent where code = nouveau_code);
  end loop;

  insert into public.codes_parent (eleve_id, code, expire_le)
  values (auth.uid(), nouveau_code, fin)
  on conflict (eleve_id) do update set code = excluded.code, expire_le = excluded.expire_le;

  return jsonb_build_object('ok', true, 'message', 'ok', 'code', nouveau_code, 'expire_le', fin);
end;
$$;

-- Parent : se lie à l'enfant qui lui a donné ce code. Le code ne sert qu'une fois.
create or replace function public.lier_enfant_avec_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code_propre text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  invitation  public.codes_parent;
begin
  if public.mon_role() is distinct from 'parent' then
    return 'Réservé aux parents.';
  end if;
  if char_length(code_propre) <> 6 then
    return 'Le code fait 6 caractères : demandez-le à votre enfant.';
  end if;

  select * into invitation from public.codes_parent where code = code_propre for update;
  if invitation.eleve_id is null or invitation.expire_le < now() then
    return 'Code inconnu ou expiré. Demandez-en un nouveau à votre enfant.';
  end if;
  if exists (select 1 from public.liens_parent where parent_id = auth.uid() and eleve_id = invitation.eleve_id) then
    delete from public.codes_parent where eleve_id = invitation.eleve_id;
    return 'Cet enfant est déjà lié à votre compte.';
  end if;

  insert into public.liens_parent (parent_id, eleve_id) values (auth.uid(), invitation.eleve_id);
  delete from public.codes_parent where eleve_id = invitation.eleve_id;
  return 'ok';
end;
$$;

-- Élève : les parents liés à son compte (leur nom seulement)
create or replace function public.mes_parents()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nom
  from public.liens_parent l
  join public.profiles p on p.id = l.parent_id
  where l.eleve_id = auth.uid()
  order by p.nom;
$$;

revoke execute on function public.creer_code_parent() from public, anon;
grant  execute on function public.creer_code_parent() to authenticated;
revoke execute on function public.lier_enfant_avec_code(text) from public, anon;
grant  execute on function public.lier_enfant_avec_code(text) to authenticated;
revoke execute on function public.mes_parents() from public, anon;
grant  execute on function public.mes_parents() to authenticated;

-- Temps réel : l'élève voit le nom de son parent apparaître dès que le code est saisi
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'liens_parent'
     ) then
    alter publication supabase_realtime add table public.liens_parent;
  end if;
end;
$$;

-- L'ancienne liaison par e-mail disparaît : elle permettait de suivre n'importe quel élève
drop function if exists public.lier_enfant(text);
