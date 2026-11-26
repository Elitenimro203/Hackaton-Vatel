-- CantiJuste : données de démonstration, 4 plats au choix chaque jour du lundi 23 novembre au vendredi 4 décembre 2026.
-- À lancer après schema.sql (section 14 : plusieurs plats par jour). Relançable : un plat déjà saisi ce jour-là est mis à jour.
-- Les plats sans photo s'affichent avec une icône ; les photos sont dans public/photos/.

-- =====================================================================
-- 1. LA CARTE : les plats que la cantine sait faire
-- =====================================================================
with carte (code, plat, allergenes, contenu, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif) as (
  values
    ('garba',     'Garba maison',                '{poisson}'::text[],  '{}'::text[],       '/photos/garba-maison.jpg',           'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[]),
    ('arachide',  'Riz sauce arachide',          '{arachide}'::text[], '{viande}'::text[], '/photos/riz-sauce-arachide.jpg',     'Attiéké poisson braisé', '/photos/attieke-poisson-braise.jpg', '{poisson}'::text[]),
    ('attieke',   'Attiéké poisson braisé',      '{poisson}'::text[],  '{}'::text[],       '/photos/attieke-poisson-braise.jpg', 'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[]),
    ('kedjenou',  'Kédjénou de poulet',          '{}'::text[],         '{viande}'::text[], '/photos/kedjenou-poulet.jpg',        'Garba maison',           '/photos/garba-maison.jpg',           '{poisson}'::text[]),
    ('piment',    'Garba au piment doux',        '{poisson}'::text[],  '{}'::text[],       '/photos/garba-piment-doux.jpg',      'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'::text[]),
    ('alloco',    'Alloco omelette',             '{oeuf}'::text[],     '{}'::text[],       null,                                 '',                       null,                                 '{}'::text[]),
    ('rizgras',   'Riz gras au bœuf',            '{}'::text[],         '{viande}'::text[], null,                                 '',                       null,                                 '{}'::text[]),
    ('foutou',    'Foutou sauce graine',         '{poisson}'::text[],  '{viande}'::text[], null,                                 '',                       null,                                 '{}'::text[]),
    ('placali',   'Placali sauce gombo',         '{poisson}'::text[],  '{}'::text[],       null,                                 '',                       null,                                 '{}'::text[]),
    ('haricots',  'Haricots rouges et riz blanc', '{}'::text[],        '{}'::text[],       null,                                 '',                       null,                                 '{}'::text[]),
    ('spaghetti', 'Spaghetti à la viande',       '{gluten}'::text[],   '{viande}'::text[], null,                                 '',                       null,                                 '{}'::text[])
),

-- =====================================================================
-- 2. LA SEMAINE : la formule du jour (entrée, dessert, boisson) et ses 4 plats au choix
-- =====================================================================
jours (jour, entree, dessert, boisson, plats) as (
  values
    (date '2026-11-23', 'Salade de tomates', 'Ananas frais', 'Bissap',            array['garba', 'kedjenou', 'alloco', 'haricots']),
    (date '2026-11-24', 'Concombre',         'Banane',       'Jus de gingembre',  array['arachide', 'attieke', 'rizgras', 'haricots']),
    (date '2026-11-25', 'Carottes râpées',   'Papaye',       'Bissap',            array['attieke', 'kedjenou', 'spaghetti', 'alloco']),
    (date '2026-11-26', 'Avocat',            'Mangue',       'Jus de baobab',     array['kedjenou', 'piment', 'arachide', 'placali']),
    (date '2026-11-27', 'Chou',              'Orange',       'Jus de gingembre',  array['piment', 'attieke', 'kedjenou', 'alloco']),
    (date '2026-11-30', 'Salade de tomates', 'Ananas frais', 'Bissap',            array['garba', 'arachide', 'foutou', 'haricots']),
    (date '2026-12-01', 'Concombre',         'Banane',       'Jus de baobab',     array['kedjenou', 'attieke', 'rizgras', 'alloco']),
    (date '2026-12-02', 'Carottes râpées',   'Papaye',       'Jus de gingembre',  array['arachide', 'piment', 'spaghetti', 'haricots']),
    (date '2026-12-03', 'Avocat',            'Mangue',       'Bissap',            array['attieke', 'garba', 'kedjenou', 'placali']),
    (date '2026-12-04', 'Chou',              'Orange',       'Jus de baobab',     array['piment', 'kedjenou', 'arachide', 'alloco'])
)
insert into public.menus (jour, entree, plat, dessert, boisson, allergenes, contenu, prix, prix_employe, photo_url,
                          plat_alternatif, photo_alternative, allergenes_alternatif, contenu_alternatif, retire)
select j.jour, j.entree, c.plat, j.dessert, j.boisson, c.allergenes, c.contenu, 1000, 1500, c.photo_url,
       c.plat_alternatif, c.photo_alternative, c.allergenes_alternatif,
       case when c.plat_alternatif = 'Kédjénou de poulet' then '{viande}'::text[] else '{}'::text[] end,
       false
from jours j
cross join lateral unnest(j.plats) with ordinality as choix(code, rang)
join carte c on c.code = choix.code
order by j.jour, choix.rang
on conflict (jour, plat) do update set
  entree = excluded.entree,
  dessert = excluded.dessert,
  boisson = excluded.boisson,
  allergenes = excluded.allergenes,
  contenu = excluded.contenu,
  photo_url = excluded.photo_url,
  plat_alternatif = excluded.plat_alternatif,
  photo_alternative = excluded.photo_alternative,
  allergenes_alternatif = excluded.allergenes_alternatif,
  contenu_alternatif = excluded.contenu_alternatif,
  retire = false;

-- =====================================================================
-- 3. LES CONVIVES DE DÉMONSTRATION À VENIR : répartis entre les plats du jour (au lieu d'un seul plat)
-- Seulement les comptes fictifs (convive.. et histo..), jamais un vrai compte. Même tirage à chaque relance.
-- =====================================================================
with a_repartir as (
  select r.id, choix.id as nouveau_menu
  from public.reservations r
  join public.profiles p on p.id = r.eleve_id
  cross join lateral (
    select m.id
    from public.menus m
    where m.jour = r.jour and not m.retire
    order by m.id
    offset abs(hashtext('choix-' || r.id)) % (select count(*) from public.menus m2 where m2.jour = r.jour and not m2.retire)
    limit 1
  ) choix
  where (p.email like 'convive__@demo.cantijuste.ci' or p.email like 'histo___@demo.cantijuste.ci')
    and r.jour >= (now() at time zone 'Africa/Abidjan')::date
    and r.statut <> 'annulee'
    and r.menu_id <> choix.id
)
update public.reservations r
set menu_id = a_repartir.nouveau_menu, alternative = false
from a_repartir
where r.id = a_repartir.id;

-- Vérification : 4 plats par jour
select jour, count(*) as plats, string_agg(plat, ' · ' order by id) as au_choix
from public.menus
where jour between '2026-11-23' and '2026-12-04' and not retire
group by jour
order by jour;
