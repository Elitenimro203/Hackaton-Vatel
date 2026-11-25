-- CantiJuste : calculs du tableau de bord admin (onglet Pilotage). Relançable sans erreur (Supabase > SQL Editor).
-- Tout est calculé ici, React ne fait qu'afficher. Chaque fonction vérifie le rôle admin.

-- =====================================================================
-- Aide interne : prévision d'un jour de service
--   réservés  = réservations déjà faites pour ce jour
--   moyenne   = moyenne des réservations des 4 mêmes jours de semaine précédents (jours avec menu)
--   prévision = le plus grand des deux ; conseillé = prévision + 5 % de marge, arrondi au-dessus
-- Pas appelable depuis l'appli : seules les fonctions admin ci-dessous s'en servent.
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
      group by m.id
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
-- Admin : prévision de la semaine prochaine (lundi à vendredi)
-- =====================================================================
create or replace function public.prevision_semaine(p_jour date default null)
returns table (jour date, reserves integer, moyenne numeric, prevision integer, conseille integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lundi_prochain date := date_trunc('week', coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date))::date + 7;
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;

  return query
  select lundi_prochain + ecart, p.reserves, p.moyenne, p.prevision, p.conseille
  from generate_series(0, 4) as ecart
  cross join lateral public.prevision_du_jour(lundi_prochain + ecart) p
  order by ecart;
end;
$$;

-- =====================================================================
-- Admin : chiffres clés du mois (services déjà terminés, donc avant aujourd'hui)
--   taux de gaspillage = repas réservés mais pas servis / repas réservés
--   repas évités = ce que jetterait une cantine sans réservation (elle prépare 15 % de trop)
--                  moins ce que la cantine a vraiment perdu (réservés non servis)
--   évolution = variation du taux de gaspillage par rapport au mois précédent, en %
--   repas à préparer = quantité conseillée pour le prochain jour ouvré
-- =====================================================================
create or replace function public.chiffres_pilotage(p_jour date default null)
returns table (
  reserves_mois         integer,
  servis_mois           integer,
  taux_gaspillage       numeric,
  taux_mois_precedent   numeric,
  evolution_pertes      numeric,
  repas_evites          integer,
  prix_moyen            integer,
  fcfa_evites           integer,
  surplus_sans_resa     integer,
  jour_a_preparer       date,
  repas_a_preparer      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  aujourdhui    date := coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date);
  debut_mois    date := date_trunc('month', aujourdhui)::date;
  debut_avant   date := (date_trunc('month', aujourdhui) - interval '1 month')::date;
  surplus       numeric := 0.15;
  prochain_jour date := aujourdhui + 1;
  r_mois integer; s_mois integer; r_avant integer; s_avant integer; prix integer;
  taux numeric; taux_avant numeric; evites integer;
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;

  -- Ce mois-ci, jusqu'à hier
  select count(*)::integer, count(*) filter (where r.statut = 'servie')::integer, round(avg(r.montant))::integer
  into r_mois, s_mois, prix
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  where m.jour >= debut_mois and m.jour < aujourdhui and r.statut <> 'annulee';

  -- Le mois précédent, en entier
  select count(*)::integer, count(*) filter (where r.statut = 'servie')::integer
  into r_avant, s_avant
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  where m.jour >= debut_avant and m.jour < debut_mois and r.statut <> 'annulee';

  taux := case when r_mois > 0 then round(100.0 * (r_mois - s_mois) / r_mois, 1) end;
  taux_avant := case when r_avant > 0 then round(100.0 * (r_avant - s_avant) / r_avant, 1) end;
  evites := greatest(0, round(surplus * s_mois - (r_mois - s_mois)))::integer;
  prix := coalesce(prix, 1000);

  -- Prochain jour ouvré (le samedi et le dimanche, on passe au lundi)
  while extract(isodow from prochain_jour) > 5 loop
    prochain_jour := prochain_jour + 1;
  end loop;

  return query
  select
    r_mois,
    s_mois,
    taux,
    taux_avant,
    case when taux_avant > 0 then round(100.0 * (taux - taux_avant) / taux_avant) end,
    evites,
    prix,
    evites * prix,
    (surplus * 100)::integer,
    prochain_jour,
    (select p.conseille from public.prevision_du_jour(prochain_jour) p);
end;
$$;

-- =====================================================================
-- Admin : repas réservés et servis par jour de service, sur les 4 dernières semaines (avant aujourd'hui)
-- =====================================================================
create or replace function public.historique_service(p_jour date default null, p_semaines integer default 4)
returns table (jour date, reserves integer, servis integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  aujourdhui date := coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date);
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;

  return query
  select
    m.jour,
    count(r.id)::integer,
    count(r.id) filter (where r.statut = 'servie')::integer
  from public.menus m
  left join public.reservations r on r.menu_id = m.id and r.statut <> 'annulee'
  where m.jour >= aujourdhui - 7 * least(greatest(p_semaines, 1), 12)
    and m.jour < aujourdhui
    and extract(isodow from m.jour) <= 5
  group by m.jour
  order by m.jour;
end;
$$;

-- =====================================================================
-- Admin : les plats les mieux notés (3 avis minimum), avec la photo du dernier menu qui les proposait
-- =====================================================================
create or replace function public.favoris_cantine(p_limite integer default 3)
returns table (plat text, photo_url text, note numeric, nombre_avis integer)
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
    a.plat,
    (
      select case when m.plat = a.plat then m.photo_url else coalesce(nullif(m.photo_alternative, ''), m.photo_url) end
      from public.menus m
      where m.plat = a.plat or m.plat_alternatif = a.plat
      order by m.jour desc
      limit 1
    ),
    round(avg(a.etoiles), 1),
    count(*)::integer
  from public.avis a
  group by a.plat
  having count(*) >= 3
  order by round(avg(a.etoiles), 1) desc, count(*) desc
  limit least(greatest(p_limite, 1), 10);
end;
$$;

revoke execute on function public.prevision_semaine(date)              from public, anon;
revoke execute on function public.chiffres_pilotage(date)              from public, anon;
revoke execute on function public.historique_service(date, integer)    from public, anon;
revoke execute on function public.favoris_cantine(integer)             from public, anon;
grant  execute on function public.prevision_semaine(date)              to authenticated;
grant  execute on function public.chiffres_pilotage(date)              to authenticated;
grant  execute on function public.historique_service(date, integer)    to authenticated;
grant  execute on function public.favoris_cantine(integer)             to authenticated;
