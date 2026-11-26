-- Données de démonstration seulement (jamais sur une vraie cantine). À relancer le matin d'une présentation.
-- 1. Les jours de service passés que personne n'a « tenus » dans l'appli (moins de la moitié des repas marqués servis,
--    parce qu'aucun comptoir réel n'a tapé les codes) reçoivent un service réaliste : environ 94 % servis, 6 % d'absents.
--    Les jours déjà servis normalement ne sont pas touchés : leurs vrais absents restent des absents.
-- 2. Le ticket CJ · 0812 de l'élève démo est remis pour aujourd'hui (le moment du comptoir).
-- Relançable : le tirage dépend de l'identifiant de la réservation, il donne toujours le même résultat.
with jours_non_tenus as (
  select m.id as menu_id
  from public.menus m
  join public.reservations r on r.menu_id = m.id and r.statut <> 'annulee'
  where m.jour < (now() at time zone 'Africa/Abidjan')::date
    and m.jour >= (now() at time zone 'Africa/Abidjan')::date - 35
  group by m.id
  having count(*) filter (where r.statut = 'servie') < count(*) / 2
)
update public.reservations r
set statut = 'servie',
    servie_le = (m.jour + time '12:20') at time zone 'Africa/Abidjan'
from public.menus m
where r.menu_id = m.id
  and m.id in (select menu_id from jours_non_tenus)
  and r.statut = 'reservee'
  and abs(hashtext(r.id::text)) % 100 >= 6;

-- Le ticket de démo du jour : l'élève démo a son repas d'aujourd'hui avec le code 0812 (s'il y a un menu aujourd'hui)
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
  and not exists (
    select 1 from public.reservations r
    where r.jour = (now() at time zone 'Africa/Abidjan')::date and r.code_retrait = '0812' and r.statut <> 'annulee'
  )
on conflict do nothing;
