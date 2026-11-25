-- Patch passage au comptoir : marquer_servie() renvoie le prénom, le plat et les allergies ; commandes_du_jour() pour l'écran admin. Relançable.

-- =====================================================================
-- 1. SERVIR UN REPAS AVEC LE CODE DE RETRAIT (admin, réservation du jour seulement)
-- Renvoie un JSON { ok, resultat, message, prenom, plat, allergies, code_retrait, jour } :
-- resultat vaut 'servi', 'deja_servi', 'pas_aujourdhui', 'inconnu' ou 'refuse'.
-- =====================================================================

-- L'ancienne version renvoyait un texte : on la supprime pour changer le type de retour
drop function if exists public.marquer_servie(text);

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
  if public.mon_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'resultat', 'refuse', 'message', 'Réservé à l''administrateur.');
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

  return jsonb_build_object(
    'ok', true, 'resultat', 'servi', 'message', 'Servi',
    'prenom', split_part(trim(nom_complet), ' ', 1), 'plat', plat_servi,
    'allergies', to_jsonb(coalesce(allergies_eleve, '{}')), 'code_retrait', code_nettoye, 'jour', aujourdhui
  );
end;
$$;

-- =====================================================================
-- 2. COMMANDES D'UN JOUR DE SERVICE (admin) : une ligne par réservation active
-- =====================================================================
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
  if public.mon_role() is distinct from 'admin' then
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

-- =====================================================================
-- 3. DROITS : seulement un utilisateur connecté (le rôle admin est vérifié dans les fonctions)
-- =====================================================================
revoke execute on function public.marquer_servie(text)     from public, anon;
revoke execute on function public.commandes_du_jour(date)  from public, anon;
grant  execute on function public.marquer_servie(text)     to authenticated;
grant  execute on function public.commandes_du_jour(date)  to authenticated;
