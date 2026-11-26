-- =========================================================
-- Profil alimentaire écrit par l'élève ou son parent (25/11)
-- - régime : une des propositions ('aucun', 'vegetarien', 'sans_porc', 'halal') ou un texte libre de 40 caractères au plus
-- - autre_allergie : plusieurs allergies libres séparées par des virgules (« kiwi, crevettes »), 200 caractères au plus
-- - ces allergies libres sont cherchées dans le nom du plat et les ingrédients de sa recette, et reserver() en tient compte
-- Relançable.
-- =========================================================

alter table public.profiles drop constraint if exists profiles_regime_valide;
alter table public.profiles drop constraint if exists profiles_regime_court;
alter table public.profiles add constraint profiles_regime_court
  check (char_length(regime) between 1 and 40);

alter table public.profiles drop constraint if exists profiles_autre_allergie_courte;
alter table public.profiles add constraint profiles_autre_allergie_courte
  check (char_length(autre_allergie) <= 200);

-- Le profil alimentaire complet : allergènes suivis, régime (proposé ou écrit), allergies libres (élève, ses parents liés ou l'admin)
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
  liste        text[] := array(select distinct unnest(coalesce(p_allergies, '{}')) order by 1);
  autre_texte  text := trim(coalesce(p_autre_allergie, ''));
  regime_texte text := trim(coalesce(p_regime, ''));
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
    return 'Allergène inconnu de la cantine : écris-le dans tes autres allergies.';
  end if;
  if regime_texte = '' then
    regime_texte := 'aucun';
  end if;
  if char_length(regime_texte) > 40 then
    return 'Le régime doit tenir en 40 caractères.';
  end if;
  if char_length(autre_texte) > 200 then
    return 'Les autres allergies doivent tenir en 200 caractères.';
  end if;

  update public.profiles
  set allergies = liste, regime = regime_texte, autre_allergie = autre_texte
  where id = p_eleve_id;
  return 'ok';
end;
$$;


-- Texte en minuscules sans accents (« Crevettes » → « crevettes », « Bœuf » → « boeuf »), pour comparer ce que l'élève a écrit aux plats
create or replace function public.texte_simple(p_texte text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(
    lower(replace(replace(coalesce(p_texte, ''), 'œ', 'oe'), 'Œ', 'oe')),
    'àâäáãåéèêëíìîïóòôöõúùûüçñÿ',
    'aaaaaaeeeeiiiiooooouuuucny'
  );
$$;

-- Les allergies écrites à la main (« Crevettes, Kiwi ») retrouvées dans le plat : son nom, l'entrée, le dessert
-- et les ingrédients de sa recette (stocks). Le plat de remplacement n'a que son nom.
create or replace function public.allergies_libres_du_plat(p_autre text, p_menu_id bigint, p_alternative boolean default false)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with plat as (
    select public.texte_simple(
      case when coalesce(p_alternative, false) then m.plat_alternatif
           else concat_ws(' ', m.entree, m.plat, m.dessert, m.boisson) end
      || ' ' || case when coalesce(p_alternative, false) then ''
           else coalesce((
             select string_agg(i.nom, ' ')
             from public.ingredients_par_menu r
             join public.ingredients i on i.id = r.ingredient_id
             where r.menu_id = m.id
           ), '') end
    ) as texte
    from public.menus m
    where m.id = p_menu_id
  ),
  allergies as (
    select distinct trim(morceau) as allergie
    from unnest(string_to_array(coalesce(p_autre, ''), ',')) as morceau
    where trim(morceau) <> ''
  )
  select coalesce(array_agg(a.allergie order by a.allergie), '{}')
  from allergies a
  cross join plat p
  where exists (
    select 1
    from regexp_split_to_table(public.texte_simple(a.allergie), '[^a-z]+') as mot
    where char_length(mot) >= 4
      and mot not in ('sans', 'avec', 'aucun', 'aucune', 'tout', 'tous', 'rien', 'plus')
      and p.texte like '%' || regexp_replace(mot, 's$', '') || '%'
  );
$$;

revoke execute on function public.allergies_libres_du_plat(text, bigint, boolean) from public, anon;
grant  execute on function public.allergies_libres_du_plat(text, bigint, boolean) to authenticated;

-- Réservation : les allergies écrites à la main déclenchent la même fenêtre de confirmation et la même alerte au parent
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

  -- Un seul repas par jour, quel que soit le plat choisi
  if exists (
    select 1 from public.reservations
    where eleve_id = auth.uid() and jour = menu_choisi.jour and statut <> 'annulee'
  ) then
    return public.reponse_refus('Tu as déjà ton repas ce jour-là. Annule-le dans Mes repas pour changer de plat.');
  end if;

  -- Créneau de passage : un des 7 créneaux, et pas au plafond (75 % de ce que les guichets servent en 10 min)
  if p_creneau is not null then
    if p_creneau not in (time '11:50', time '12:00', time '12:10', time '12:20', time '12:30', time '12:40', time '12:50') then
      return public.reponse_refus('Ce créneau n''existe pas.');
    end if;
    select * into reglages from public.reglages_file where id = 1;
    if (
      select count(*) from public.reservations
      where jour = menu_choisi.jour and creneau = p_creneau and statut <> 'annulee'
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
  -- Les allergies écrites à la main comptent aussi (nom du plat et ingrédients de la recette)
  risques := risques || public.allergies_libres_du_plat(profil.autre_allergie, p_menu_id, coalesce(p_alternative, false));
  if cardinality(risques) > 0 and not coalesce(p_accepte_allergie, false) then
    return public.reponse_refus('Ce plat contient une de tes allergies : confirme pour réserver quand même.', risques);
  end if;

  prix_a_payer := case when profil.type_usager = 'employe' then menu_choisi.prix_employe else menu_choisi.prix end;
  if profil.solde < prix_a_payer then
    return public.reponse_refus('Solde insuffisant : recharge ton compte.');
  end if;

  loop
    nouveau_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (
      select 1 from public.reservations
      where jour = menu_choisi.jour and code_retrait = nouveau_code and statut <> 'annulee'
    );
  end loop;

  insert into public.reservations (eleve_id, menu_id, jour, code_retrait, montant, creneau, alternative)
  values (auth.uid(), p_menu_id, menu_choisi.jour, nouveau_code, prix_a_payer, p_creneau, coalesce(p_alternative, false));

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
    return public.reponse_refus('Tu as déjà ton repas ce jour-là. Annule-le dans Mes repas pour changer de plat.');
end;
$$;

revoke execute on function public.reserver(bigint, time, boolean, boolean) from public, anon;
grant  execute on function public.reserver(bigint, time, boolean, boolean) to authenticated;
