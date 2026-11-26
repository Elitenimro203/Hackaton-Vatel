-- Patch allergies : profil alimentaire (élève et parents liés), plat de remplacement, reserver() avec alerte_allergie, alertes au parent, allergies du jour pour la cuisine. Relançable.

-- =====================================================================
-- 1. PLAT DE REMPLACEMENT DU JOUR ET CHOIX DANS LA RÉSERVATION
-- =====================================================================

-- Chaque menu peut proposer un plat de remplacement (même prix) pour les élèves allergiques
alter table public.menus add column if not exists plat_alternatif text not null default '';
alter table public.menus add column if not exists photo_alternative text;
alter table public.menus add column if not exists allergenes_alternatif text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_allergenes_alternatif_valides') then
    alter table public.menus add constraint menus_allergenes_alternatif_valides
      check (allergenes_alternatif <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf']);
  end if;
end;
$$;

-- Vrai si l'élève a réservé le plat de remplacement plutôt que le plat du jour
alter table public.reservations add column if not exists alternative boolean not null default false;

-- =====================================================================
-- 2. ALERTES ENVOYÉES AU PARENT (élève qui réserve malgré son allergie)
-- =====================================================================

create table if not exists public.alertes (
  id         bigint generated always as identity primary key,
  eleve_id   uuid not null references public.profiles (id) on delete cascade,
  menu_id    bigint references public.menus (id) on delete set null,
  allergenes text[] not null default '{}',
  message    text not null,
  lue        boolean not null default false,
  cree_le    timestamptz not null default now()
);

create index if not exists alertes_par_eleve on public.alertes (eleve_id, cree_le desc);

alter table public.alertes enable row level security;

-- alertes : lecture par l'élève, ses parents liés et l'admin. Écriture uniquement par les fonctions RPC.
drop policy if exists alertes_lecture on public.alertes;
create policy alertes_lecture on public.alertes
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- =====================================================================
-- 3. FONCTIONS RPC
-- =====================================================================

-- Réponse de refus de reserver() : { ok: false, message, alerte_allergie }
create or replace function public.reponse_refus(p_message text, p_allergenes text[] default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('ok', false, 'message', p_message, 'alerte_allergie', to_jsonb(p_allergenes));
$$;

-- Le profil alimentaire d'un élève : modifiable par l'élève, ses parents liés ou l'admin
create or replace function public.modifier_allergies(p_eleve_id uuid, p_allergies text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  liste text[] := array(select distinct unnest(coalesce(p_allergies, '{}')) order by 1);
begin
  if auth.uid() is null then
    return 'Connectez-vous pour modifier les allergies.';
  end if;
  if not (p_eleve_id = auth.uid() or public.est_parent_de(p_eleve_id) or public.mon_role() = 'admin') then
    return 'Seuls l''élève, ses parents et la cantine peuvent modifier ces allergies.';
  end if;
  if not exists (select 1 from public.profiles where id = p_eleve_id and role = 'eleve') then
    return 'Compte élève introuvable.';
  end if;
  if not liste <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf'] then
    return 'Allergie inconnue : choisissez parmi arachide, lait, gluten, poisson et œuf.';
  end if;

  update public.profiles set allergies = liste where id = p_eleve_id;
  return 'ok';
end;
$$;

-- Les anciennes versions (2 et 3 paramètres, qui renvoyaient un texte) sont remplacées
drop function if exists public.reserver(bigint, time);
drop function if exists public.reserver(bigint, time, boolean);

-- Réserver le plat du jour ou son plat de remplacement. Renvoie { ok, message, alerte_allergie, code_retrait } :
-- alerte_allergie liste les allergènes du profil présents dans le plat. Sans p_accepte_allergie, la réservation
-- est refusée ; avec, elle est faite et une alerte est envoyée aux parents liés.
create or replace function public.reserver(
  p_menu_id bigint,
  p_creneau time default null,
  p_accepte_allergie boolean default false,
  p_alternative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_choisi     public.menus;
  profil          public.profiles;
  plat_choisi     text;
  allergenes_plat text[];
  risques         text[];
  prix_a_payer    integer;
  nouveau_code    text;
begin
  if auth.uid() is null then
    return public.reponse_refus('Connecte-toi pour réserver.');
  end if;
  if public.mon_role() is distinct from 'eleve' then
    return public.reponse_refus('Seul un élève ou un employé peut réserver un repas.');
  end if;

  select * into menu_choisi from public.menus where id = p_menu_id;
  if not found then
    return public.reponse_refus('Ce menu n''existe pas.');
  end if;
  if now() >= public.heure_limite(menu_choisi.jour) then
    return public.reponse_refus('Trop tard : on réserve au plus tard la veille à 18 h.');
  end if;
  if coalesce(p_alternative, false) and trim(menu_choisi.plat_alternatif) = '' then
    return public.reponse_refus('Pas de plat de remplacement ce jour-là.');
  end if;

  -- Verrou sur le profil : deux réservations en même temps ne peuvent pas dépasser le solde
  select * into profil from public.profiles where id = auth.uid() for update;
  if not found then
    return public.reponse_refus('Profil introuvable.');
  end if;

  if exists (
    select 1 from public.reservations
    where eleve_id = auth.uid() and menu_id = p_menu_id and statut <> 'annulee'
  ) then
    return public.reponse_refus('Tu as déjà réservé ce repas.');
  end if;

  if coalesce(p_alternative, false) then
    plat_choisi := menu_choisi.plat_alternatif;
    allergenes_plat := menu_choisi.allergenes_alternatif;
  else
    plat_choisi := menu_choisi.plat;
    allergenes_plat := menu_choisi.allergenes;
  end if;

  risques := array(select unnest(allergenes_plat) intersect select unnest(profil.allergies) order by 1);
  if cardinality(risques) > 0 and not coalesce(p_accepte_allergie, false) then
    return public.reponse_refus('Ce plat contient un allergène de ton profil : confirme pour réserver quand même.', risques);
  end if;

  prix_a_payer := case when profil.type_usager = 'employe' then menu_choisi.prix_employe else menu_choisi.prix end;
  if profil.solde < prix_a_payer then
    return public.reponse_refus('Solde insuffisant : recharge ton compte.');
  end if;

  loop
    nouveau_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (
      select 1 from public.reservations
      where menu_id = p_menu_id and code_retrait = nouveau_code and statut <> 'annulee'
    );
  end loop;

  insert into public.reservations (eleve_id, menu_id, code_retrait, montant, creneau, alternative)
  values (auth.uid(), p_menu_id, nouveau_code, prix_a_payer, p_creneau, coalesce(p_alternative, false));

  update public.profiles set solde = solde - prix_a_payer where id = auth.uid();

  insert into public.mouvements (eleve_id, montant, motif)
  values (auth.uid(), -prix_a_payer, 'Repas : ' || plat_choisi);

  -- L'élève a confirmé malgré son allergie : ses parents sont prévenus
  if cardinality(risques) > 0 then
    insert into public.alertes (eleve_id, menu_id, allergenes, message)
    values (
      auth.uid(),
      p_menu_id,
      risques,
      coalesce(nullif(trim(profil.nom), ''), 'Votre enfant') || ' a réservé « ' || plat_choisi
        || ' » malgré son allergie (' || replace(array_to_string(risques, ', '), 'oeuf', 'œuf') || ').'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'ok',
    'alerte_allergie', case when cardinality(risques) > 0 then to_jsonb(risques) end,
    'code_retrait', nouveau_code
  );
exception
  when unique_violation then
    return public.reponse_refus('Tu as déjà réservé ce repas.');
end;
$$;

-- Annuler sa réservation avant l'heure limite : rembourse (plat du jour ou de remplacement) et crée le mouvement
create or replace function public.annuler(p_reservation_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resa      public.reservations;
  jour_menu date;
  nom_plat  text;
begin
  if auth.uid() is null then
    return 'Connecte-toi pour annuler.';
  end if;

  select * into resa from public.reservations where id = p_reservation_id for update;
  if not found or (resa.eleve_id <> auth.uid() and public.mon_role() is distinct from 'admin') then
    return 'Réservation introuvable.';
  end if;
  if resa.statut <> 'reservee' then
    return 'Cette réservation est déjà annulée ou servie.';
  end if;

  select jour, case when resa.alternative then plat_alternatif else plat end
  into jour_menu, nom_plat
  from public.menus where id = resa.menu_id;
  if now() >= public.heure_limite(jour_menu) then
    return 'Trop tard : on annule au plus tard la veille à 18 h, le repas est déjà prévu.';
  end if;

  update public.reservations set statut = 'annulee' where id = resa.id;
  update public.profiles set solde = solde + resa.montant where id = resa.eleve_id;
  insert into public.mouvements (eleve_id, montant, motif)
  values (resa.eleve_id, resa.montant, 'Remboursement : ' || nom_plat);

  return 'ok';
end;
$$;

-- Le parent (ou l'admin) marque une alerte comme lue
create or replace function public.marquer_alerte_lue(p_alerte_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  id_eleve uuid;
begin
  select eleve_id into id_eleve from public.alertes where id = p_alerte_id;
  if id_eleve is null or not (public.est_parent_de(id_eleve) or public.mon_role() = 'admin') then
    return 'Alerte introuvable.';
  end if;

  update public.alertes set lue = true where id = p_alerte_id;
  return 'ok';
end;
$$;

-- Admin : élèves allergiques qui mangent ce jour-là, avec le plat choisi et les allergènes à risque
create or replace function public.allergies_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  allergies      text[],
  plat           text,
  alternative    boolean,
  risques        text[],
  code_retrait   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;

  return query
  select
    r.id,
    p.nom,
    p.allergies,
    case when r.alternative then m.plat_alternatif else m.plat end,
    r.alternative,
    array(
      select unnest(case when r.alternative then m.allergenes_alternatif else m.allergenes end)
      intersect
      select unnest(p.allergies)
      order by 1
    ),
    r.code_retrait
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
    and cardinality(p.allergies) > 0
  order by 6 desc, p.nom;
end;
$$;

revoke execute on function public.reponse_refus(text, text[])             from public, anon;
revoke execute on function public.modifier_allergies(uuid, text[])        from public, anon;
revoke execute on function public.reserver(bigint, time, boolean, boolean) from public, anon;
revoke execute on function public.marquer_alerte_lue(bigint)              from public, anon;
revoke execute on function public.allergies_du_jour(date)                 from public, anon;
grant  execute on function public.reponse_refus(text, text[])             to authenticated;
grant  execute on function public.modifier_allergies(uuid, text[])        to authenticated;
grant  execute on function public.reserver(bigint, time, boolean, boolean) to authenticated;
grant  execute on function public.marquer_alerte_lue(bigint)              to authenticated;
grant  execute on function public.allergies_du_jour(date)                 to authenticated;

-- =====================================================================
-- 4. TEMPS RÉEL : le parent voit l'alerte arriver sans recharger
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertes'
  ) then
    alter publication supabase_realtime add table public.alertes;
  end if;
end;
$$;

-- =====================================================================
-- 5. DONNÉES DE DÉMO : plats de remplacement de la semaine du 23 novembre, élève démo allergique à l'arachide
-- =====================================================================

update public.menus set plat_alternatif = 'Kédjénou de poulet',     photo_alternative = '/photos/kedjenou-poulet.jpg',        allergenes_alternatif = '{}'        where jour = '2026-11-23';
update public.menus set plat_alternatif = 'Attiéké poisson braisé', photo_alternative = '/photos/attieke-poisson-braise.jpg', allergenes_alternatif = '{poisson}' where jour = '2026-11-24';
update public.menus set plat_alternatif = 'Kédjénou de poulet',     photo_alternative = '/photos/kedjenou-poulet.jpg',        allergenes_alternatif = '{}'        where jour = '2026-11-25';
update public.menus set plat_alternatif = 'Garba maison',           photo_alternative = '/photos/garba-maison.jpg',           allergenes_alternatif = '{poisson}' where jour = '2026-11-26';
update public.menus set plat_alternatif = 'Kédjénou de poulet',     photo_alternative = '/photos/kedjenou-poulet.jpg',        allergenes_alternatif = '{}'        where jour = '2026-11-27';
update public.profiles set allergies = '{arachide}' where email = 'eleve.demo@cantijuste.ci';
