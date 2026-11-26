-- CantiJuste : plusieurs plats au choix chaque jour (entrée, plat au choix, dessert, boisson). Relançable sans erreur.
-- Chaque plat du jour est une ligne de menus (son prix, ses allergènes, sa photo, son remplacement, sa recette).
-- Un élève garde un seul repas par jour : la règle passe de « un par menu » à « un par jour ».

-- =====================================================================
-- 1. Plusieurs plats le même jour, une boisson dans la formule
-- =====================================================================
alter table public.menus drop constraint if exists menus_jour_key;
create unique index if not exists menus_un_plat_par_jour on public.menus (jour, plat);
alter table public.menus add column if not exists boisson text not null default '';

-- =====================================================================
-- 2. Le jour du repas recopié dans la réservation, pour les règles « par jour »
-- =====================================================================
alter table public.reservations add column if not exists jour date;

update public.reservations r
set jour = m.jour
from public.menus m
where m.id = r.menu_id and r.jour is distinct from m.jour;

alter table public.reservations alter column jour set not null;

-- Rempli tout seul à chaque réservation (fonctions RPC et scripts de démonstration)
create or replace function public.remplir_jour_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select m.jour into new.jour from public.menus m where m.id = new.menu_id;
  return new;
end;
$$;

drop trigger if exists reservations_remplir_jour on public.reservations;
create trigger reservations_remplir_jour
  before insert or update of menu_id on public.reservations
  for each row execute function public.remplir_jour_reservation();

-- Si l'admin change la date d'un plat, ses réservations suivent
create or replace function public.suivre_jour_menu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations set jour = new.jour where menu_id = new.id;
  return new;
end;
$$;

drop trigger if exists menus_suivre_jour on public.menus;
create trigger menus_suivre_jour
  after update of jour on public.menus
  for each row when (old.jour is distinct from new.jour)
  execute function public.suivre_jour_menu();

revoke execute on function public.remplir_jour_reservation() from public, anon, authenticated;
revoke execute on function public.suivre_jour_menu() from public, anon, authenticated;

-- Un seul repas actif par élève et par jour ; un code de retrait unique parmi les repas du jour
drop index if exists public.reservations_un_repas_par_jour;
drop index if exists public.reservations_code_unique_du_jour;
create unique index if not exists reservations_un_repas_par_eleve_et_jour
  on public.reservations (eleve_id, jour) where statut <> 'annulee';
create unique index if not exists reservations_code_unique_par_jour
  on public.reservations (jour, code_retrait) where statut <> 'annulee';

-- =====================================================================
-- 3. Réserver : un repas par jour, créneaux et codes comptés sur la journée
-- =====================================================================
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
  reglages        public.reglages_file;
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
  if menu_choisi.retire then
    return public.reponse_refus('Ce plat a été retiré du menu.');
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

  -- Un seul repas par jour, quel que soit le plat choisi
  if exists (
    select 1 from public.reservations
    where eleve_id = auth.uid() and jour = menu_choisi.jour and statut <> 'annulee'
  ) then
    return public.reponse_refus('Tu as déjà ton repas ce jour-là. Annule-le dans Mes repas pour changer de plat.');
  end if;

  -- Créneau de passage : un des 7 créneaux, et pas au plafond (75 % de ce que les guichets servent en 10 min)
  if p_creneau is not null then
    if p_creneau not in (time '11:50', time '12:00', time '12:10', time '12:20', time '12:30', time '12:40', time '12:50') then
      return public.reponse_refus('Ce créneau n''existe pas.');
    end if;
    select * into reglages from public.reglages_file where id = 1;
    if (
      select count(*) from public.reservations
      where jour = menu_choisi.jour and creneau = p_creneau and statut <> 'annulee'
    ) >= public.plafond_creneau(reglages) then
      return public.reponse_refus('Ce créneau est complet : choisis-en un autre.');
    end if;
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
      where jour = menu_choisi.jour and code_retrait = nouveau_code and statut <> 'annulee'
    );
  end loop;

  insert into public.reservations (eleve_id, menu_id, jour, code_retrait, montant, creneau, alternative)
  values (auth.uid(), p_menu_id, menu_choisi.jour, nouveau_code, prix_a_payer, p_creneau, coalesce(p_alternative, false));

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
    return public.reponse_refus('Tu as déjà ton repas ce jour-là. Annule-le dans Mes repas pour changer de plat.');
