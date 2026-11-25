-- Audit du 25/11 : verrouillage du profil (tarif et profil alimentaire seulement par RPC), rapport d'activité du mois, droits resserrés. Relançable sans erreur.

-- =====================================================================
-- 13. AUDIT : SÉCURITÉ DU PROFIL ET RAPPORT D'ACTIVITÉ (aussi disponible seul : patch_audit.sql)
-- =====================================================================

-- Le profil ne se modifie plus en direct depuis l'appli : un employé ne peut pas se repasser « élève »
-- pour payer 1 000 F au lieu de 1 500 F, et le profil alimentaire passe par modifier_profil_alimentaire().
create or replace function public.proteger_colonnes_profil()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role
          or new.solde is distinct from old.solde
          or new.email is distinct from old.email
          or new.id is distinct from old.id
          or new.type_usager is distinct from old.type_usager
          or new.allergies is distinct from old.allergies
          or new.regime is distinct from old.regime
          or new.autre_allergie is distinct from old.autre_allergie) then
    raise exception 'Le rôle, le tarif, le solde et le profil alimentaire se modifient seulement par les fonctions prévues.';
  end if;
  return new;
end;
$$;

-- Fonction de déclencheur : chemin de recherche fixé (alerte du conseiller de sécurité Supabase)
create or replace function public.limiter_codages()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.codages where avis_id = new.avis_id) >= 3 then
    raise exception 'Un avis a au plus 3 thèmes.';
  end if;
  return new;
end;
$$;

-- Les visiteurs non connectés n'appellent plus aucune fonction interne
revoke execute on function public.mon_role()          from public, anon;
revoke execute on function public.est_parent_de(uuid) from public, anon;
revoke execute on function public.creer_profil()      from public, anon, authenticated;
grant  execute on function public.mon_role()          to authenticated;
grant  execute on function public.est_parent_de(uuid) to authenticated;

-- Admin : rapport d'activité jour par jour sur une période (par défaut le mois en cours).
-- Une ligne par jour de menu : plat, réservés, servis, non venus, recettes, note moyenne et nombre d'avis.
create or replace function public.rapport_activite(p_debut date default null, p_fin date default null)
returns table (
  jour        date,
  plat        text,
  reserves    integer,
  servis      integer,
  non_venus   integer,
  recettes    integer,
  note        numeric,
  nombre_avis integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  aujourdhui date := (now() at time zone 'Africa/Abidjan')::date;
  debut      date := coalesce(p_debut, date_trunc('month', aujourdhui)::date);
  fin        date := coalesce(p_fin, aujourdhui);
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;
  if fin < debut or fin - debut > 366 then
    return;
  end if;

  return query
  select
    m.jour,
    m.plat,
    count(r.id)::integer,
    count(r.id) filter (where r.statut = 'servie')::integer,
    count(r.id) filter (where r.statut = 'reservee' and m.jour < aujourdhui)::integer,
    coalesce(sum(r.montant), 0)::integer,
    (select round(avg(a.etoiles), 1) from public.avis a where a.menu_id = m.id),
    (select count(*)::integer from public.avis a where a.menu_id = m.id)
  from public.menus m
  left join public.reservations r on r.menu_id = m.id and r.statut <> 'annulee'
  where m.jour between debut and fin
  group by m.id, m.jour, m.plat
  order by m.jour;
end;
$$;

revoke execute on function public.rapport_activite(date, date) from public, anon;
grant  execute on function public.rapport_activite(date, date) to authenticated;
