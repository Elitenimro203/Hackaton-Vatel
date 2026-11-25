-- CantiJuste : gestion des stocks côté admin. Relançable sans erreur (Supabase > SQL Editor).
-- Réutilise les tables ingredients (stock, seuil) et ingredients_par_menu (la recette : quantité par repas) déjà dans le schéma.
-- Simplification : la recette est celle du plat du jour ; un repas pris en plat de remplacement déduit la même recette.

-- Unité limitée à kg, L ou pièce
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ingredients_unite_valide') then
    alter table public.ingredients add constraint ingredients_unite_valide check (unite in ('kg', 'L', 'pièce'));
  end if;
end;
$$;

-- Historique du stock : quantité positive pour une entrée (livraison), négative pour une sortie (repas servi)
create table if not exists public.mouvements_stock (
  id             bigint generated always as identity primary key,
  ingredient_id  bigint not null references public.ingredients (id) on delete cascade,
  quantite       numeric(10, 3) not null check (quantite <> 0),
  motif          text not null,
  reservation_id bigint references public.reservations (id) on delete set null,
  cree_le        timestamptz not null default now()
);

create index if not exists mouvements_stock_par_ingredient on public.mouvements_stock (ingredient_id, cree_le desc);

-- Un repas servi ne déduit un ingrédient qu'une seule fois, même si le code est tapé deux fois
create unique index if not exists mouvements_stock_une_deduction
  on public.mouvements_stock (reservation_id, ingredient_id) where reservation_id is not null;

-- RLS : lecture réservée à l'admin ; l'écriture passe uniquement par les fonctions ci-dessous
alter table public.mouvements_stock enable row level security;

drop policy if exists mouvements_stock_lecture_admin on public.mouvements_stock;
create policy mouvements_stock_lecture_admin on public.mouvements_stock
  for select to authenticated
  using (public.mon_role() = 'admin');

revoke insert, update, delete on public.mouvements_stock from authenticated, anon;