end;
$$;

revoke execute on function public.reserver(bigint, time, boolean, boolean) from public, anon;
grant  execute on function public.reserver(bigint, time, boolean, boolean) to authenticated;

-- =====================================================================
-- 4. Prévision : la moyenne des semaines passées se calcule par jour (tous plats confondus)
-- =====================================================================
create or replace function public.prevision_du_jour(p_jour date)
returns table (reserves integer, moyenne numeric, prevision integer, conseille integer)
language sql
stable
security definer
set search_path = public
as $$
  with deja_reserves as (
    select count(*)::integer as nombre
    from public.reservations r
    join public.menus m on m.id = r.menu_id
    where m.jour = p_jour and r.statut <> 'annulee'
  ),
  semaines_passees as (
    select avg(nombre) as moyenne
    from (
      select count(r.id) as nombre
      from public.menus m
      left join public.reservations r on r.menu_id = m.id and r.statut <> 'annulee'
      where m.jour in (p_jour - 7, p_jour - 14, p_jour - 21, p_jour - 28)
      group by m.jour
    ) jours
  ),
  calcul as (
    select
      d.nombre as reserves,
      round(coalesce(s.moyenne, 0), 1) as moyenne,
      greatest(d.nombre, round(coalesce(s.moyenne, 0))::integer) as prevision
    from deja_reserves d, semaines_passees s
  )
  select reserves, moyenne, prevision, ceil(prevision * 1.05)::integer
  from calcul;
$$;


revoke execute on function public.prevision_du_jour(date) from public, anon, authenticated;

-- =====================================================================
-- 5. Dupliquer un plat : refusé seulement si ce même plat est déjà au menu ce jour-là
-- =====================================================================
create or replace function public.dupliquer_menu(p_menu_id bigint, p_jour date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  nouvel_id bigint;
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  if p_jour is null then
    return 'Choisissez la date du nouveau menu.';
  end if;
  if p_jour < (now() at time zone 'Africa/Abidjan')::date then
    return 'Choisissez aujourd''hui ou un jour à venir.';
  end if;
  if exists (
    select 1 from public.menus copie, public.menus source
    where source.id = p_menu_id and copie.jour = p_jour and copie.plat = source.plat
  ) then
    return 'Ce plat est déjà au menu ce jour-là.';
  end if;

  insert into public.menus (
    jour, entree, plat, dessert, boisson, allergenes, prix, prix_employe, photo_url,
    plat_alternatif, photo_alternative, allergenes_alternatif, contenu, contenu_alternatif
  )
  select
    p_jour, entree, plat, dessert, boisson, allergenes, prix, prix_employe, photo_url,
    plat_alternatif, photo_alternative, allergenes_alternatif, contenu, contenu_alternatif
  from public.menus where id = p_menu_id
  returning id into nouvel_id;

  if nouvel_id is null then
    return 'Ce menu n''existe plus.';
  end if;

  insert into public.ingredients_par_menu (menu_id, ingredient_id, quantite_par_repas)
  select nouvel_id, ingredient_id, quantite_par_repas from public.ingredients_par_menu where menu_id = p_menu_id;

  return 'ok';
exception
  when unique_violation then
    return 'Ce plat est déjà au menu ce jour-là.';
end;
$$;

revoke execute on function public.dupliquer_menu(bigint, date) from public, anon;
grant  execute on function public.dupliquer_menu(bigint, date) to authenticated;
