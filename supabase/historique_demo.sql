-- CantiJuste : historique de DÉMONSTRATION pour le tableau de bord (4 semaines de jours ouvrés avant aujourd'hui).
-- À lancer dans Supabase > SQL Editor APRÈS schema.sql et donnees_demo.sql. Relançable : rien n'est créé deux fois.
-- Tout ce que crée ce script est étiqueté démo :
--   - 240 convives histo001@demo.cantijuste.ci à histo240@demo.cantijuste.ci (comptes sans mot de passe, impossibles à utiliser) ;
--   - leurs réservations passées (codes de retrait 3001 à 3240), leurs mouvements et leurs avis.
-- Les comptes démo (élève, parent, admin) et le service du jour créé par donnees_demo.sql ne sont pas touchés.
-- Histoire racontée : environ 200 repas par jour, de plus en plus de réservations, et un gaspillage
-- (réservés mais pas servis) qui baisse d'une semaine à l'autre, de 8 % à 5 % (environ 6 % en moyenne).

-- =====================================================================
-- 1. LES 240 CONVIVES DE L'HISTORIQUE (1 sur 12 est un employé, au prix employé)
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select
  '00000000-0000-0000-0000-000000000000',
  md5('cantijuste-histo-' || numero)::uuid,
  'authenticated', 'authenticated',
  'histo' || lpad(numero::text, 3, '0') || '@demo.cantijuste.ci',
  '', now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object(
    'nom', (array['Awa', 'Koffi', 'Mariam', 'Yao', 'Fatou', 'Serge', 'Aïcha', 'Ibrahim', 'Grâce', 'Moussa', 'Esther', 'Didier',
                  'Nadia', 'Paul', 'Salimata', 'Hervé', 'Raïssa', 'Cédric', 'Adjoua', 'Lamine'])[1 + numero % 20]
           || ' ' ||
           (array['Kouassi', 'Traoré', 'N''Guessan', 'Diallo', 'Brou', 'Ouattara', 'Kouadio', 'Bamba', 'Yapi', 'Aka', 'Cissé', 'Gnagne'])[1 + (numero / 20) % 12],
    'role', 'eleve',
    'type_usager', case when numero % 12 = 0 then 'employe' else 'eleve' end
  ),
  now(), now(), '', '', '', ''
from generate_series(1, 240) as numero
on conflict (id) do nothing;

-- =====================================================================
-- 2. LES MENUS PASSÉS (seulement les jours ouvrés sans menu : un menu déjà saisi est gardé)
-- =====================================================================
with jours as (
  select
    jour::date as jour,
    (jour::date - ((now() at time zone 'Africa/Abidjan')::date - 28)) / 7 as semaine,
    row_number() over (order by jour) - 1 as rang
  from generate_series((now() at time zone 'Africa/Abidjan')::date - 28,
                       (now() at time zone 'Africa/Abidjan')::date - 1, interval '1 day') as jour
  where extract(isodow from jour) <= 5
),
plats (numero, entree, plat, dessert, allergenes, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif) as (
  values
    (0, 'Salade de tomates', 'Garba maison',           'Ananas frais', '{poisson}'::text[],  '/photos/garba-maison.jpg',           'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[]),
    (1, 'Concombre',         'Riz sauce arachide',     'Banane',       '{arachide}'::text[], '/photos/riz-sauce-arachide.jpg',     'Attiéké poisson braisé', '/photos/attieke-poisson-braise.jpg', '{poisson}'::text[]),
    (2, 'Carottes râpées',   'Attiéké poisson braisé', 'Papaye',       '{poisson}'::text[],  '/photos/attieke-poisson-braise.jpg', 'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[]),
    (3, 'Avocat',            'Kédjénou de poulet',     'Mangue',       '{}'::text[],         '/photos/kedjenou-poulet.jpg',        'Garba maison',           '/photos/garba-maison.jpg',           '{poisson}'::text[]),
    (4, 'Chou',              'Garba au piment doux',   'Orange',       '{poisson}'::text[],  '/photos/garba-piment-doux.jpg',      'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[])
)
insert into public.menus (jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif)
select j.jour, p.entree, p.plat, p.dessert, p.allergenes, 1000, 1500, p.photo_url, p.plat_alternatif, p.photo_alternative, p.allergenes_alternatif
from jours j
join plats p on p.numero = (j.rang + j.semaine) % 5
where not exists (select 1 from public.menus m where m.jour = j.jour);

-- =====================================================================
-- 3. LES RÉSERVATIONS PASSÉES
-- Nombre du jour = base du jour de semaine + hausse semaine après semaine + petite variation.
-- Absents (réservé mais pas servi = gaspillage) : 8 %, 7 %, 6 %, puis 5 % selon la semaine, à peu près.
-- Les tirages au sort sont calculés à partir du jour et du convive : la relance donne exactement la même chose.
-- =====================================================================
with jours as (
  select
    m.id as menu_id,
    m.jour,
    m.prix,
    m.prix_employe,
    (m.jour - ((now() at time zone 'Africa/Abidjan')::date - 28)) / 7 as semaine
  from public.menus m
  where m.jour >= (now() at time zone 'Africa/Abidjan')::date - 28
    and m.jour < (now() at time zone 'Africa/Abidjan')::date
    and extract(isodow from m.jour) <= 5
),
objectifs as (
  select
    j.*,
    (array[198, 188, 214, 204, 192])[extract(isodow from j.jour)::integer]
      + (array[-12, -5, 2, 7])[j.semaine + 1]
      + abs(hashtext('volume-' || j.jour)) % 17 - 8 as nombre_du_jour,
    (array[80, 68, 58, 50])[j.semaine + 1] as absents_pour_mille
  from jours j
),
tirage as (
  select
    o.*,
    p.id as eleve_id,
    p.type_usager,
    row_number() over (partition by o.menu_id order by md5(o.jour || '-' || p.email)) as rang,
    abs(hashtext('absent-' || o.jour || p.email)) % 1000 as de_absence,
    abs(hashtext('heure-' || o.jour || p.email)) % 120 as minutes
  from objectifs o
  cross join public.profiles p
  where p.email like 'histo___@demo.cantijuste.ci'
)
insert into public.reservations (eleve_id, menu_id, statut, code_retrait, montant, alternative, cree_le, servie_le)
select
  t.eleve_id,
  t.menu_id,
  case when t.de_absence < t.absents_pour_mille then 'reservee' else 'servie' end,
  (3000 + t.rang)::text,
  case when t.type_usager = 'employe' then t.prix_employe else t.prix end,
  t.rang % 6 = 0,
  (t.jour - 1 + time '16:00' + make_interval(mins => t.minutes)) at time zone 'Africa/Abidjan',
  case when t.de_absence >= t.absents_pour_mille
       then (t.jour + time '12:00' + make_interval(mins => t.minutes)) at time zone 'Africa/Abidjan' end
from tirage t
where t.rang <= t.nombre_du_jour
on conflict do nothing;

-- =====================================================================
-- 4. LES MOUVEMENTS : une recharge Wave chaque lundi (de quoi payer 5 repas), puis un débit par repas
-- =====================================================================
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
-- 5. QUELQUES AVIS (environ 1 repas servi sur 8), avec une note moyenne propre à chaque plat
-- =====================================================================
with servis as (
  select
    r.eleve_id,
    r.menu_id,
    r.servie_le,
    case when r.alternative then m.plat_alternatif else m.plat end as plat,
    abs(hashtext('avis-' || r.id)) % 100 as de_avis,
    abs(hashtext('note-' || r.eleve_id || r.menu_id)) % 100 as de_note
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where p.email like 'histo___@demo.cantijuste.ci'
    and r.statut = 'servie'
),
-- Seuils (sur 100) : 5 étoiles en dessous du 1er, 4 en dessous du 2e, 3 en dessous du 3e, sinon 2
seuils (plat, seuil_5, seuil_4, seuil_3) as (
  values
    ('Attiéké poisson braisé', 82, 96, 100),
    ('Garba maison',           75, 95, 100),
    ('Kédjénou de poulet',     68, 94, 100),
    ('Garba au piment doux',   52, 90, 100),
    ('Riz sauce arachide',     45, 88, 98)
),
notes as (
  select
    s.*,
    case
      when s.de_note < coalesce(t.seuil_5, 50) then 5
      when s.de_note < coalesce(t.seuil_4, 85) then 4
      when s.de_note < coalesce(t.seuil_3, 97) then 3
      else 2
    end as etoiles
  from servis s
  left join seuils t on t.plat = s.plat
  where s.de_avis < 12
)
insert into public.avis (eleve_id, menu_id, plat, etoiles, commentaire, source, cree_le)
select
  n.eleve_id,
  n.menu_id,
  n.plat,
  n.etoiles,
  case
    when n.de_avis % 3 <> 0 then null
    when n.etoiles = 5 then (array['Un régal, comme à la maison.', 'Portion généreuse, rien à jeter.', 'Le meilleur plat de la semaine !'])[1 + n.de_note % 3]
    when n.etoiles = 4 then (array['Très bon, un peu plus de sauce svp.', 'Bon et chaud, service rapide.'])[1 + n.de_note % 2]
    else (array['Un peu trop salé aujourd''hui.', 'Portion un peu petite.'])[1 + n.de_note % 2]
  end,
  'appli',
  n.servie_le + interval '2 hours'
from notes n
on conflict (eleve_id, menu_id) where eleve_id is not null do nothing;

-- =====================================================================
-- Vérification : 20 jours ouvrés, environ 200 réservés par jour, environ 6 % non servis
-- =====================================================================
select
  count(distinct m.jour) as jours_de_service,
  count(*) as reservations,
  count(*) filter (where r.statut = 'servie') as servis,
  round(100.0 * count(*) filter (where r.statut <> 'servie') / count(*), 1) as taux_gaspillage_pourcent
from public.reservations r
join public.menus m on m.id = r.menu_id
join public.profiles p on p.id = r.eleve_id
where p.email like 'histo___@demo.cantijuste.ci';
