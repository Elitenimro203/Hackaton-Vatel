-- CantiJuste : données de DÉMONSTRATION du module « Files d'attente ». Relançable (Supabase > SQL Editor).
-- À lancer APRÈS patch_file_attente.sql, donnees_demo.sql et historique_demo.sql.
-- 1. Donne un créneau aux réservations de démo qui n'en ont pas (convives du jour et historique), selon le profil
--    « 30 % d'adhésion » (section 4 du module) : 0,7 × profil « avant » + 0,3 × profil « lissé », pour 300 élèves :
--    11 h 50 : 20,5 · 12 h 00 : 97,5 · 12 h 10 : 62,5 · 12 h 20 : 41,5 · 12 h 30 : 34,5 · 12 h 40 : 27,5 · 12 h 50 : 16.
-- 2. Remplit la semaine prochaine (lundi à vendredi, si les menus existent) avec environ 185 réservations par jour
--    des convives histo001..240, pour que l'élève démo voie des créneaux chargés et des créneaux calmes.
-- Les comptes démo (élève, parent, admin) ne sont pas touchés.

-- =====================================================================
-- 1. CRÉNEAUX DES RÉSERVATIONS DE DÉMO DÉJÀ FAITES
-- =====================================================================
with rangs as (
  select
    r.id,
    (row_number() over (partition by r.menu_id order by md5(r.id::text)) - 0.5)
      / count(*) over (partition by r.menu_id) as position
  from public.reservations r
  join public.profiles p on p.id = r.eleve_id
  where p.email like '%@demo.cantijuste.ci'
    and r.creneau is null
)
update public.reservations r
set creneau = case
    when rangs.position < 20.5 / 300 then time '11:50'
    when rangs.position < 118.0 / 300 then time '12:00'
    when rangs.position < 180.5 / 300 then time '12:10'
    when rangs.position < 222.0 / 300 then time '12:20'
    when rangs.position < 256.5 / 300 then time '12:30'
    when rangs.position < 284.0 / 300 then time '12:40'
    else time '12:50'
  end
from rangs
where r.id = rangs.id;

-- =====================================================================
-- 2. LA SEMAINE PROCHAINE : réservations des convives de l'historique, déjà réparties sur les créneaux
-- =====================================================================
with jours as (
  select distinct m.jour,
    (array[190, 180, 205, 196, 184])[extract(isodow from m.jour)::integer] - 8
      + abs(hashtext('semaine-' || m.jour)) % 9 as nombre_du_jour
  from public.menus m
  where not m.retire and m.jour between date_trunc('week', (now() at time zone 'Africa/Abidjan')::date)::date + 7
                   and date_trunc('week', (now() at time zone 'Africa/Abidjan')::date)::date + 11
),
tirage as (
  select
    j.*,
    p.id as eleve_id,
    p.type_usager,
    row_number() over (partition by j.jour order by md5(j.jour || '-' || p.email)) as rang,
    abs(hashtext('heure-' || j.jour || p.email)) % 240 as minutes
  from jours j
  cross join public.profiles p
  where p.email like 'histo___@demo.cantijuste.ci'
)
insert into public.reservations (eleve_id, menu_id, statut, code_retrait, montant, alternative, creneau, cree_le)
select
  t.eleve_id,
  choix.id,
  'reservee',
  (3000 + t.rang)::text,
  case when t.type_usager = 'employe' then choix.prix_employe else choix.prix end,
  t.rang % 6 = 0,
  case
    when ((t.rang - 0.5) / t.nombre_du_jour) < 20.5 / 300 then time '11:50'
    when ((t.rang - 0.5) / t.nombre_du_jour) < 118.0 / 300 then time '12:00'
    when ((t.rang - 0.5) / t.nombre_du_jour) < 180.5 / 300 then time '12:10'
    when ((t.rang - 0.5) / t.nombre_du_jour) < 222.0 / 300 then time '12:20'
    when ((t.rang - 0.5) / t.nombre_du_jour) < 256.5 / 300 then time '12:30'
    when ((t.rang - 0.5) / t.nombre_du_jour) < 284.0 / 300 then time '12:40'
    else time '12:50'
  end,
  (now() at time zone 'Africa/Abidjan')::date - 1 + time '09:00' + make_interval(mins => t.minutes)
from tirage t
-- Chaque convive prend un des plats du jour (même tirage à chaque relance)
cross join lateral (
  select m.id, m.prix, m.prix_employe from public.menus m
  where m.jour = t.jour and not m.retire
  order by m.id
  offset abs(hashtext('choix-' || t.jour || t.eleve_id)) % (select count(*) from public.menus m2 where m2.jour = t.jour and not m2.retire)
  limit 1
) choix
where t.rang <= t.nombre_du_jour
on conflict do nothing;

-- Leurs paiements : une recharge Wave par semaine et un débit par repas (mêmes règles que historique_demo.sql)
insert into public.mouvements (eleve_id, montant, motif, cree_le)
select distinct on (r.eleve_id, date_trunc('week', m.jour))
  r.eleve_id,
  5 * case when p.type_usager = 'employe' then m.prix_employe else m.prix end,
  'Recharge Wave',
  (date_trunc('week', m.jour)::date - 1 + time '19:00') at time zone 'Africa/Abidjan'
from public.reservations r
join public.menus m on m.id = r.menu_id
join public.profiles p on p.id = r.eleve_id
where p.email like 'histo___@demo.cantijuste.ci'
  and r.statut <> 'annulee'
  and not exists (
    select 1 from public.mouvements mv
    where mv.eleve_id = r.eleve_id
      and mv.motif = 'Recharge Wave'
      and mv.cree_le = (date_trunc('week', m.jour)::date - 1 + time '19:00') at time zone 'Africa/Abidjan'
  )
order by r.eleve_id, date_trunc('week', m.jour);

insert into public.mouvements (eleve_id, montant, motif, cree_le)
select r.eleve_id, -r.montant, 'Repas : ' || case when r.alternative then m.plat_alternatif else m.plat end, r.cree_le
from public.reservations r
join public.menus m on m.id = r.menu_id
join public.profiles p on p.id = r.eleve_id
where p.email like 'histo___@demo.cantijuste.ci'
  and r.statut <> 'annulee'
  and not exists (
    select 1 from public.mouvements mv
    where mv.eleve_id = r.eleve_id and mv.montant = -r.montant and mv.cree_le = r.cree_le
  );

-- Le solde de chaque convive = somme de ses mouvements (jamais négatif : chaque semaine est payée d'avance)
update public.profiles p
set solde = coalesce((select sum(mv.montant) from public.mouvements mv where mv.eleve_id = p.id), 0)
where p.email like 'histo___@demo.cantijuste.ci';

-- =====================================================================
-- Vérification : l'affluence de lundi prochain, créneau par créneau (le plafond est de 45 avec 2 guichets)
-- =====================================================================
select * from public.affluence_creneaux(date_trunc('week', (now() at time zone 'Africa/Abidjan')::date)::date + 7);