-- =====================================================================
-- Admin : besoins en ingrédients d'un jour de service, comparés au stock
--   besoin  = repas encore à servir ('reservee', les repas déjà servis ont déjà été déduits) x quantité par repas
--   statut  = 'rupture' si le stock ne couvre pas le besoin, 'bas' s'il est sous le seuil d'alerte, sinon 'ok'
--   manque  = quantité à commander pour couvrir le besoin
-- p_jour vide = prochain jour de service (aujourd'hui s'il y a un menu, sinon le suivant), comme l'écran Commandes.
-- =====================================================================
create or replace function public.besoins_stock(p_jour date default null)
returns table (
  ingredient_id bigint,
  nom           text,
  unite         text,
  quantite      numeric,
  seuil         numeric,
  besoin        numeric,
  manque        numeric,
  statut        text,
  jour          date,
  repas         integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  aujourdhui date := (now() at time zone 'Africa/Abidjan')::date;
  jour_choisi date;
begin
  if public.mon_role() is distinct from 'admin' then
    return;
  end if;

  jour_choisi := coalesce(p_jour, (select min(m.jour) from public.menus m where m.jour >= aujourdhui), aujourdhui);

  return query
  with repas_du_jour as (
    select m.id as menu_id, count(r.id)::integer as nombre
    from public.menus m
    left join public.reservations r on r.menu_id = m.id and r.statut = 'reservee'
    where m.jour = jour_choisi
    group by m.id
  ),
  besoins as (
    select ipm.ingredient_id, sum(ipm.quantite_par_repas * d.nombre) as besoin, sum(d.nombre)::integer as repas
    from public.ingredients_par_menu ipm
    join repas_du_jour d on d.menu_id = ipm.menu_id
    group by ipm.ingredient_id
  )
  select
    i.id,
    i.nom,
    i.unite,
    i.quantite,
    i.seuil,
    coalesce(b.besoin, 0),
    greatest(0, coalesce(b.besoin, 0) - i.quantite),
    case
      when i.quantite < coalesce(b.besoin, 0) then 'rupture'
      when i.quantite < i.seuil then 'bas'
      else 'ok'
    end,
    jour_choisi,
    coalesce(b.repas, 0)
  from public.ingredients i
  left join besoins b on b.ingredient_id = i.id
  order by
    case
      when i.quantite < coalesce(b.besoin, 0) then 0
      when i.quantite < i.seuil then 1
      else 2
    end,
    i.nom;
end;
$$;

-- Admin : enregistrer une livraison (entrée de stock). Renvoie 'ok' ou un message d'erreur en français.
create or replace function public.entree_stock(p_ingredient_id bigint, p_quantite numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  if p_quantite is null or p_quantite <= 0 or p_quantite > 100000 then
    return 'La quantité livrée doit être entre 0 et 100 000.';
  end if;

  update public.ingredients set quantite = quantite + p_quantite where id = p_ingredient_id;
  if not found then
    return 'Ingrédient introuvable.';
  end if;

  insert into public.mouvements_stock (ingredient_id, quantite, motif)
  values (p_ingredient_id, p_quantite, 'Livraison');
  return 'ok';
end;
$$;

-- Admin : remplace la recette d'un menu. p_lignes = [{ "ingredient_id": 3, "quantite": 0.2 }, ...] (liste vide = pas de recette)
create or replace function public.enregistrer_recette(p_menu_id bigint, p_lignes jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  if not exists (select 1 from public.menus where id = p_menu_id) then
    return 'Ce menu n''existe pas.';
  end if;

  delete from public.ingredients_par_menu where menu_id = p_menu_id;

  insert into public.ingredients_par_menu (menu_id, ingredient_id, quantite_par_repas)
  select p_menu_id, (ligne ->> 'ingredient_id')::bigint, (ligne ->> 'quantite')::numeric
  from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) as ligne
  where (ligne ->> 'quantite')::numeric > 0
  on conflict (menu_id, ingredient_id) do update set quantite_par_repas = excluded.quantite_par_repas;

  return 'ok';
exception
  when foreign_key_violation then
    return 'Un des ingrédients n''existe plus.';
end;
$$;

revoke execute on function public.besoins_stock(date)                 from public, anon;
revoke execute on function public.entree_stock(bigint, numeric)       from public, anon;
revoke execute on function public.enregistrer_recette(bigint, jsonb)  from public, anon;
grant  execute on function public.besoins_stock(date)                 to authenticated;
grant  execute on function public.entree_stock(bigint, numeric)       to authenticated;
grant  execute on function public.enregistrer_recette(bigint, jsonb)  to authenticated;

-- Temps réel : l'écran Stocks se met à jour quand le stock change
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['ingredients', 'mouvements_stock'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = nom_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', nom_table);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- marquer_servie : même contrat qu'avant (JSON), avec en plus la déduction du stock
-- =====================================================================
-- Admin : servir un repas avec son code de retrait (réservation du jour seulement).
-- Renvoie un JSON { ok, resultat, message, prenom, plat, allergies, code_retrait, jour } ;
-- resultat vaut 'servi', 'deja_servi', 'pas_aujourdhui', 'inconnu' ou 'refuse'. Sert aussi à déduire le stock (module Stocks).
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

  -- Stock : les ingrédients de la recette du menu sont déduits (jamais sous 0, une seule fois par réservation
  -- grâce à l'index unique de mouvements_stock). Si un ingrédient manque, le repas est servi quand même.
  with retraits as (
    select i.id as ingredient_id, least(r.quantite_par_repas, i.quantite) as retire
    from public.ingredients_par_menu r
    join public.ingredients i on i.id = r.ingredient_id
    where r.menu_id = resa.menu_id
    for update of i
  ),
  enregistres as (
    insert into public.mouvements_stock (ingredient_id, quantite, motif, reservation_id)
    select ingredient_id, -retire, 'Repas servi', resa.id
    from retraits
    where retire > 0
    on conflict do nothing
    returning ingredient_id, -quantite as retire
  )
  update public.ingredients i
  set quantite = i.quantite - e.retire
  from enregistres e
  where i.id = e.ingredient_id;

  return jsonb_build_object(
    'ok', true, 'resultat', 'servi', 'message', 'Servi',
    'prenom', split_part(trim(nom_complet), ' ', 1), 'plat', plat_servi,
    'allergies', to_jsonb(coalesce(allergies_eleve, '{}')), 'code_retrait', code_nettoye, 'jour', aujourdhui
  );
end;
$$;

grant  execute on function public.marquer_servie(text) to authenticated;
revoke execute on function public.marquer_servie(text) from public, anon;
