-- CantiJuste : données de démonstration. Relançable sans erreur (Supabase > SQL Editor).

-- =====================================================================
-- COMPTES DE DÉMONSTRATION
-- D'abord, créer les 3 comptes avec « Créer un compte » dans l'appli (mot de passe Demo2026!) :
--   eleve.demo@cantijuste.ci (Élève), parent.demo@cantijuste.ci (Parent), admin.demo@cantijuste.ci (n'importe quel choix)
-- Puis lancer ce script : il donne le bon rôle à chaque e-mail et lie le parent à l'élève.
-- Pour un autre compte, recopier une ligne « update » en changeant l'e-mail et le rôle.
-- =====================================================================

update public.profiles set role = 'eleve', type_usager = 'eleve' where email = 'eleve.demo@cantijuste.ci';
update public.profiles set role = 'parent' where email = 'parent.demo@cantijuste.ci';
update public.profiles set role = 'admin' where email = 'admin.demo@cantijuste.ci';

insert into public.liens_parent (parent_id, eleve_id)
select parent.id, eleve.id
from public.profiles parent, public.profiles eleve
where parent.email = 'parent.demo@cantijuste.ci'
  and eleve.email = 'eleve.demo@cantijuste.ci'
on conflict (parent_id, eleve_id) do nothing;

-- L'élève démo est allergique à l'arachide (modifiable ensuite dans son onglet Profil)
update public.profiles set allergies = '{arachide}' where email = 'eleve.demo@cantijuste.ci';

-- =====================================================================
-- MENUS DE DÉMONSTRATION : semaine du lundi 23 au vendredi 27 novembre 2026 (le premier plat de chaque jour)
-- Les photos sont dans public/photos/. Les autres plats au choix sont ajoutés par donnees_menus_semaine.sql.
-- =====================================================================
insert into public.menus (jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif) values
  ('2026-11-23', 'Salade de tomates', 'Garba maison',           'Ananas frais', '{poisson}',  1000, 1500, '/photos/garba-maison.jpg',           'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'),
  ('2026-11-24', 'Concombre',         'Riz sauce arachide',     'Banane',       '{arachide}', 1000, 1500, '/photos/riz-sauce-arachide.jpg',     'Attiéké poisson braisé', '/photos/attieke-poisson-braise.jpg', '{poisson}'),
  ('2026-11-25', 'Carottes râpées',   'Attiéké poisson braisé', 'Papaye',       '{poisson}',  1000, 1500, '/photos/attieke-poisson-braise.jpg', 'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}'),
  ('2026-11-26', 'Avocat',            'Kédjénou de poulet',     'Mangue',       '{}',         1000, 1500, '/photos/kedjenou-poulet.jpg',        'Garba maison',           '/photos/garba-maison.jpg',           '{poisson}'),
  ('2026-11-27', 'Chou',              'Garba au piment doux',   'Orange',       '{poisson}',  1000, 1500, '/photos/garba-piment-doux.jpg',      'Kédjénou de poulet',     '/photos/kedjenou-poulet.jpg',        '{}')
on conflict (jour, plat) do update set
  entree = excluded.entree,
  plat = excluded.plat,
  dessert = excluded.dessert,
  allergenes = excluded.allergenes,
  prix = excluded.prix,
  prix_employe = excluded.prix_employe,
  photo_url = excluded.photo_url,
  plat_alternatif = excluded.plat_alternatif,
  photo_alternative = excluded.photo_alternative,
  allergenes_alternatif = excluded.allergenes_alternatif;

-- =====================================================================
-- SERVICE DE DÉMONSTRATION : le jour où ce script est lancé (heure d'Abidjan)
-- Pour montrer « Commandes du jour » et le code de retrait même un samedi :
--   1. un menu pour aujourd'hui s'il n'y en a pas (Garba maison, remplacement Kédjénou) ;
--   2. 24 convives de démonstration (comptes sans mot de passe, impossibles à utiliser pour se connecter) ;
--   3. leurs réservations du jour (6 déjà servies) + celle de l'élève démo avec le code 0812.
-- Relançable : rien n'est créé deux fois, les soldes ne sont pas débités.
-- =====================================================================
insert into public.menus (jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif)
select (now() at time zone 'Africa/Abidjan')::date, 'Salade de tomates', 'Garba maison', 'Ananas frais', '{poisson}', 1000, 1500,
       '/photos/garba-maison.jpg', 'Kédjénou de poulet', '/photos/kedjenou-poulet.jpg', '{}'
where not exists (select 1 from public.menus where jour = (now() at time zone 'Africa/Abidjan')::date);

-- Les convives : un compte par nom (le profil est créé tout seul par le déclencheur d'inscription)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select
  '00000000-0000-0000-0000-000000000000',
  md5('cantijuste-convive-' || numero)::uuid,
  'authenticated', 'authenticated',
  'convive' || lpad(numero::text, 2, '0') || '@demo.cantijuste.ci',
  '', now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('nom', nom, 'role', 'eleve', 'type_usager', 'eleve'),
  now(), now(), '', '', '', ''
from unnest(array[
  'Yao Kouassi', 'Fatou Traoré', 'Koffi N''Guessan', 'Aminata Diallo', 'Ange Brou', 'Mariam Ouattara',
  'Serge Kouadio', 'Aïcha Bamba', 'Jean-Marc Yapi', 'Grâce Aka', 'Ibrahim Cissé', 'Prisca Gnagne',
  'Moussa Sanogo', 'Esther Kacou', 'Didier Assi', 'Nadia Coulibaly', 'Paul Ehui', 'Salimata Koné',
  'Hervé Dosso', 'Raïssa Tanoh', 'Cédric Zadi', 'Adjoua Konan', 'Lamine Fofana', 'Christelle Amon'
]) with ordinality as convives(nom, numero)
on conflict (id) do nothing;

-- Quelques allergies, pour la carte « Allergies à surveiller »
update public.profiles set allergies = '{lait}'   where email = 'convive01@demo.cantijuste.ci';
update public.profiles set allergies = '{gluten}' where email = 'convive02@demo.cantijuste.ci';
update public.profiles set allergies = '{oeuf}'   where email = 'convive09@demo.cantijuste.ci';

-- Leurs réservations du jour : codes 0813 à 0836, répartis entre les plats du jour ; un sur trois prend le remplacement
insert into public.reservations (eleve_id, menu_id, statut, code_retrait, montant, alternative, servie_le)
select
  p.id, m.id,
  case when numero <= 6 then 'servie' else 'reservee' end,
  lpad((812 + numero)::text, 4, '0'),
  m.prix,
  numero % 3 = 0,
  case when numero <= 6 then now() - make_interval(mins => 30 - numero) end
from generate_series(1, 24) as numero
join public.profiles p on p.email = 'convive' || lpad(numero::text, 2, '0') || '@demo.cantijuste.ci'
cross join lateral (
  select id, prix from public.menus
  where jour = (now() at time zone 'Africa/Abidjan')::date and not retire
  order by id
  offset numero % greatest((select count(*) from public.menus where jour = (now() at time zone 'Africa/Abidjan')::date and not retire), 1)
  limit 1
) m
on conflict do nothing;

-- L'élève démo (allergique à l'arachide) a aussi son repas du jour, code 0812
insert into public.reservations (eleve_id, menu_id, statut, code_retrait, montant, alternative)
select p.id, m.id, 'reservee', '0812', m.prix, false
from public.profiles p
cross join lateral (
  select id, prix from public.menus
  where jour = (now() at time zone 'Africa/Abidjan')::date and not retire
  order by id
  limit 1
) m
where p.email = 'eleve.demo@cantijuste.ci'
on conflict do nothing;

-- Vérification : les 3 comptes doivent apparaître avec leur rôle (puis 5 menus dans l'onglet Menus,
-- et 25 repas du jour dans Admin > Commandes)
select email, nom, role, type_usager, solde, allergies
from public.profiles
where email like '%.demo@cantijuste.ci'
order by role;
