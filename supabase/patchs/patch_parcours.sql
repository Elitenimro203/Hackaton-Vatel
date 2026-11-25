-- =====================================================================
-- PATCH PARCOURS (25/11/2026) : rôle Cantine pour le comptoir, lecture d'un ticket sans le servir,
-- absence signalée le jour même (moitié rendue). À coller tel quel dans Supabase > SQL Editor (relançable).
-- =====================================================================

-- 1. RÔLE CANTINE : le personnel du comptoir sert les repas sans voir les finances, les menus ni les stocks
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('eleve', 'parent', 'admin', 'cantine'));

-- Vrai pour l'admin et le personnel du comptoir
create or replace function public.est_personnel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.mon_role() in ('admin', 'cantine'), false);
$$;

-- Le comptoir lit les réservations (temps réel des compteurs) ; l'écriture reste réservée aux fonctions RPC
drop policy if exists reservations_lecture on public.reservations;
create policy reservations_lecture on public.reservations
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.est_personnel());

-- 2. SERVICE : mêmes fonctions qu'avant, ouvertes à l'admin ET au rôle cantine
create or replace function public.marquer_servie(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code_nettoye   text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  aujourdhui     date := (now() at time zone 'Africa/Abidjan')::date;
  resa           public.reservations;
  nom_complet    text;
  allergies_eleve text[];
  plat_servi     text;
  autre_jour     date;
begin
  if not public.est_personnel() then
    return jsonb_build_object('ok', false, 'resultat', 'refuse', 'message', 'Réservé au personnel de la cantine.');
  end if;

  if code_nettoye !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Le code doit avoir 4 chiffres.');
  end if;

  -- La réservation du jour avec ce code (verrouillée pour éviter de servir deux fois en même temps)
  select r.* into resa
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  where r.code_retrait = code_nettoye
    and r.statut <> 'annulee'
    and m.jour = aujourdhui
  for update of r;

  if not found then
    -- Le code existe-t-il pour un autre jour ?
    select m.jour into autre_jour
    from public.reservations r
    join public.menus m on m.id = r.menu_id
    where r.code_retrait = code_nettoye
      and r.statut <> 'annulee'
    order by abs(m.jour - aujourdhui)
    limit 1;

    if autre_jour is not null then
      return jsonb_build_object(
        'ok', false, 'resultat', 'pas_aujourdhui', 'message', 'Pas pour aujourd''hui',
        'code_retrait', code_nettoye, 'jour', autre_jour
      );
    end if;
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Code inconnu', 'code_retrait', code_nettoye);
  end if;

  select p.nom, p.allergies, case when resa.alternative then m.plat_alternatif else m.plat end
  into nom_complet, allergies_eleve, plat_servi
  from public.profiles p, public.menus m
  where p.id = resa.eleve_id and m.id = resa.menu_id;

  if resa.statut = 'servie' then
    return jsonb_build_object(
      'ok', false, 'resultat', 'deja_servi', 'message', 'Déjà servi',
      'prenom', split_part(trim(nom_complet), ' ', 1), 'plat', plat_servi,
      'allergies', to_jsonb(coalesce(allergies_eleve, '{}')), 'code_retrait', code_nettoye, 'jour', aujourdhui
    );
  end if;

  update public.reservations set statut = 'servie', servie_le = now() where id = resa.id;

  -- Stock : les ingrédients de la recette du menu sont déduits (jamais sous 0, une seule fois par réservation
  -- grâce à l'index unique de mouvements_stock). Si un ingrédient manque, le repas est servi quand même.
  with retraits as (
    select i.id as ingredient_id, least(r.quantite_par_repas, i.quantite) as retire
    from public.ingredients_par_menu r
    join public.ingredients i on i.id = r.ingredient_id
    where r.menu_id = resa.menu_id
    for update of i
  ),
  enregistres as (
    insert into public.mouvements_stock (ingredient_id, quantite, motif, reservation_id)
    select ingredient_id, -retire, 'Repas servi', resa.id
    from retraits
    where retire > 0
    on conflict do nothing
    returning ingredient_id, -quantite as retire
  )
  update public.ingredients i
  set quantite = i.quantite - e.retire
  from enregistres e
  where i.id = e.ingredient_id;

  return jsonb_build_object(
    'ok', true, 'resultat', 'servi', 'message', 'Servi',
    'prenom', split_part(trim(nom_complet), ' ', 1), 'plat', plat_servi,
    'allergies', to_jsonb(coalesce(allergies_eleve, '{}')), 'code_retrait', code_nettoye, 'jour', aujourdhui
  );
end;
$$;

create or replace function public.commandes_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  plat           text,
  photo_url      text,
  alternative    boolean,
  code_retrait   text,
  statut         text,
  servie_le      timestamptz,
  allergies      text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_personnel() then
    return;
  end if;

  return query
  select
    r.id,
    p.nom,
    case when r.alternative then m.plat_alternatif else m.plat end,
    case when r.alternative then coalesce(nullif(m.photo_alternative, ''), m.photo_url) else m.photo_url end,
    r.alternative,
    r.code_retrait,
    r.statut,
    r.servie_le,
    p.allergies
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
  order by p.nom, r.id;
end;
$$;

create or replace function public.allergies_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  allergies      text[],
  plat           text,
  alternative    boolean,
  risques        text[],
  code_retrait   text,
  regime         text,
  autre_allergie text,
  conflit_regime text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_personnel() then
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
    r.code_retrait,
    p.regime,
    p.autre_allergie,
    public.conflit_regime(
      p.regime,
      case when r.alternative then m.contenu_alternatif else m.contenu end,
      case when r.alternative then m.allergenes_alternatif else m.allergenes end
    )
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
    and (cardinality(p.allergies) > 0 or p.regime <> 'aucun' or p.autre_allergie <> '')
  order by 6 desc, 10 nulls last, p.nom;
end;
$$;

-- 3. LIRE UN TICKET SANS LE SERVIR : la carte de remise du comptoir (qui, quel plat, quelles allergies)
create or replace function public.lire_ticket(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  code_nettoye text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  aujourdhui   date := (now() at time zone 'Africa/Abidjan')::date;
  ticket       record;
  autre_jour   date;
begin
  if not public.est_personnel() then
    return jsonb_build_object('ok', false, 'resultat', 'refuse', 'message', 'Réservé au personnel de la cantine.');
  end if;
  if code_nettoye !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Le code doit avoir 4 chiffres.');
  end if;

  select r.id, r.statut, r.montant, r.creneau, r.servie_le, r.alternative,
         p.nom, p.type_usager, p.allergies, p.regime, p.autre_allergie,
         case when r.alternative then m.plat_alternatif else m.plat end as plat,
         case when r.alternative then coalesce(nullif(m.photo_alternative, ''), m.photo_url) else m.photo_url end as photo_url,
         case when r.alternative then m.allergenes_alternatif else m.allergenes end as allergenes_plat,
         m.plat_alternatif
  into ticket
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where r.code_retrait = code_nettoye
    and r.statut <> 'annulee'
    and m.jour = aujourdhui;

  if not found then
    select m.jour into autre_jour
    from public.reservations r
    join public.menus m on m.id = r.menu_id
    where r.code_retrait = code_nettoye and r.statut <> 'annulee'
    order by abs(m.jour - aujourdhui)
    limit 1;
    if autre_jour is not null then
      return jsonb_build_object('ok', false, 'resultat', 'pas_aujourdhui', 'message', 'Pas pour aujourd''hui',
        'code_retrait', code_nettoye, 'jour', autre_jour);
    end if;
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Code inconnu', 'code_retrait', code_nettoye);
  end if;

  return jsonb_build_object(
    'ok', ticket.statut = 'reservee',
    'resultat', case when ticket.statut = 'servie' then 'deja_servi' else 'a_remettre' end,
    'message', case when ticket.statut = 'servie' then 'Déjà servi' else 'À remettre' end,
    'code_retrait', code_nettoye,
    'nom', ticket.nom,
    'type_usager', ticket.type_usager,
    'plat', ticket.plat,
    'photo_url', ticket.photo_url,
    'montant', ticket.montant,
    'creneau', ticket.creneau,
    'servie_le', ticket.servie_le,
    'allergies', to_jsonb(coalesce(ticket.allergies, '{}')),
    'risques', to_jsonb(array(select unnest(coalesce(ticket.allergies, '{}')) intersect select unnest(coalesce(ticket.allergenes_plat, '{}')))),
    'regime', ticket.regime,
    'autre_allergie', ticket.autre_allergie,
    'plat_remplacement', case when ticket.alternative then '' else coalesce(ticket.plat_alternatif, '') end
  );
end;
$$;

-- 4. ABSENCE SIGNALÉE LE JOUR MÊME : après la veille 18 h et avant 10 h le jour du repas,
-- l'élève prévient qu'il ne viendra pas. La portion est déjà commandée : on lui rend la moitié.
create or replace function public.signaler_absence(p_reservation_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resa       public.reservations;
  jour_menu  date;
  nom_plat   text;
  rendu      integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Connecte-toi pour prévenir la cantine.');
  end if;

  select * into resa from public.reservations where id = p_reservation_id for update;
  if not found or resa.eleve_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'Réservation introuvable.');
  end if;
  if resa.statut <> 'reservee' then
    return jsonb_build_object('ok', false, 'message', 'Ce repas est déjà annulé ou servi.');
  end if;

  select jour, case when resa.alternative then plat_alternatif else plat end
  into jour_menu, nom_plat
  from public.menus where id = resa.menu_id;

  if now() < public.heure_limite(jour_menu) then
    return jsonb_build_object('ok', false, 'message', 'Tu peux encore annuler : tu récupères tout le montant.');
  end if;
  if now() >= (jour_menu + time '10:00') at time zone 'Africa/Abidjan' then
    return jsonb_build_object('ok', false, 'message', 'Trop tard : on prévient la cantine avant 10 h le jour du repas.');
  end if;

  rendu := resa.montant / 2;
  update public.reservations set statut = 'annulee' where id = resa.id;
  update public.profiles set solde = solde + rendu where id = resa.eleve_id;
  insert into public.mouvements (eleve_id, montant, motif)
  values (resa.eleve_id, rendu, 'Absence signalée : ' || nom_plat || ' (moitié rendue)');

  return jsonb_build_object('ok', true, 'message', 'La cantine est prévenue.', 'rendu', rendu);
end;
$$;

-- 5. DROITS : personne n'appelle ces fonctions sans être connecté
revoke execute on function public.est_personnel()               from public, anon;
revoke execute on function public.marquer_servie(text)          from public, anon;
revoke execute on function public.commandes_du_jour(date)       from public, anon;
revoke execute on function public.allergies_du_jour(date)       from public, anon;
revoke execute on function public.lire_ticket(text)             from public, anon;
revoke execute on function public.signaler_absence(bigint)      from public, anon;
grant  execute on function public.est_personnel()               to authenticated;
grant  execute on function public.marquer_servie(text)          to authenticated;
grant  execute on function public.commandes_du_jour(date)       to authenticated;
grant  execute on function public.allergies_du_jour(date)       to authenticated;
grant  execute on function public.lire_ticket(text)             to authenticated;
grant  execute on function public.signaler_absence(bigint)      to authenticated;
