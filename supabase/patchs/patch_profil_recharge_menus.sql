-- Corrections du 25/11 : régime et « autre allergie » sur le profil, recharge libre (500 à 50 000 F), menus retirés et dupliqués. Relançable sans erreur.

-- =====================================================================
-- 12. PROFIL ALIMENTAIRE, RECHARGE LIBRE, RETIRER ET DUPLIQUER UN MENU (aussi disponible seul : patch_profil_recharge_menus.sql)
-- =====================================================================

-- Régime alimentaire et allergie libre, remplis par l'élève ou son parent
alter table public.profiles add column if not exists regime text not null default 'aucun';
alter table public.profiles add column if not exists autre_allergie text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_regime_valide') then
    alter table public.profiles add constraint profiles_regime_valide
      check (regime in ('aucun', 'vegetarien', 'sans_porc', 'halal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_autre_allergie_courte') then
    alter table public.profiles add constraint profiles_autre_allergie_courte
      check (char_length(autre_allergie) <= 60);
  end if;
end;
$$;

-- Ce que contient le plat (pour les régimes) et menu retiré : caché aux élèves, réservations gardées
alter table public.menus add column if not exists contenu text[] not null default '{}';
alter table public.menus add column if not exists contenu_alternatif text[] not null default '{}';
alter table public.menus add column if not exists retire boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_contenu_valide') then
    alter table public.menus add constraint menus_contenu_valide
      check (contenu <@ array['viande', 'porc', 'non_halal'] and contenu_alternatif <@ array['viande', 'porc', 'non_halal']);
  end if;
end;
$$;

-- Démo : les plats au poulet, bœuf ou mouton déjà saisis sont marqués « viande » (seulement s'ils n'ont encore rien)
update public.menus set contenu = array['viande']
where contenu = '{}' and (plat ilike '%poulet%' or plat ilike '%bœuf%' or plat ilike '%boeuf%' or plat ilike '%mouton%');
update public.menus set contenu_alternatif = array['viande']
where contenu_alternatif = '{}' and (plat_alternatif ilike '%poulet%' or plat_alternatif ilike '%bœuf%'
  or plat_alternatif ilike '%boeuf%' or plat_alternatif ilike '%mouton%');

-- Pourquoi un plat ne convient pas à un régime (null s'il convient). Même règle que src/lib/regimes.js.
create or replace function public.conflit_regime(p_regime text, p_contenu text[], p_allergenes text[])
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_regime = 'vegetarien' and 'porc' = any (p_contenu) then 'Contient du porc'
    when p_regime = 'vegetarien' and 'viande' = any (p_contenu) then 'Contient de la viande'
    when p_regime = 'vegetarien' and 'poisson' = any (p_allergenes) then 'Contient du poisson'
    when p_regime in ('sans_porc', 'halal') and 'porc' = any (p_contenu) then 'Contient du porc'
    when p_regime = 'halal' and 'non_halal' = any (p_contenu) then 'Viande non halal'
  end;
$$;

-- Le profil alimentaire complet : allergies, régime, autre allergie (élève, ses parents liés ou l'admin)
create or replace function public.modifier_profil_alimentaire(
  p_eleve_id uuid,
  p_allergies text[],
  p_regime text,
  p_autre_allergie text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  liste       text[] := array(select distinct unnest(coalesce(p_allergies, '{}')) order by 1);
  autre_texte text := trim(coalesce(p_autre_allergie, ''));
begin
  if auth.uid() is null then
    return 'Connectez-vous pour modifier le profil alimentaire.';
  end if;
  if not (p_eleve_id = auth.uid() or public.est_parent_de(p_eleve_id) or public.mon_role() = 'admin') then
    return 'Seuls l''élève, ses parents et la cantine peuvent modifier ce profil.';
  end if;
  if not exists (select 1 from public.profiles where id = p_eleve_id and role = 'eleve') then
    return 'Compte élève introuvable.';
  end if;
  if not liste <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf'] then
    return 'Allergie inconnue : choisissez parmi arachide, lait, gluten, poisson et œuf.';
  end if;
  if p_regime is null or p_regime not in ('aucun', 'vegetarien', 'sans_porc', 'halal') then
    return 'Régime inconnu : choisissez parmi les propositions.';
  end if;
  if char_length(autre_texte) > 60 then
    return 'L''autre allergie doit tenir en 60 caractères.';
  end if;

  update public.profiles
  set allergies = liste, regime = p_regime, autre_allergie = autre_texte
  where id = p_eleve_id;
  return 'ok';
end;
$$;

-- Recharge Mobile Money simulée : 500 à 50 000 F par recharge, montant libre (même règle que src/lib/recharges.js)
create or replace function public.recharger_mobile_money(p_eleve_id uuid, p_montant integer, p_operateur text default 'Wave')
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return 'Connectez-vous pour recharger.';
  end if;
  if public.mon_role() is null or public.mon_role() not in ('eleve', 'parent') then
    return 'La recharge Mobile Money est réservée aux élèves et aux parents.';
  end if;
  if not (p_eleve_id = auth.uid() or public.est_parent_de(p_eleve_id)) then
    return 'Vous ne pouvez recharger que votre compte ou celui de votre enfant.';
  end if;
  if p_montant is null or p_montant < 500 then
    return 'Le montant minimum est de 500 F par recharge.';
  end if;
  if p_montant > 50000 then
    return 'Le montant maximum est de 50 000 F par recharge.';
  end if;
  if p_operateur is null or p_operateur not in ('Wave', 'Orange Money', 'MTN MoMo', 'Moov Money') then
    return 'Opérateur inconnu.';
  end if;

  update public.profiles set solde = solde + p_montant
  where id = p_eleve_id and role = 'eleve';
  if not found then
    return 'Compte élève introuvable.';
  end if;

  insert into public.mouvements (eleve_id, montant, motif)
  values (p_eleve_id, p_montant, 'Recharge ' || p_operateur);

  return 'ok';
end;
$$;

-- Réserver : même fonction qu'à la section 9, avec en plus le refus d'un menu retiré
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

  if exists (
    select 1 from public.reservations
    where eleve_id = auth.uid() and menu_id = p_menu_id and statut <> 'annulee'
  ) then
    return public.reponse_refus('Tu as déjà réservé ce repas.');
  end if;

  -- Créneau de passage : un des 7 créneaux, et pas au plafond (75 % de ce que les guichets servent en 10 min)
  if p_creneau is not null then
    if p_creneau not in (time '11:50', time '12:00', time '12:10', time '12:20', time '12:30', time '12:40', time '12:50') then
      return public.reponse_refus('Ce créneau n''existe pas.');
    end if;
    select * into reglages from public.reglages_file where id = 1;
    if (
      select count(*) from public.reservations
      where menu_id = p_menu_id and creneau = p_creneau and statut <> 'annulee'
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
      where menu_id = p_menu_id and code_retrait = nouveau_code and statut <> 'annulee'
    );
  end loop;

  insert into public.reservations (eleve_id, menu_id, code_retrait, montant, creneau, alternative)
  values (auth.uid(), p_menu_id, nouveau_code, prix_a_payer, p_creneau, coalesce(p_alternative, false));

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
    return public.reponse_refus('Tu as déjà réservé ce repas.');
end;
$$;

-- Admin : retirer un menu. Il disparaît pour les élèves ; les réservations encore à venir sont annulées et remboursées,
-- les lignes restent dans l'historique. Renvoie { ok, message, rembourses }.
create or replace function public.retirer_menu(p_menu_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_choisi public.menus;
  resa        public.reservations;
  nombre      integer := 0;
begin
  if public.mon_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'Réservé à l''administrateur.');
  end if;

  select * into menu_choisi from public.menus where id = p_menu_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Ce menu n''existe plus.');
  end if;
  if menu_choisi.retire then
    return jsonb_build_object('ok', false, 'message', 'Ce menu est déjà retiré.');
  end if;

  update public.menus set retire = true where id = p_menu_id;

  -- Seulement les repas pas encore servis d'un jour qui n'est pas passé
  if menu_choisi.jour >= (now() at time zone 'Africa/Abidjan')::date then
    for resa in
      select * from public.reservations where menu_id = p_menu_id and statut = 'reservee' for update
    loop
      update public.reservations set statut = 'annulee' where id = resa.id;
      update public.profiles set solde = solde + resa.montant where id = resa.eleve_id;
      insert into public.mouvements (eleve_id, montant, motif)
      values (
        resa.eleve_id,
        resa.montant,
        'Remboursement : ' || case when resa.alternative then menu_choisi.plat_alternatif else menu_choisi.plat end || ' (retiré du menu)'
      );
      nombre := nombre + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'message', 'ok', 'rembourses', nombre);
end;
$$;

-- Admin : remettre au menu un plat retiré (les réservations annulées ne reviennent pas)
create or replace function public.remettre_au_menu(p_menu_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  update public.menus set retire = false where id = p_menu_id and retire;
  if not found then
    return 'Ce menu n''est pas retiré.';
  end if;
  return 'ok';
end;
$$;

-- Admin : copier un menu (plat, prix, allergènes, remplacement, recette) vers un autre jour libre, aujourd'hui ou après
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
  if exists (select 1 from public.menus where jour = p_jour) then
    return 'Il y a déjà un menu ce jour-là. Modifiez-le ou retirez-le d''abord.';
  end if;

  insert into public.menus (
    jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url,
    plat_alternatif, photo_alternative, allergenes_alternatif, contenu, contenu_alternatif
  )
  select
    p_jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url,
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
    return 'Il y a déjà un menu ce jour-là. Modifiez-le ou retirez-le d''abord.';
end;
$$;

-- Admin : copier les menus (non retirés) d'une semaine vers une autre. Les jours déjà pris ou passés sont sautés.
-- Renvoie { ok, message, copies, sautes }.
create or replace function public.dupliquer_semaine(p_lundi_source date, p_lundi_cible date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ecart       integer := p_lundi_cible - p_lundi_source;
  menu_source public.menus;
  copies      integer := 0;
  sautes      integer := 0;
begin
  if public.mon_role() is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'message', 'Réservé à l''administrateur.');
  end if;
  if p_lundi_source is null or p_lundi_cible is null or ecart = 0 then
    return jsonb_build_object('ok', false, 'message', 'Choisissez une autre semaine.');
  end if;

  for menu_source in
    select * from public.menus
    where jour between p_lundi_source and p_lundi_source + 4 and not retire
    order by jour
  loop
    if public.dupliquer_menu(menu_source.id, menu_source.jour + ecart) = 'ok' then
      copies := copies + 1;
    else
      sautes := sautes + 1;
    end if;
  end loop;

  if copies = 0 and sautes = 0 then
    return jsonb_build_object('ok', false, 'message', 'Aucun menu à copier cette semaine.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'ok', 'copies', copies, 'sautes', sautes);
end;
$$;

-- Admin : convives à surveiller ce jour-là (allergies, régime ou autre allergie), avec le plat choisi et ce qui pose problème
drop function if exists public.allergies_du_jour(date);
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
  if public.mon_role() is distinct from 'admin' then
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

revoke execute on function public.modifier_profil_alimentaire(uuid, text[], text, text) from public, anon;
revoke execute on function public.recharger_mobile_money(uuid, integer, text)            from public, anon;
revoke execute on function public.reserver(bigint, time, boolean, boolean)               from public, anon;
revoke execute on function public.retirer_menu(bigint)                                   from public, anon;
revoke execute on function public.remettre_au_menu(bigint)                               from public, anon;
revoke execute on function public.dupliquer_menu(bigint, date)                           from public, anon;
revoke execute on function public.dupliquer_semaine(date, date)                          from public, anon;
revoke execute on function public.allergies_du_jour(date)                                from public, anon;
grant  execute on function public.modifier_profil_alimentaire(uuid, text[], text, text) to authenticated;
grant  execute on function public.recharger_mobile_money(uuid, integer, text)            to authenticated;
grant  execute on function public.reserver(bigint, time, boolean, boolean)               to authenticated;
grant  execute on function public.retirer_menu(bigint)                                   to authenticated;
grant  execute on function public.remettre_au_menu(bigint)                               to authenticated;
grant  execute on function public.dupliquer_menu(bigint, date)                           to authenticated;
grant  execute on function public.dupliquer_semaine(date, date)                          to authenticated;
grant  execute on function public.allergies_du_jour(date)                                to authenticated;
