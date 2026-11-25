-- CantiJuste : schéma complet de la base Supabase (tables, sécurité RLS, fonctions RPC, temps réel). Relançable sans erreur.

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- Profil de chaque utilisateur, créé automatiquement à l'inscription
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nom         text not null default '',
  role        text not null default 'eleve' check (role in ('eleve', 'parent', 'admin')),
  type_usager text not null default 'eleve' check (type_usager in ('eleve', 'employe')),
  solde       integer not null default 0 check (solde >= 0),
  allergies   text[] not null default '{}'
              check (allergies <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf']),
  cree_le     timestamptz not null default now()
);

-- Lien entre un parent et ses enfants
create table if not exists public.liens_parent (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  eleve_id  uuid not null references public.profiles (id) on delete cascade,
  cree_le   timestamptz not null default now(),
  primary key (parent_id, eleve_id),
  check (parent_id <> eleve_id)
);

-- Les plats du jour : une ligne par plat (plusieurs plats le même jour, voir la section 14)
create table if not exists public.menus (
  id         bigint generated always as identity primary key,
  jour       date not null unique,
  entree     text not null default '',
  plat       text not null,
  dessert    text not null default '',
  allergenes text[] not null default '{}'
             check (allergenes <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf']),
  prix       integer not null check (prix > 0),
  prix_employe integer not null default 1500 check (prix_employe > 0),
  photo_url  text,
  cree_le    timestamptz not null default now()
);

-- Prix employé : ajouté après coup, cette ligne met à jour une base déjà créée
alter table public.menus add column if not exists prix_employe integer not null default 1500 check (prix_employe > 0);

-- Réservation d'un repas par un élève, avec son code de retrait à 4 chiffres
create table if not exists public.reservations (
  id           bigint generated always as identity primary key,
  eleve_id     uuid not null references public.profiles (id) on delete cascade,
  menu_id      bigint not null references public.menus (id) on delete restrict,
  statut       text not null default 'reservee' check (statut in ('reservee', 'annulee', 'servie')),
  code_retrait text not null check (code_retrait ~ '^[0-9]{4}$'),
  montant      integer not null check (montant > 0),
  creneau      time,
  cree_le      timestamptz not null default now(),
  servie_le    timestamptz
);

-- Un seul repas actif par élève et par jour (un menu = un jour)
create unique index if not exists reservations_un_repas_par_jour
  on public.reservations (eleve_id, menu_id) where statut <> 'annulee';

-- Code de retrait unique parmi les réservations actives du jour
create unique index if not exists reservations_code_unique_du_jour
  on public.reservations (menu_id, code_retrait) where statut <> 'annulee';

-- Chaque menu peut proposer un plat de remplacement (même prix) pour les élèves allergiques
alter table public.menus add column if not exists plat_alternatif text not null default '';
alter table public.menus add column if not exists photo_alternative text;
alter table public.menus add column if not exists allergenes_alternatif text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_allergenes_alternatif_valides') then
    alter table public.menus add constraint menus_allergenes_alternatif_valides
      check (allergenes_alternatif <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf']);
  end if;
end;
$$;

-- Vrai si l'élève a réservé le plat de remplacement plutôt que le plat du jour
alter table public.reservations add column if not exists alternative boolean not null default false;

-- Historique du solde : montant positif (recharge, remboursement) ou négatif (repas)
create table if not exists public.mouvements (
  id       bigint generated always as identity primary key,
  eleve_id uuid not null references public.profiles (id) on delete cascade,
  montant  integer not null check (montant <> 0),
  motif    text not null,
  cree_le  timestamptz not null default now()
);

create index if not exists mouvements_par_eleve on public.mouvements (eleve_id, cree_le desc);

-- Avis sur les plats : notés dans l'appli ou importés (boîte à idées)
create table if not exists public.avis (
  id          bigint generated always as identity primary key,
  eleve_id    uuid references public.profiles (id) on delete set null,
  menu_id     bigint references public.menus (id) on delete set null,
  plat        text not null,
  etoiles     integer not null check (etoiles between 1 and 5),
  commentaire text,
  source      text not null default 'appli' check (source in ('appli', 'import')),
  cree_le     timestamptz not null default now()
);
-- (la règle « une note par élève et par menu » est un index partiel, voir la section 11 Insights)

-- Ingrédients en stock
create table if not exists public.ingredients (
  id       bigint generated always as identity primary key,
  nom      text not null unique,
  unite    text not null default 'kg',
  quantite numeric(10, 2) not null default 0 check (quantite >= 0),
  seuil    numeric(10, 2) not null default 0 check (seuil >= 0)
);

-- Quantité de chaque ingrédient pour un repas d'un menu (sert à calculer les besoins)
create table if not exists public.ingredients_par_menu (
  menu_id            bigint not null references public.menus (id) on delete cascade,
  ingredient_id      bigint not null references public.ingredients (id) on delete cascade,
  quantite_par_repas numeric(10, 3) not null check (quantite_par_repas > 0),
  primary key (menu_id, ingredient_id)
);

-- Alertes envoyées aux parents quand un élève réserve malgré son allergie
create table if not exists public.alertes (
  id         bigint generated always as identity primary key,
  eleve_id   uuid not null references public.profiles (id) on delete cascade,
  menu_id    bigint references public.menus (id) on delete set null,
  allergenes text[] not null default '{}',
  message    text not null,
  lue        boolean not null default false,
  cree_le    timestamptz not null default now()
);

create index if not exists alertes_par_eleve on public.alertes (eleve_id, cree_le desc);

-- =====================================================================
-- 2. FONCTIONS D'AIDE (rôle, lien parent, heure limite)
-- =====================================================================

-- Rôle de l'utilisateur connecté (security definer : évite la récursion dans les règles RLS)
create or replace function public.mon_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Vrai si l'utilisateur connecté est le parent lié à cet élève
create or replace function public.est_parent_de(p_eleve_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.liens_parent
    where parent_id = auth.uid() and eleve_id = p_eleve_id
  );
$$;

-- Heure limite pour réserver ou annuler : la veille du repas à 18 h, heure d'Abidjan
create or replace function public.heure_limite(p_jour date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((p_jour - 1) + time '18:00') at time zone 'Africa/Abidjan';
$$;

-- =====================================================================
-- 3. DÉCLENCHEURS
-- =====================================================================

-- Crée le profil à chaque inscription. Le rôle ne peut être que eleve ou parent (jamais admin).
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_demande text := new.raw_user_meta_data ->> 'role';
  type_demande text := new.raw_user_meta_data ->> 'type_usager';
begin
  insert into public.profiles (id, email, nom, role, type_usager)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    case when role_demande in ('eleve', 'parent') then role_demande else 'eleve' end,
    case when type_demande in ('eleve', 'employe') then type_demande else 'eleve' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists apres_inscription on auth.users;
create trigger apres_inscription
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Empêche un utilisateur de changer lui-même son rôle, son solde ou son e-mail depuis l'appli.
-- Les fonctions RPC (security definer) et le SQL Editor ne sont pas concernés.
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
          or new.id is distinct from old.id) then
    raise exception 'Le rôle, le solde et l''e-mail ne peuvent pas être modifiés ici.';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_profil on public.profiles;
create trigger proteger_profil
  before update on public.profiles
  for each row execute function public.proteger_colonnes_profil();

-- =====================================================================
-- 4. SÉCURITÉ RLS
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.liens_parent         enable row level security;
alter table public.menus                enable row level security;
alter table public.reservations         enable row level security;
alter table public.mouvements           enable row level security;
alter table public.avis                 enable row level security;
alter table public.ingredients          enable row level security;
alter table public.ingredients_par_menu enable row level security;
alter table public.alertes              enable row level security;

-- profiles : chacun voit le sien, le parent voit ses enfants, l'admin voit tout
drop policy if exists profils_lecture on public.profiles;
create policy profils_lecture on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.est_parent_de(id) or public.mon_role() = 'admin');

-- profiles : chacun modifie son nom, son type et ses allergies (rôle et solde bloqués par le déclencheur)
drop policy if exists profils_modification on public.profiles;
create policy profils_modification on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.mon_role() = 'admin')
  with check (id = auth.uid() or public.mon_role() = 'admin');

-- liens_parent : le parent et l'enfant voient leur lien, l'admin tout. Création par lier_enfant().
drop policy if exists liens_lecture on public.liens_parent;
create policy liens_lecture on public.liens_parent
  for select to authenticated
  using (parent_id = auth.uid() or eleve_id = auth.uid() or public.mon_role() = 'admin');

drop policy if exists liens_suppression on public.liens_parent;
create policy liens_suppression on public.liens_parent
  for delete to authenticated
  using (parent_id = auth.uid() or public.mon_role() = 'admin');

-- menus : tout utilisateur connecté lit, seul l'admin écrit
drop policy if exists menus_lecture on public.menus;
create policy menus_lecture on public.menus
  for select to authenticated
  using (true);

drop policy if exists menus_ecriture_admin on public.menus;
create policy menus_ecriture_admin on public.menus
  for all to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

-- reservations : lecture seulement (élève, son parent, admin). Écriture uniquement par les fonctions RPC.
drop policy if exists reservations_lecture on public.reservations;
create policy reservations_lecture on public.reservations
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- mouvements : lecture seulement (élève, son parent, admin). Écriture uniquement par les fonctions RPC.
drop policy if exists mouvements_lecture on public.mouvements;
create policy mouvements_lecture on public.mouvements
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- Même sans règle d'écriture, on retire les droits : personne n'écrit un mouvement depuis l'appli
revoke insert, update, delete on public.mouvements from anon, authenticated;

-- avis, themes, codages : policies dans la section 11 (Insights)

-- ingredients et ingredients_par_menu : réservés à l'admin
drop policy if exists ingredients_admin on public.ingredients;
create policy ingredients_admin on public.ingredients
  for all to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

drop policy if exists ingredients_par_menu_admin on public.ingredients_par_menu;
create policy ingredients_par_menu_admin on public.ingredients_par_menu
  for all to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

-- alertes : lecture par l'élève, ses parents liés et l'admin. Écriture uniquement par les fonctions RPC.
drop policy if exists alertes_lecture on public.alertes;
create policy alertes_lecture on public.alertes
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- =====================================================================
-- 5. FONCTIONS RPC (argent et statuts). Elles renvoient 'ok', un message d'erreur en français, ou un JSON quand c'est précisé.
-- =====================================================================


-- Réponse de refus de reserver() : { ok: false, message, alerte_allergie }
create or replace function public.reponse_refus(p_message text, p_allergenes text[] default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('ok', false, 'message', p_message, 'alerte_allergie', to_jsonb(p_allergenes));
$$;

-- Le profil alimentaire d'un élève : modifiable par l'élève, ses parents liés ou l'admin
create or replace function public.modifier_allergies(p_eleve_id uuid, p_allergies text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  liste text[] := array(select distinct unnest(coalesce(p_allergies, '{}')) order by 1);
begin
  if auth.uid() is null then
    return 'Connectez-vous pour modifier les allergies.';
  end if;
  if not (p_eleve_id = auth.uid() or public.est_parent_de(p_eleve_id) or public.mon_role() = 'admin') then
    return 'Seuls l''élève, ses parents et la cantine peuvent modifier ces allergies.';
  end if;
  if not exists (select 1 from public.profiles where id = p_eleve_id and role = 'eleve') then
    return 'Compte élève introuvable.';
  end if;
  if not liste <@ array['arachide', 'lait', 'gluten', 'poisson', 'oeuf'] then
    return 'Allergie inconnue : choisissez parmi arachide, lait, gluten, poisson et œuf.';
  end if;

  update public.profiles set allergies = liste where id = p_eleve_id;
  return 'ok';
end;
$$;

-- Les anciennes versions (2 et 3 paramètres, qui renvoyaient un texte) sont remplacées
drop function if exists public.reserver(bigint, time);
drop function if exists public.reserver(bigint, time, boolean);

-- Réserver le plat du jour ou son plat de remplacement. Renvoie { ok, message, alerte_allergie, code_retrait } :
-- alerte_allergie liste les allergènes du profil présents dans le plat. Sans p_accepte_allergie, la réservation
-- est refusée ; avec, elle est faite et une alerte est envoyée aux parents liés.
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

-- Annuler sa réservation avant l'heure limite : rembourse (plat du jour ou de remplacement) et crée le mouvement
create or replace function public.annuler(p_reservation_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resa      public.reservations;
  jour_menu date;
  nom_plat  text;
begin
  if auth.uid() is null then
    return 'Connecte-toi pour annuler.';
  end if;

  select * into resa from public.reservations where id = p_reservation_id for update;
  if not found or (resa.eleve_id <> auth.uid() and public.mon_role() is distinct from 'admin') then
    return 'Réservation introuvable.';
  end if;
  if resa.statut <> 'reservee' then
    return 'Cette réservation est déjà annulée ou servie.';
  end if;

  select jour, case when resa.alternative then plat_alternatif else plat end
  into jour_menu, nom_plat
  from public.menus where id = resa.menu_id;
  if now() >= public.heure_limite(jour_menu) then
    return 'Trop tard : on annule au plus tard la veille à 18 h, le repas est déjà prévu.';
  end if;

  update public.reservations set statut = 'annulee' where id = resa.id;
  update public.profiles set solde = solde + resa.montant where id = resa.eleve_id;
  insert into public.mouvements (eleve_id, montant, motif)
  values (resa.eleve_id, resa.montant, 'Remboursement : ' || nom_plat);

  return 'ok';
end;
$$;

-- Créditer le compte d'un élève ou employé (admin seulement, 100 000 FCFA maximum par crédit)
create or replace function public.crediter(p_eleve_id uuid, p_montant integer, p_motif text default 'Crédit cantine')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  motif_propre text := left(coalesce(nullif(trim(p_motif), ''), 'Crédit cantine'), 80);
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  if p_montant is null or p_montant <= 0 then
    return 'Le montant doit être positif.';
  end if;
  if p_montant > 100000 then
    return 'Le montant maximum est de 100 000 FCFA par crédit.';
  end if;

  update public.profiles set solde = solde + p_montant
  where id = p_eleve_id and role = 'eleve';
  if not found then
    return 'Élève introuvable.';
  end if;

  insert into public.mouvements (eleve_id, montant, motif)
  values (p_eleve_id, p_montant, motif_propre);

  return 'ok';
end;
$$;

-- Recharge Mobile Money simulée, par l'élève lui-même ou par son parent lié (rôle vérifié, 100 à 50 000 FCFA)
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
  if p_montant is null or p_montant < 100 then
    return 'Le montant minimum est de 100 FCFA.';
  end if;
  if p_montant > 50000 then
    return 'Le montant maximum est de 50 000 FCFA par recharge.';
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

-- Recherche d'un élève ou employé par nom ou e-mail (admin seulement, 8 résultats)
create or replace function public.chercher_personnes(p_texte text)
returns table (id uuid, nom text, email text, type_usager text, solde integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  recherche text := lower(trim(coalesce(p_texte, '')));
begin
  if public.mon_role() is distinct from 'admin' or length(recherche) < 2 then
    return;
  end if;

  return query
  select p.id, p.nom, p.email, p.type_usager, p.solde
  from public.profiles p
  where p.role = 'eleve'
    and (strpos(lower(p.nom), recherche) > 0 or strpos(lower(p.email), recherche) > 0)
  order by p.nom, p.email
  limit 8;
end;
$$;

-- Le parent lie un enfant en saisissant l'e-mail de son compte
create or replace function public.lier_enfant(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  compte record;
begin
  if public.mon_role() is distinct from 'parent' then
    return 'Réservé aux parents.';
  end if;
  if coalesce(trim(p_email), '') = '' then
    return 'Saisissez l''e-mail du compte de votre enfant.';
  end if;

  select id, role into compte from public.profiles
  where lower(email) = lower(trim(p_email));
  if compte.id is null then
    return 'Aucun compte CantiJuste avec cet e-mail.';
  end if;
  if compte.role <> 'eleve' then
    return 'Ce compte n''est pas un compte élève.';
  end if;
  if exists (select 1 from public.liens_parent where parent_id = auth.uid() and eleve_id = compte.id) then
    return 'Cet enfant est déjà lié à votre compte.';
  end if;

  insert into public.liens_parent (parent_id, eleve_id) values (auth.uid(), compte.id);
  return 'ok';
end;
$$;

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

-- Admin : commandes d'un jour de service, une ligne par réservation active
create or replace function public.commandes_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  plat           text,
  photo_url      text,
  alternative    boolean,
  code_retrait   text,
  statut         text,
  servie_le      timestamptz,
  allergies      text[]
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
    case when r.alternative then m.plat_alternatif else m.plat end,
    case when r.alternative then coalesce(nullif(m.photo_alternative, ''), m.photo_url) else m.photo_url end,
    r.alternative,
    r.code_retrait,
    r.statut,
    r.servie_le,
    p.allergies
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
  order by p.nom, r.id;
end;
$$;

-- Le parent (ou l'admin) marque une alerte comme lue
create or replace function public.marquer_alerte_lue(p_alerte_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  id_eleve uuid;
begin
  select eleve_id into id_eleve from public.alertes where id = p_alerte_id;
  if id_eleve is null or not (public.est_parent_de(id_eleve) or public.mon_role() = 'admin') then
    return 'Alerte introuvable.';
  end if;

  update public.alertes set lue = true where id = p_alerte_id;
  return 'ok';
end;
$$;

-- Admin : élèves allergiques qui mangent ce jour-là (version complète avec le régime : section 12)
drop function if exists public.allergies_du_jour(date);
create or replace function public.allergies_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  allergies      text[],
  plat           text,
  alternative    boolean,
  risques        text[],
  code_retrait   text
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
    r.code_retrait
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
    and cardinality(p.allergies) > 0
  order by 6 desc, p.nom;
end;
$$;

-- Les fonctions RPC ne sont appelables que par un utilisateur connecté
revoke execute on function public.annuler(bigint)                         from public, anon;
revoke execute on function public.crediter(uuid, integer, text)           from public, anon;
revoke execute on function public.recharger_mobile_money(uuid, integer, text) from public, anon;
revoke execute on function public.lier_enfant(text)                       from public, anon;
revoke execute on function public.marquer_servie(text)                    from public, anon;
revoke execute on function public.commandes_du_jour(date)                 from public, anon;
revoke execute on function public.reponse_refus(text, text[])             from public, anon;
revoke execute on function public.modifier_allergies(uuid, text[])        from public, anon;
revoke execute on function public.reserver(bigint, time, boolean, boolean) from public, anon;
revoke execute on function public.marquer_alerte_lue(bigint)              from public, anon;
revoke execute on function public.allergies_du_jour(date)                 from public, anon;
revoke execute on function public.chercher_personnes(text)                from public, anon;
grant  execute on function public.annuler(bigint)                         to authenticated;
grant  execute on function public.crediter(uuid, integer, text)           to authenticated;
grant  execute on function public.recharger_mobile_money(uuid, integer, text) to authenticated;
grant  execute on function public.lier_enfant(text)                       to authenticated;
grant  execute on function public.marquer_servie(text)                    to authenticated;
grant  execute on function public.commandes_du_jour(date)                 to authenticated;
grant  execute on function public.reponse_refus(text, text[])             to authenticated;
grant  execute on function public.modifier_allergies(uuid, text[])        to authenticated;
grant  execute on function public.reserver(bigint, time, boolean, boolean) to authenticated;
grant  execute on function public.marquer_alerte_lue(bigint)              to authenticated;
grant  execute on function public.allergies_du_jour(date)                 to authenticated;
grant  execute on function public.chercher_personnes(text)                to authenticated;

-- =====================================================================
-- 6. TEMPS RÉEL (les règles RLS s'appliquent aussi aux messages)
-- =====================================================================

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['profiles', 'menus', 'reservations', 'mouvements', 'avis', 'alertes'] loop
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
-- 7. DONNER LE RÔLE ADMIN (à lancer à la main, une fois, avec le bon e-mail)
-- =====================================================================
-- update public.profiles set role = 'admin' where email = 'admin@cantijuste.ci';

-- =====================================================================
-- 8. TABLEAU DE BORD ADMIN (aussi disponible seul : patch_tableau_de_bord.sql)
-- =====================================================================
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

-- =====================================================================
-- 9. FILES D'ATTENTE : créneau de passage (aussi disponible seul : patch_file_attente.sql)
-- =====================================================================
-- Ne casse rien : le créneau reste facultatif (null = pas de créneau choisi), les anciennes réservations restent valables.

-- Heure de passage choisie par l'élève (déjà prévue dans le schéma, cette ligne met à jour une base plus ancienne)
alter table public.reservations add column if not exists creneau time;

-- =====================================================================
-- Réglages de la file : une seule ligne (id = 1), lisible par tous, modifiable par l'admin
-- =====================================================================
create table if not exists public.reglages_file (
  id              integer primary key default 1 check (id = 1),
  guichets        integer not null default 2 check (guichets between 1 and 6),
  sec_sans_ticket integer not null default 30 check (sec_sans_ticket between 5 and 300),
  sec_avec_ticket integer not null default 20 check (sec_avec_ticket between 5 and 300)
);

insert into public.reglages_file (id) values (1) on conflict (id) do nothing;

alter table public.reglages_file enable row level security;

drop policy if exists reglages_file_lecture on public.reglages_file;
create policy reglages_file_lecture on public.reglages_file
  for select to authenticated
  using (true);

drop policy if exists reglages_file_ecriture_admin on public.reglages_file;
create policy reglages_file_ecriture_admin on public.reglages_file
  for update to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

-- Plafond d'un créneau : 75 % de ce que les guichets servent en 10 min avec le ticket (2 guichets, 20 s → 45 élèves)
create or replace function public.plafond_creneau(p_reglages public.reglages_file)
returns integer
language sql
immutable
set search_path = public
as $$
  select floor(0.75 * p_reglages.guichets * (60.0 / p_reglages.sec_avec_ticket) * 10)::integer;
$$;

-- =====================================================================
-- Affluence d'un jour : nombre de réservations par créneau de 10 min, de 11 h 50 à 12 h 50 (7 lignes, 0 si vide).
-- Seulement des nombres, jamais de nom : tout élève connecté peut la lire pour choisir son créneau.
-- =====================================================================
create or replace function public.affluence_creneaux(p_jour date)
returns table (creneau time, reservations integer, plafond integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.creneau,
    count(r.id)::integer,
    (select public.plafond_creneau(g) from public.reglages_file g where g.id = 1)
  from unnest(array[time '11:50', time '12:00', time '12:10', time '12:20', time '12:30', time '12:40', time '12:50']) as c(creneau)
  left join public.menus m on m.jour = p_jour
  left join public.reservations r on r.menu_id = m.id and r.creneau = c.creneau and r.statut <> 'annulee'
  group by c.creneau
  order by c.creneau;
$$;

revoke execute on function public.affluence_creneaux(date) from public, anon;
grant  execute on function public.affluence_creneaux(date) to authenticated;

-- Réserver le plat du jour ou son plat de remplacement. Renvoie { ok, message, alerte_allergie, code_retrait } :
-- alerte_allergie liste les allergènes du profil présents dans le plat. Sans p_accepte_allergie, la réservation
-- est refusée ; avec, elle est faite et une alerte est envoyée aux parents liés.
-- p_creneau (facultatif) : heure de passage, 11 h 50 à 12 h 50 de 10 en 10 min ; refusé si le créneau est complet (plafond).
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

revoke execute on function public.reserver(bigint, time, boolean, boolean) from public, anon;
grant  execute on function public.reserver(bigint, time, boolean, boolean) to authenticated;

-- =====================================================================
-- 10. STOCKS (aussi disponible seul : patch_stocks.sql)
-- =====================================================================
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
-- 11. INSIGHTS : avis, thèmes, codages, analyse, statistiques (aussi disponible seul : patch_insights.sql)
-- =====================================================================
-- CantiJuste : source de données du module Insights (avis des élèves, thèmes, codages). Relançable sans erreur (Supabase > SQL Editor).
-- Les avis sont notés dans l'appli (noter_repas) ou importés (importer_avis) ; les thèmes et les codages servent à les classer.

-- Une ancienne table « notes » devient « avis » (sans effet si elle n'existe pas)
do $$
begin
  if to_regclass('public.notes') is not null and to_regclass('public.avis') is null then
    alter table public.notes rename to avis;
  end if;
end;
$$;

create table if not exists public.avis (
  id          bigint generated always as identity primary key,
  eleve_id    uuid references public.profiles (id) on delete set null,
  menu_id     bigint references public.menus (id) on delete set null,
  plat        text not null,
  etoiles     integer not null check (etoiles between 1 and 5),
  commentaire text,
  source      text not null default 'appli' check (source in ('appli', 'import')),
  cree_le     timestamptz not null default now()
);

-- Commentaire de 280 caractères au plus
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avis_commentaire_court') then
    alter table public.avis add constraint avis_commentaire_court
      check (commentaire is null or char_length(commentaire) <= 280);
  end if;
end;
$$;

-- Une seule note par élève et par menu (les avis importés, sans élève, ne sont pas concernés)
alter table public.avis drop constraint if exists avis_eleve_id_menu_id_key;
create unique index if not exists avis_une_note_par_menu
  on public.avis (eleve_id, menu_id) where eleve_id is not null;

-- =====================================================================
-- THÈMES : la grille de codage partagée par l'IA et par le mode secours (mots-clés)
-- =====================================================================
create table if not exists public.themes (
  code      text primary key,
  libelle   text not null,
  mots_cles text[] not null default '{}'
);

insert into public.themes (code, libelle, mots_cles) values
  ('gout',        'Goût et saveur',        '{goût,gout,fade,salé,pimenté,piment,sauce,assaisonn,délicieux,doux,bon,mauvais}'),
  ('portion',     'Portion et quantité',   '{portion,quantité,"trop gros","trop petit","pas fini",reste,jeté,jeter,poubelle,faim,rassasi,beaucoup,peu}'),
  ('temperature', 'Température',           '{froid,tiède,chaud,réchauff,glacé}'),
  ('attente',     'Attente et file',       '{attente,attendu,attendre,file,queue,rang,long,lent,retard,rapide,vite}'),
  ('prix',        'Prix et solde',         '{prix,cher,solde,payer,argent,rembours,franc}'),
  ('variete',     'Variété du menu',       '{encore,toujours,"même plat",varié,variété,change,nouveau,répét}'),
  ('allergies',   'Allergies et sécurité', '{allerg,arachide,gluten,lactose,réaction,gratte,malade}'),
  ('accueil',     'Accueil et propreté',   '{accueil,sourire,poli,serveuse,serveur,propre,sale,table,couvert,mouche,hygiène}')
on conflict (code) do update set libelle = excluded.libelle, mots_cles = excluded.mots_cles;

-- =====================================================================
-- CODAGES : pour chaque avis, 1 à 3 thèmes avec un sentiment, une confiance et l'extrait qui le justifie
-- =====================================================================
create table if not exists public.codages (
  id        bigint generated always as identity primary key,
  avis_id   bigint not null references public.avis (id) on delete cascade,
  theme     text not null references public.themes (code),
  sentiment text not null check (sentiment in ('positif', 'neutre', 'negatif')),
  confiance numeric(3, 2) not null check (confiance between 0 and 1),
  extrait   text,
  source    text not null default 'ia' check (source in ('ia', 'mots_cles', 'humain')),
  statut    text not null default 'auto' check (statut in ('auto', 'a_revoir', 'valide', 'corrige', 'ignore')),
  cree_le   timestamptz not null default now(),
  unique (avis_id, theme)
);

-- Une base déjà créée accepte aussi le statut 'ignore' (codage écarté par l'humain : il ne compte dans aucun chiffre)
alter table public.codages drop constraint if exists codages_statut_check;
alter table public.codages add constraint codages_statut_check
  check (statut in ('auto', 'a_revoir', 'valide', 'corrige', 'ignore'));

create index if not exists codages_par_avis on public.codages (avis_id);

-- Un avis a au plus 3 codages
create or replace function public.limiter_codages()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.codages where avis_id = new.avis_id) >= 3 then
    raise exception 'Un avis a au plus 3 thèmes.';
  end if;
  return new;
end;
$$;

drop trigger if exists avant_ajout_codage on public.codages;
create trigger avant_ajout_codage
  before insert on public.codages
  for each row execute function public.limiter_codages();

-- =====================================================================
-- RLS : l'élève lit et note ses propres avis, l'admin lit tout, les thèmes sont lisibles par tous, les codages sont à l'admin
-- =====================================================================
alter table public.avis    enable row level security;
alter table public.themes  enable row level security;
alter table public.codages enable row level security;

-- Lecture : l'élève, le parent de l'élève et l'admin
drop policy if exists avis_lecture on public.avis;
create policy avis_lecture on public.avis
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- Écriture directe : seulement sur un repas servi (l'appli passe par noter_repas)
drop policy if exists avis_ajout_eleve on public.avis;
create policy avis_ajout_eleve on public.avis
  for insert to authenticated
  with check (
    eleve_id = auth.uid()
    and source = 'appli'
    and exists (
      select 1 from public.reservations r
      where r.eleve_id = auth.uid() and r.menu_id = avis.menu_id and r.statut = 'servie'
    )
  );

drop policy if exists avis_modification_eleve on public.avis;
create policy avis_modification_eleve on public.avis
  for update to authenticated
  using (eleve_id = auth.uid())
  with check (eleve_id = auth.uid() and source = 'appli');

drop policy if exists avis_gestion_admin on public.avis;
create policy avis_gestion_admin on public.avis
  for all to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

drop policy if exists themes_lecture on public.themes;
create policy themes_lecture on public.themes
  for select to authenticated
  using (true);

drop policy if exists codages_admin on public.codages;
create policy codages_admin on public.codages
  for all to authenticated
  using (public.mon_role() = 'admin')
  with check (public.mon_role() = 'admin');

revoke insert, update, delete on public.themes from authenticated, anon;

-- =====================================================================
-- noter_repas : l'élève note un repas qu'il a mangé (servi) ; on peut modifier sa note. Renvoie 'ok' ou un message.
-- =====================================================================
create or replace function public.noter_repas(p_menu_id bigint, p_etoiles integer, p_commentaire text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resa        public.reservations;
  nom_plat    text;
  mot         text := nullif(trim(coalesce(p_commentaire, '')), '');
begin
  if auth.uid() is null or public.mon_role() is distinct from 'eleve' then
    return 'Seul un élève ou un employé peut noter un repas.';
  end if;
  if p_etoiles is null or p_etoiles not between 1 and 5 then
    return 'Choisis entre 1 et 5 étoiles.';
  end if;
  if mot is not null and char_length(mot) > 280 then
    return 'Ton mot est trop long (280 caractères au plus).';
  end if;

  select * into resa from public.reservations
  where eleve_id = auth.uid() and menu_id = p_menu_id and statut = 'servie';
  if not found then
    return 'Tu pourras noter ce repas une fois servi.';
  end if;

  select case when resa.alternative then m.plat_alternatif else m.plat end into nom_plat
  from public.menus m where m.id = p_menu_id;

  insert into public.avis (eleve_id, menu_id, plat, etoiles, commentaire, source)
  values (auth.uid(), p_menu_id, nom_plat, p_etoiles, mot, 'appli')
  on conflict (eleve_id, menu_id) where eleve_id is not null
  do update set etoiles = excluded.etoiles, commentaire = excluded.commentaire;

  return 'ok';
end;
$$;

-- =====================================================================
-- importer_avis : l'admin importe des avis papier ou CSV. p_lignes = [{ "date": "2026-11-18", "plat": "Garba maison", "etoiles": 4, "commentaire": "..." }]
-- Renvoie { importes: N, rejetes: [{ ligne: 3, raison: "..." }] } (ligne = numéro à partir de 1)
-- =====================================================================
create or replace function public.importer_avis(p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne      jsonb;
  numero     integer := 0;
  importes   integer := 0;
  rejetes    jsonb := '[]'::jsonb;
  jour_avis  date;
  nom_plat   text;
  note       integer;
  mot        text;
  raison     text;
begin
  if public.mon_role() is distinct from 'admin' then
    return jsonb_build_object('importes', 0, 'rejetes', jsonb_build_array(jsonb_build_object('ligne', 0, 'raison', 'Réservé à l''administrateur.')));
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    return jsonb_build_object('importes', 0, 'rejetes', jsonb_build_array(jsonb_build_object('ligne', 0, 'raison', 'Le fichier doit contenir une liste d''avis.')));
  end if;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    numero := numero + 1;
    raison := null;
    nom_plat := nullif(trim(coalesce(ligne ->> 'plat', '')), '');
    mot := nullif(trim(coalesce(ligne ->> 'commentaire', '')), '');

    begin
      jour_avis := (ligne ->> 'date')::date;
    exception when others then
      jour_avis := null;
    end;
    begin
      note := (ligne ->> 'etoiles')::integer;
    exception when others then
      note := null;
    end;

    if nom_plat is null then
      raison := 'plat manquant';
    elsif note is null or note not between 1 and 5 then
      raison := 'étoiles entre 1 et 5 attendues';
    elsif jour_avis is null then
      raison := 'date invalide (AAAA-MM-JJ attendu)';
    elsif mot is not null and char_length(mot) > 280 then
      raison := 'commentaire de plus de 280 caractères';
    end if;

    if raison is not null then
      rejetes := rejetes || jsonb_build_array(jsonb_build_object('ligne', numero, 'raison', raison));
    else
      insert into public.avis (eleve_id, menu_id, plat, etoiles, commentaire, source, cree_le)
      values (
        null,
        (select m.id from public.menus m where m.jour = jour_avis and (m.plat = nom_plat or m.plat_alternatif = nom_plat) limit 1),
        nom_plat, note, mot, 'import',
        (jour_avis + time '12:00') at time zone 'Africa/Abidjan'
      );
      importes := importes + 1;
    end if;
  end loop;

  return jsonb_build_object('importes', importes, 'rejetes', rejetes);
end;
$$;

revoke execute on function public.noter_repas(bigint, integer, text) from public, anon;
revoke execute on function public.importer_avis(jsonb)               from public, anon;
grant  execute on function public.noter_repas(bigint, integer, text) to authenticated;
grant  execute on function public.importer_avis(jsonb)               to authenticated;

-- =====================================================================
-- DÉMO : generer_avis_demo(nombre) crée des avis réalistes sur les 4 dernières semaines (jours ouvrés)
-- Tendances voulues : file d'attente de plus en plus critiquée depuis 2 semaines, foutou « trop grande portion »,
-- garba le plus aimé, inquiétude sur le riz sauce arachide, « tiède » surtout le lundi, ~8 % d'avis pièges.
-- Les avis générés sont sans élève (eleve_id null, source 'import') et non codés : c'est à Insights de les coder.
-- =====================================================================
create or replace function public.generer_avis_demo(p_nombre integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  phrases constant jsonb := $j$
  {
   "gout": {
    "positif": ["Franchement c'est bon, la sauce est bien relevée.", "Ça avait vraiment du goût aujourd'hui, bravo la cuisine.", "J'ai adoré, c'est comme à la maison.", "Délicieux, j'ai léché l'assiette.", "Bien assaisonné, ni trop salé ni trop fade.", "Le goût est top, je reviens demain sans hésiter."],
    "neutre": ["C'est correct, rien d'extraordinaire.", "Le goût est moyen, ça passe.", "Ni bon ni mauvais, ça cale le ventre.", "Un peu de piment en plus et ce serait mieux.", "Normal, comme d'habitude.", "Ça va, j'ai déjà mangé mieux mais j'ai déjà mangé pire."],
    "negatif": ["C'était fade, on dirait qu'ils ont oublié le sel.", "Beaucoup trop salé, j'ai bu trois bouteilles d'eau après.", "La sauce n'avait aucun goût aujourd'hui.", "Trop de piment, j'ai pleuré en mangeant.", "Franchement mauvais, je n'ai pas aimé du tout.", "Ça sentait le brûlé, le goût aussi."]
   },
   "portion": {
    "positif": ["La portion est bien servie, je suis rassasié.", "Assiette bien remplie, merci la cuisine.", "J'ai eu assez à manger, ça tient jusqu'au soir.", "Bonne quantité pour le prix, c'est correct.", "Servi généreusement aujourd'hui, ça fait plaisir.", "Rassasié, je n'ai plus eu faim de l'après-midi."],
    "neutre": ["La portion est normale, ni trop ni trop peu.", "Quantité correcte, j'aurais pris un peu plus de riz.", "Ça suffit juste pour la journée.", "Portion moyenne, ça dépend de qui sert.", "Assez pour moi mais pas pour mes grands frères.", "Pas mal servi, mais la viande était petite."],
    "negatif": ["La portion est trop petite, j'avais encore faim après.", "Trop peu de viande, juste la sauce.", "J'ai eu faim une heure après le repas.", "On nous sert de moins en moins, c'est dommage.", "Assiette trop légère pour un garçon qui a sport l'après-midi.", "Il y avait beaucoup de reste dans la marmite et on nous donne si peu."]
   },
   "temperature": {
    "positif": ["Servi bien chaud, ça change tout.", "Le plat était chaud, c'est ce qu'il faut.", "Chaud comme il faut, j'ai bien mangé.", "Enfin un plat chaud jusqu'au bout.", "Bien chaud, la sauce fumait encore.", "Température parfaite aujourd'hui."],
    "neutre": ["Plutôt tiède mais ça passe.", "À peine chaud, mais je n'ai pas trop attendu.", "Température correcte, sans plus.", "Pas brûlant, pas froid non plus.", "Ça aurait pu être plus chaud, mais ça va.", "Chaud au début, un peu moins à la fin."],
    "negatif": ["Le plat était tiède, c'est pas agréable.", "Tiède encore, comme chaque lundi.", "Tiède, on dirait qu'il a attendu longtemps avant d'être servi.", "Mon repas est arrivé tiède, la sauce commençait à figer.", "C'était froid, j'ai dû le manger quand même.", "Froid au milieu, vraiment pas agréable."]
   },
   "attente": {
    "positif": ["Pas de file aujourd'hui, j'ai été servi vite.", "Rapide, j'ai mangé tranquillement avant la sonnerie.", "Le ticket avec le créneau a marché, zéro attente.", "J'ai passé à l'heure indiquée, c'était fluide.", "Servi en deux minutes, nickel.", "Ça avance bien, bravo pour le créneau."],
    "neutre": ["Un peu d'attente mais ça reste raisonnable.", "La file avançait, j'ai attendu dix minutes.", "Ça dépend de l'heure, à midi pile c'est plus long.", "Pas trop long aujourd'hui, mais pas rapide non plus.", "J'ai attendu un peu, rien de grave.", "La file était normale pour un jour comme ça."],
    "negatif": ["La file est interminable, j'ai attendu plus de 30 minutes.", "J'ai passé presque toute la pause dans la queue.", "Trop long, il ne reste plus de temps pour manger.", "On attend de plus en plus longtemps, c'est fatigant.", "Quand j'ai eu mon plat, la sonnerie sonnait déjà.", "Une seule file pour tout le monde, c'est n'importe quoi."]
   },
   "prix": {
    "positif": ["1 000 F pour manger comme ça, c'est donné.", "Le prix est très correct pour la qualité.", "Pas cher du tout, merci pour les parents.", "Ça vaut largement le prix.", "Avec 1 000 F j'ai un vrai repas, c'est bien.", "Le solde est facile à suivre, j'aime bien."],
    "neutre": ["Le prix est correct, sans plus.", "Ça passe pour le prix, rien à dire.", "J'ai dû recharger mon solde, c'est un peu long mais ça va.", "Pas trop cher, mais pas donné non plus.", "Le prix est normal par rapport à l'extérieur.", "Moins cher que chez la dame devant l'école, c'est déjà ça."],
    "negatif": ["C'est trop cher pour la quantité servie.", "Mille francs pour ça, quand même.", "Mon solde est parti trop vite cette semaine.", "J'ai payé mais je n'ai pas eu ce que j'attendais.", "Le prix augmente mais pas la portion.", "Trop cher pour les familles qui ont plusieurs enfants."]
   },
   "variete": {
    "positif": ["Bien de voir un plat nouveau au menu.", "Le menu change, c'est ce que j'aime.", "Bonne variété cette semaine, merci.", "Un nouveau plat, je suis curieux de goûter chaque semaine.", "On a de quoi choisir, c'est bien.", "Ça change des habitudes, bravo."],
    "neutre": ["Le menu est correct mais on connaît déjà tout.", "On revoit souvent les mêmes plats, mais ils sont bons.", "Un peu de nouveauté serait bien.", "Variété moyenne cette semaine.", "Ça se répète, mais ça ne me dérange pas trop.", "Pas mal de choix, mais toujours les mêmes sauces."],
    "negatif": ["Encore le même plat, on en a marre.", "On mange toujours la même chose, c'est lassant.", "Pas de variété du tout cette semaine.", "Toujours du riz, on aimerait autre chose.", "Le menu se répète trop souvent.", "Même plat que la semaine dernière, franchement."]
   },
   "allergies": {
    "positif": ["Merci d'avoir remplacé le plat pour mon allergie, j'ai mangé sans stress.", "On m'a bien prévenu pour l'arachide, c'est rassurant.", "Mon alternative sans arachide était très bonne.", "L'équipe fait attention aux allergies, merci.", "Mon plat de remplacement était prêt à l'avance, bravo.", "Je me sens en sécurité pour manger ici."],
    "neutre": ["J'ai demandé s'il y avait de l'arachide, on m'a répondu.", "Je vérifie toujours avant de manger à cause de mon allergie.", "L'étiquette des allergènes aurait pu être plus visible.", "Pas de problème pour moi aujourd'hui, mais je reste prudent.", "On m'a proposé un autre plat, je n'ai pas encore goûté.", "Mon ami allergique a dû poser trois questions avant de manger."],
    "negatif": ["Je suis allergique à l'arachide et j'ai eu peur de manger.", "Je n'ai pas osé manger, j'avais peur de l'arachide dans la sauce.", "Ma sœur a eu des démangeaisons après le repas, c'est inquiétant.", "Personne ne m'a prévenu pour l'arachide, j'ai failli en manger.", "Pas de plat de remplacement pour moi, j'ai dû rester sans manger.", "Mon fils allergique n'a pas pu manger ici aujourd'hui, c'est grave."]
   },
   "accueil": {
    "positif": ["Les serveuses sont gentilles, toujours avec le sourire.", "Tout est propre, ça donne envie de manger.", "Très bon accueil, on se sent respecté.", "La dame m'a même appelé par mon prénom, ça fait plaisir.", "Les tables étaient propres et les couverts aussi.", "Une équipe polie et rapide, merci."],
    "neutre": ["L'accueil est correct, sans plus.", "Un peu de désordre autour des tables mais ça va.", "Pas de souci avec le service.", "Les serveurs font ce qu'ils peuvent avec tout ce monde.", "Propre dans l'ensemble, quelques tables à nettoyer.", "Ça pourrait être plus accueillant mais c'est correct."],
    "negatif": ["Les tables étaient sales, il y avait des mouches.", "On m'a répondu sèchement, pas très poli.", "Les couverts n'étaient pas propres, ça gâche le repas.", "Personne n'a nettoyé les tables après les premiers passages.", "Le serveur ne m'a même pas regardé, c'est vexant.", "Pas d'accueil du tout, on nous sert comme des numéros."]
   }
  }
  $j$::jsonb;
  pieges constant jsonb := $j$
  {
   "ironie": ["Super, encore 40 minutes de queue, j'adore avoir faim.", "Bravo la cantine, le plat est arrivé froid comme je l'aime.", "Génial, une portion pour une fourmi, merci beaucoup.", "Trop bien, on mange la même chose pour la quatrième fois.", "Excellent, j'ai pu admirer le plafond pendant toute la file.", "Quel régal, la sauce n'avait pas de goût, c'est tellement original."],
   "cinq_plainte": ["Le plat est top mais j'ai attendu 40 minutes.", "J'adore le goût, dommage que ce soit tiède.", "Cinq étoiles pour le cuisinier, zéro pour la file d'attente.", "Très bon plat, mais la portion est petite.", "Super repas, sauf que la table était sale.", "Mon plat préféré, mais j'ai eu peur pour l'arachide."]
  }
  $j$::jsonb;
  plats constant text[] := array['Garba maison', 'Garba au piment doux', 'Kédjénou de poulet', 'Attiéké poisson braisé', 'Riz sauce arachide', 'Foutou sauce claire', 'Alloco poulet', 'Placali sauce gombo'];
  poids constant integer[] := array[18, 14, 14, 14, 14, 12, 7, 7];
  themes_liste constant text[] := array['gout', 'portion', 'temperature', 'attente', 'prix', 'variete', 'allergies', 'accueil'];
  jours date[];
  i integer;
  n integer := greatest(coalesce(p_nombre, 0), 0);
  v_jour date;
  recent boolean;
  lundi boolean;
  v_plat text;
  tirage numeric;
  cumul integer;
  k integer;
  nb_themes integer;
  theme text;
  theme2 text;
  sent text;
  p_pos numeric;
  p_neg numeric;
  phrase text;
  commentaire text;
  etoiles integer;
  somme integer;
  nb_ok integer;
  piege numeric;
  type_piege text;
  v_menu bigint;
  cree timestamptz;
  total integer := 0;
begin
  if not (session_user in ('postgres', 'supabase_admin') or public.mon_role() = 'admin') then
    raise exception 'Réservé à l''administration.';
  end if;
  if n > 5000 then
    raise exception 'Maximum 5 000 avis par appel.';
  end if;

  perform setseed(0.37);

  select array_agg(d::date order by d) into jours
  from generate_series(current_date - 28, current_date - 1, interval '1 day') as d
  where extract(isodow from d) between 1 and 5;

  for i in 1..n loop
    v_jour := jours[1 + floor(random() * array_length(jours, 1))::int];
    recent := v_jour >= current_date - 14;
    lundi := extract(isodow from v_jour) = 1;

    tirage := random() * 107;
    cumul := 0;
    v_plat := plats[1];
    for k in 1..array_length(plats, 1) loop
      cumul := cumul + poids[k];
      if tirage < cumul then
        v_plat := plats[k];
        exit;
      end if;
    end loop;

    -- Premier thème, selon les tendances voulues
    tirage := random();
    if v_plat = 'Riz sauce arachide' and tirage < 0.30 then
      theme := 'allergies';
    elsif v_plat = 'Foutou sauce claire' and tirage < 0.60 then
      theme := 'portion';
    elsif lundi and tirage < 0.35 then
      theme := 'temperature';
    elsif recent and tirage < 0.35 then
      theme := 'attente';
    elsif v_plat like 'Garba%' and tirage < 0.40 then
      theme := 'gout';
    else
      theme := themes_liste[1 + floor(random() * 8)::int];
    end if;
    -- Pas d'allergies hors riz arachide, sauf rarement
    if theme = 'allergies' and v_plat <> 'Riz sauce arachide' and random() < 0.7 then
      theme := 'gout';
    end if;

    nb_themes := case when random() < 0.45 then 2 else 1 end;
    commentaire := null;
    somme := 0;
    nb_ok := 0;
    k := 0;

    for k in 1..nb_themes loop
      if k = 2 then
        theme2 := themes_liste[1 + floor(random() * 8)::int];
        exit when theme2 = theme or (theme2 = 'allergies' and v_plat <> 'Riz sauce arachide');
        theme := theme2;
      end if;

      -- Probabilités de sentiment selon la tendance
      p_pos := 0.50;
      p_neg := 0.30;
      if theme = 'attente' then
        if recent then p_pos := 0.10; p_neg := 0.75; else p_pos := 0.40; p_neg := 0.30; end if;
      elsif theme = 'temperature' then
        if lundi then p_pos := 0.05; p_neg := 0.85; else p_pos := 0.60; p_neg := 0.15; end if;
      elsif theme = 'portion' and v_plat = 'Foutou sauce claire' then
        p_pos := 0.10; p_neg := 0.80;
      elsif theme = 'gout' and v_plat like 'Garba%' then
        p_pos := 0.88; p_neg := 0.04;
      elsif theme = 'allergies' then
        p_pos := 0.10; p_neg := 0.55;
      end if;

      tirage := random();
      sent := case when tirage < p_pos then 'positif' when tirage < p_pos + p_neg then 'negatif' else 'neutre' end;
      somme := somme + case sent when 'positif' then 5 when 'neutre' then 3 else 1 end;
      nb_ok := nb_ok + 1;

      -- Phrases choisies, avec cas particuliers
      if theme = 'portion' and v_plat = 'Foutou sauce claire' and sent = 'negatif' then
        phrase := (array[
          'Portion trop grande, j''ai pas fini.',
          'Le foutou est énorme, j''ai pas pu finir mon assiette.',
          'Trop de foutou, j''en ai jeté la moitié, quel gaspillage.',
          'La boule de foutou est trop grosse, j''ai pas fini et c''est dommage.'])[1 + floor(random() * 4)::int];
      elsif theme = 'temperature' and sent = 'negatif' then
        phrase := phrases -> theme -> sent ->> (case when lundi then floor(random() * 4)::int else 4 + floor(random() * 2)::int end);
      else
        phrase := phrases -> theme -> sent ->> floor(random() * 6)::int;
      end if;
      commentaire := coalesce(commentaire || ' ', '') || phrase;
    end loop;

    etoiles := greatest(1, least(5, round(somme::numeric / greatest(nb_ok, 1))::int + (floor(random() * 3)::int - 1)));
    if v_plat like 'Garba%' then
      etoiles := least(5, etoiles + 1);
    end if;

    -- Avis pièges (~8 %) : ironie, 5 étoiles avec plainte, ou note sans commentaire
    piege := random();
    if piege < 0.08 then
      type_piege := (array['ironie', 'cinq_plainte', 'sans_commentaire'])[1 + floor(random() * 3)::int];
      if type_piege = 'ironie' then
        commentaire := pieges -> 'ironie' ->> floor(random() * 6)::int;
        etoiles := 1 + floor(random() * 2)::int;
      elsif type_piege = 'cinq_plainte' then
        commentaire := pieges -> 'cinq_plainte' ->> floor(random() * 6)::int;
        etoiles := 5;
      else
        commentaire := null;
      end if;
    end if;

    select m.id into v_menu from public.menus m where m.jour = v_jour and m.plat = v_plat limit 1;
    cree := ((v_jour + time '12:00' + random() * interval '3 hours') at time zone 'Africa/Abidjan');

    insert into public.avis (eleve_id, menu_id, plat, etoiles, commentaire, source, cree_le)
    values (null, v_menu, v_plat, etoiles, left(commentaire, 280), 'import', cree);
    total := total + 1;
  end loop;

  return total;
end;
$$;

revoke all on function public.generer_avis_demo(integer) from public, anon;
grant execute on function public.generer_avis_demo(integer) to authenticated;

-- =====================================================================
-- ANALYSE : l'IA (ou le mode secours en mots-clés) propose des codages, le SQL décide du statut, l'humain tranche
-- =====================================================================

-- Admin : avis qui n'ont encore aucun codage (le plus ancien d'abord)
create or replace function public.avis_sans_codage(p_limite integer default 1000)
returns table (id bigint, plat text, etoiles integer, commentaire text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  return query
    select a.id, a.plat, a.etoiles, a.commentaire
    from public.avis a
    where not exists (select 1 from public.codages c where c.avis_id = a.id)
    order by a.cree_le, a.id
    limit greatest(coalesce(p_limite, 1000), 1);
end;
$$;

-- Admin : enregistre des codages. p_resultats = [{ "id": 12, "codages": [{ "theme", "sentiment", "confiance", "extrait" }] }]
-- Le statut est calculé ici, toujours de la même façon :
--   'a_revoir' si confiance < 0,7, OU si le sentiment contredit les étoiles (positif avec 1-2 étoiles, négatif avec 4-5),
--   OU si le thème n'est pas dans la table themes (il est alors rangé sous 'gout') ; sinon 'auto'.
-- Un avis déjà codé est ignoré : on peut relancer sans doublon. Renvoie { enregistres, avis_ignores }.
create or replace function public.enregistrer_codages(p_resultats jsonb, p_source text default 'ia')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultat     jsonb;
  codage       jsonb;
  lignes       jsonb := case when jsonb_typeof(p_resultats) = 'object' then p_resultats -> 'resultats' else p_resultats end;
  id_avis      bigint;
  note         integer;
  theme_lu     text;
  theme_final  text;
  sentiment_lu text;
  conf         numeric;
  statut_final text;
  nb_codes     integer;
  enregistres  integer := 0;
  ignores      integer := 0;
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  if p_source not in ('ia', 'mots_cles') then
    raise exception 'Source inconnue : % (ia ou mots_cles).', p_source;
  end if;
  if lignes is null or jsonb_typeof(lignes) <> 'array' then
    raise exception 'Résultats attendus : une liste de { id, codages }.';
  end if;

  for resultat in select * from jsonb_array_elements(lignes) loop
    id_avis := nullif(resultat ->> 'id', '')::bigint;
    select a.etoiles into note from public.avis a where a.id = id_avis;
    if note is null or exists (select 1 from public.codages c where c.avis_id = id_avis) then
      ignores := ignores + 1;
      continue;
    end if;

    nb_codes := 0;
    for codage in select * from jsonb_array_elements(coalesce(resultat -> 'codages', '[]'::jsonb)) loop
      exit when nb_codes >= 3;
      theme_lu := codage ->> 'theme';
      sentiment_lu := codage ->> 'sentiment';
      conf := least(1, greatest(0, coalesce(nullif(codage ->> 'confiance', '')::numeric, 0)));
      statut_final := 'auto';

      if theme_lu is null or not exists (select 1 from public.themes t where t.code = theme_lu) then
        theme_final := 'gout';
        statut_final := 'a_revoir';
      else
        theme_final := theme_lu;
      end if;
      if sentiment_lu is null or sentiment_lu not in ('positif', 'neutre', 'negatif') then
        sentiment_lu := 'neutre';
        statut_final := 'a_revoir';
      end if;
      if conf < 0.7
         or (sentiment_lu = 'positif' and note <= 2)
         or (sentiment_lu = 'negatif' and note >= 4) then
        statut_final := 'a_revoir';
      end if;

      insert into public.codages (avis_id, theme, sentiment, confiance, extrait, source, statut)
      values (id_avis, theme_final, sentiment_lu, round(conf, 2), left(codage ->> 'extrait', 200), p_source, statut_final)
      on conflict (avis_id, theme) do nothing;
      if found then
        nb_codes := nb_codes + 1;
        enregistres := enregistres + 1;
      end if;
    end loop;
    if nb_codes = 0 then
      ignores := ignores + 1;
    end if;
  end loop;

  return jsonb_build_object('enregistres', enregistres, 'avis_ignores', ignores);
end;
$$;

-- Admin : l'humain tranche un codage. Rien ne change → 'valide' ; sinon corrigé (source 'humain', statut 'corrige'). Renvoie 'ok' ou un message.
create or replace function public.reviser_codage(p_codage_id bigint, p_theme text, p_sentiment text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actuel public.codages;
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  select * into actuel from public.codages where id = p_codage_id for update;
  if not found then
    return 'Ce codage n''existe plus.';
  end if;
  if not exists (select 1 from public.themes t where t.code = p_theme) then
    return 'Thème inconnu.';
  end if;
  if p_sentiment is null or p_sentiment not in ('positif', 'neutre', 'negatif') then
    return 'Sentiment inconnu.';
  end if;

  if p_theme = actuel.theme and p_sentiment = actuel.sentiment then
    update public.codages set statut = 'valide' where id = p_codage_id;
    return 'ok';
  end if;
  if p_theme <> actuel.theme and exists (
    select 1 from public.codages c where c.avis_id = actuel.avis_id and c.theme = p_theme
  ) then
    return 'Cet avis a déjà ce thème.';
  end if;

  update public.codages
  set theme = p_theme, sentiment = p_sentiment, source = 'humain', statut = 'corrige'
  where id = p_codage_id;
  return 'ok';
end;
$$;

revoke execute on function public.avis_sans_codage(integer)               from public, anon;
revoke execute on function public.enregistrer_codages(jsonb, text)        from public, anon;
revoke execute on function public.reviser_codage(bigint, text, text)      from public, anon;
grant  execute on function public.avis_sans_codage(integer)               to authenticated;
grant  execute on function public.enregistrer_codages(jsonb, text)        to authenticated;
grant  execute on function public.reviser_codage(bigint, text, text)      to authenticated;


-- =====================================================================
-- ÉCRAN INSIGHTS : tous les chiffres sont calculés ici. Seuls les codages 'auto', 'valide' et 'corrige' comptent (jamais 'a_revoir' ni 'ignore').
-- =====================================================================

-- Admin : les « ignorer » de la file de revue. Le codage reste en base mais ne compte plus. Renvoie 'ok' ou un message.
create or replace function public.ignorer_codage(p_codage_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    return 'Réservé à l''administrateur.';
  end if;
  update public.codages set statut = 'ignore' where id = p_codage_id;
  if not found then
    return 'Ce codage n''existe plus.';
  end if;
  return 'ok';
end;
$$;

-- Admin : tous les chiffres de l'écran Insights pour la période [p_debut, p_fin] (jours inclus, date de l'avis).
-- Évolution = variation du nombre de codages négatifs par rapport à la période précédente de même durée.
-- « Portion trop grande » = avis dont un codage compté est 'portion' + 'negatif' ET dont le texte parle d'un excès (trop grand, trop gros, pas fini, jeté, reste...).
create or replace function public.stats_insights(p_debut date, p_fin date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  duree         integer;
  debut_prec    date;
  fin_prec      date;
  resultat      jsonb;
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  if p_debut is null or p_fin is null or p_fin < p_debut then
    raise exception 'Période invalide.';
  end if;
  duree := p_fin - p_debut + 1;
  fin_prec := p_debut - 1;
  debut_prec := p_debut - duree;

  with
  compte as (
    select c.id, c.avis_id, c.theme, c.sentiment, c.statut, c.source, c.extrait, c.confiance, a.cree_le::date as jour, a.plat, a.etoiles
    from public.codages c
    join public.avis a on a.id = c.avis_id
    where c.statut in ('auto', 'valide', 'corrige')
  ),
  par_theme as (
    select t.code, t.libelle,
      count(distinct x.avis_id) filter (where x.jour between p_debut and p_fin) as avis,
      count(*) filter (where x.jour between p_debut and p_fin and x.sentiment = 'positif') as positif,
      count(*) filter (where x.jour between p_debut and p_fin and x.sentiment = 'neutre')  as neutre,
      count(*) filter (where x.jour between p_debut and p_fin and x.sentiment = 'negatif') as negatif,
      count(*) filter (where x.jour between debut_prec and fin_prec and x.sentiment = 'negatif') as negatif_prec,
      count(distinct x.avis_id) filter (where x.jour between debut_prec and fin_prec) as avis_prec
    from public.themes t
    left join compte x on x.theme = t.code
    group by t.code, t.libelle
  ),
  themes_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', p.code,
      'libelle', p.libelle,
      'avis', p.avis,
      'positif', p.positif,
      'neutre', p.neutre,
      'negatif', p.negatif,
      'avis_prec', p.avis_prec,
      'negatif_prec', p.negatif_prec,
      'evolution_negatifs', case when p.negatif_prec > 0 then round((p.negatif - p.negatif_prec) * 100.0 / p.negatif_prec)::int end,
      'extrait', e.extrait,
      'plat_extrait', e.plat,
      'sentiment_extrait', e.sentiment
    ) order by p.avis desc, p.libelle), '[]'::jsonb) as liste
    from par_theme p
    left join lateral (
      select x.extrait, x.plat, x.sentiment
      from compte x
      where x.theme = p.code and x.jour between p_debut and p_fin and char_length(coalesce(x.extrait, '')) >= 15
      order by (x.sentiment = case
                  when p.negatif >= p.positif and p.negatif >= p.neutre then 'negatif'
                  when p.positif >= p.neutre then 'positif' else 'neutre' end) desc,
               x.confiance desc, x.jour desc, x.id desc
      limit 1
    ) e on true
    where p.avis > 0
  ),
  service as (
    select m.plat,
      count(*) filter (where r.statut = 'reservee') as non_servis,
      count(*) filter (where r.statut in ('servie', 'reservee')) as reserves
    from public.reservations r
    join public.menus m on m.id = r.menu_id
    where m.jour < current_date
    group by m.plat
  ),
  par_plat as (
    select a.plat,
      count(*) as avis,
      count(*) filter (
        where exists (select 1 from compte x where x.avis_id = a.id and x.theme = 'portion' and x.sentiment = 'negatif')
          and a.commentaire ~* '(trop (grand|gros|copieu|plein|rempli)|énorm|enorm|pas fini|pas pu finir|jeté|jete|gaspill|poubelle|reste)'
      ) as trop_grande
    from public.avis a
    where a.cree_le::date between p_debut and p_fin
    group by a.plat
    having count(*) >= 5
  ),
  portion_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'plat', pp.plat,
      'avis', pp.avis,
      'trop_grande', pp.trop_grande,
      'part_pct', round(pp.trop_grande * 100.0 / pp.avis)::int,
      'taux_non_servis', case when s.reserves > 0 then round(s.non_servis * 100.0 / s.reserves, 1) end
    ) order by pp.trop_grande * 1.0 / pp.avis desc, pp.plat), '[]'::jsonb) as liste
    from (select * from par_plat order by trop_grande * 1.0 / avis desc, plat limit 6) pp
    left join service s on s.plat = pp.plat
  )
  select jsonb_build_object(
    'debut', p_debut,
    'fin', p_fin,
    'avis_total', (select count(*) from public.avis a where a.cree_le::date between p_debut and p_fin),
    'avis_analyses', (select count(distinct x.avis_id) from compte x where x.jour between p_debut and p_fin),
    'avis_sans_codage', (select count(*) from public.avis a where a.cree_le::date between p_debut and p_fin
                           and not exists (select 1 from public.codages c where c.avis_id = a.id)),
    'codages_a_revoir', (select count(*) from public.codages c where c.statut = 'a_revoir'),
    'note_moyenne', (select round(avg(a.etoiles), 1) from public.avis a where a.cree_le::date between p_debut and p_fin),
    'valides', (select count(*) from compte x where x.statut = 'valide' and x.jour between p_debut and p_fin),
    'corriges', (select count(*) from compte x where x.statut = 'corrige' and x.jour between p_debut and p_fin),
    'accord_ia_humain', (select case when count(*) > 0
                                 then round(count(*) filter (where x.statut = 'valide') * 100.0 / count(*)) end
                         from compte x where x.statut in ('valide', 'corrige')),
    'sources', (select jsonb_build_object(
                  'ia', count(*) filter (where x.source = 'ia'),
                  'mots_cles', count(*) filter (where x.source = 'mots_cles'),
                  'humain', count(*) filter (where x.source = 'humain'))
                from compte x where x.jour between p_debut and p_fin),
    'themes', (select liste from themes_json),
    'portion', (select liste from portion_json)
  ) into resultat;

  return resultat;
end;
$$;

-- Admin : les avis d'un thème sur la période (codages comptés seulement), les plus récents d'abord
create or replace function public.avis_du_theme(p_theme text, p_debut date, p_fin date, p_limite integer default 60)
returns table (avis_id bigint, cree_le timestamptz, plat text, etoiles integer, commentaire text, sentiment text, confiance numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  return query
    select a.id, a.cree_le, a.plat, a.etoiles, a.commentaire, c.sentiment, c.confiance
    from public.codages c
    join public.avis a on a.id = c.avis_id
    where c.theme = p_theme
      and c.statut in ('auto', 'valide', 'corrige')
      and a.cree_le::date between p_debut and p_fin
    order by a.cree_le desc, a.id desc
    limit greatest(coalesce(p_limite, 60), 1);
end;
$$;

-- Admin : la file de revue humaine (codages 'a_revoir'), les moins sûrs d'abord. total = nombre de codages à revoir en tout.
create or replace function public.file_revue(p_limite integer default 30)
returns table (
  codage_id bigint, avis_id bigint, cree_le timestamptz, plat text, etoiles integer, commentaire text,
  theme text, theme_libelle text, sentiment text, confiance numeric, extrait text, source text, total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  return query
    select c.id, a.id, a.cree_le, a.plat, a.etoiles, a.commentaire,
           c.theme, t.libelle, c.sentiment, c.confiance, c.extrait, c.source,
           count(*) over ()
    from public.codages c
    join public.avis a on a.id = c.avis_id
    join public.themes t on t.code = c.theme
    where c.statut = 'a_revoir'
    order by c.confiance asc, a.cree_le desc, c.id
    limit greatest(coalesce(p_limite, 30), 1);
end;
$$;

-- Admin : une ligne par codage pour le tableur (tous statuts : la colonne « statut » permet de filtrer)
create or replace function public.export_codages(p_debut date, p_fin date)
returns table (
  date_avis date, plat text, etoiles integer, commentaire text, theme text,
  sentiment text, confiance numeric, source text, statut text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur.';
  end if;
  return query
    select a.cree_le::date, a.plat, a.etoiles, a.commentaire, t.libelle, c.sentiment, c.confiance, c.source, c.statut
    from public.codages c
    join public.avis a on a.id = c.avis_id
    join public.themes t on t.code = c.theme
    where a.cree_le::date between p_debut and p_fin
    order by a.cree_le, a.id, t.libelle;
end;
$$;

revoke execute on function public.ignorer_codage(bigint)                          from public, anon;
revoke execute on function public.stats_insights(date, date)                      from public, anon;
revoke execute on function public.avis_du_theme(text, date, date, integer)        from public, anon;
revoke execute on function public.file_revue(integer)                             from public, anon;
revoke execute on function public.export_codages(date, date)                      from public, anon;
grant  execute on function public.ignorer_codage(bigint)                          to authenticated;
grant  execute on function public.stats_insights(date, date)                      to authenticated;
grant  execute on function public.avis_du_theme(text, date, date, integer)        to authenticated;
grant  execute on function public.file_revue(integer)                             to authenticated;
grant  execute on function public.export_codages(date, date)                      to authenticated;

-- =====================================================================
-- 12. PROFIL ALIMENTAIRE, RECHARGE LIBRE, RETIRER ET DUPLIQUER UN MENU (aussi disponible seul : patch_profil_recharge_menus.sql)
-- =====================================================================

-- Régime alimentaire et allergie libre, remplis par l'élève ou son parent
alter table public.profiles add column if not exists regime text not null default 'aucun';
alter table public.profiles add column if not exists autre_allergie text not null default '';

do $$
begin
  -- Le régime peut être écrit à la main : sa contrainte est posée en section 15
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

-- =====================================================================
-- 14. PLUSIEURS PLATS AU CHOIX CHAQUE JOUR (aussi disponible seul : patch_menus_multi_plats.sql)
-- =====================================================================

-- =====================================================================
-- 1. Plusieurs plats le même jour, une boisson dans la formule
-- =====================================================================
alter table public.menus drop constraint if exists menus_jour_key;
create unique index if not exists menus_un_plat_par_jour on public.menus (jour, plat);
alter table public.menus add column if not exists boisson text not null default '';

-- =====================================================================
-- 2. Le jour du repas recopié dans la réservation, pour les règles « par jour »
-- =====================================================================
alter table public.reservations add column if not exists jour date;

update public.reservations r
set jour = m.jour
from public.menus m
where m.id = r.menu_id and r.jour is distinct from m.jour;

alter table public.reservations alter column jour set not null;

-- Rempli tout seul à chaque réservation (fonctions RPC et scripts de démonstration)
create or replace function public.remplir_jour_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select m.jour into new.jour from public.menus m where m.id = new.menu_id;
  return new;
end;
$$;

drop trigger if exists reservations_remplir_jour on public.reservations;
create trigger reservations_remplir_jour
  before insert or update of menu_id on public.reservations
  for each row execute function public.remplir_jour_reservation();

-- Si l'admin change la date d'un plat, ses réservations suivent
create or replace function public.suivre_jour_menu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations set jour = new.jour where menu_id = new.id;
  return new;
end;
$$;

drop trigger if exists menus_suivre_jour on public.menus;
create trigger menus_suivre_jour
  after update of jour on public.menus
  for each row when (old.jour is distinct from new.jour)
  execute function public.suivre_jour_menu();

revoke execute on function public.remplir_jour_reservation() from public, anon, authenticated;
revoke execute on function public.suivre_jour_menu() from public, anon, authenticated;

-- Un seul repas actif par élève et par jour ; un code de retrait unique parmi les repas du jour
drop index if exists public.reservations_un_repas_par_jour;
drop index if exists public.reservations_code_unique_du_jour;
create unique index if not exists reservations_un_repas_par_eleve_et_jour
  on public.reservations (eleve_id, jour) where statut <> 'annulee';
create unique index if not exists reservations_code_unique_par_jour
  on public.reservations (jour, code_retrait) where statut <> 'annulee';

-- =====================================================================
-- 3. Réserver : un repas par jour, créneaux et codes comptés sur la journée
-- =====================================================================
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

-- =====================================================================
-- 4. Prévision : la moyenne des semaines passées se calcule par jour (tous plats confondus)
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
      group by m.jour
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
-- 5. Dupliquer un plat : refusé seulement si ce même plat est déjà au menu ce jour-là
-- =====================================================================
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
  if exists (
    select 1 from public.menus copie, public.menus source
    where source.id = p_menu_id and copie.jour = p_jour and copie.plat = source.plat
  ) then
    return 'Ce plat est déjà au menu ce jour-là.';
  end if;

  insert into public.menus (
    jour, entree, plat, dessert, boisson, allergenes, prix, prix_employe, photo_url,
    plat_alternatif, photo_alternative, allergenes_alternatif, contenu, contenu_alternatif
  )
  select
    p_jour, entree, plat, dessert, boisson, allergenes, prix, prix_employe, photo_url,
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
    return 'Ce plat est déjà au menu ce jour-là.';
end;
$$;

revoke execute on function public.dupliquer_menu(bigint, date) from public, anon;
grant  execute on function public.dupliquer_menu(bigint, date) to authenticated;


-- =========================================================
-- 15. PROFIL ALIMENTAIRE ÉCRIT À LA MAIN (aussi disponible seul : patch_profil_libre.sql)

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


-- =========================================================
-- 16. LIER UN PARENT AVEC UN CODE DONNÉ PAR L'ÉLÈVE (aussi disponible seul : patch_lien_parent_code.sql)

create table if not exists public.codes_parent (
  eleve_id  uuid primary key references public.profiles (id) on delete cascade,
  code      text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  expire_le timestamptz not null
);

alter table public.codes_parent enable row level security;

-- L'élève relit son propre code ; tout le reste passe par les fonctions ci-dessous
grant select on public.codes_parent to authenticated;
drop policy if exists codes_parent_lecture on public.codes_parent;
create policy codes_parent_lecture on public.codes_parent
  for select to authenticated
  using (eleve_id = auth.uid());

-- Élève : crée (ou remplace) son code pour un parent. Renvoie { ok, message, code, expire_le }.
create or replace function public.creer_code_parent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet     constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  nouveau_code text;
  fin          timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null or public.mon_role() is distinct from 'eleve' then
    return jsonb_build_object('ok', false, 'message', 'Seul un élève peut inviter un parent.');
  end if;

  loop
    nouveau_code := '';
    for i in 1..6 loop
      nouveau_code := nouveau_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.codes_parent where code = nouveau_code);
  end loop;

  insert into public.codes_parent (eleve_id, code, expire_le)
  values (auth.uid(), nouveau_code, fin)
  on conflict (eleve_id) do update set code = excluded.code, expire_le = excluded.expire_le;

  return jsonb_build_object('ok', true, 'message', 'ok', 'code', nouveau_code, 'expire_le', fin);
end;
$$;

-- Parent : se lie à l'enfant qui lui a donné ce code. Le code ne sert qu'une fois.
create or replace function public.lier_enfant_avec_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code_propre text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  invitation  public.codes_parent;
begin
  if public.mon_role() is distinct from 'parent' then
    return 'Réservé aux parents.';
  end if;
  if char_length(code_propre) <> 6 then
    return 'Le code fait 6 caractères : demandez-le à votre enfant.';
  end if;

  select * into invitation from public.codes_parent where code = code_propre for update;
  if invitation.eleve_id is null or invitation.expire_le < now() then
    return 'Code inconnu ou expiré. Demandez-en un nouveau à votre enfant.';
  end if;
  if exists (select 1 from public.liens_parent where parent_id = auth.uid() and eleve_id = invitation.eleve_id) then
    delete from public.codes_parent where eleve_id = invitation.eleve_id;
    return 'Cet enfant est déjà lié à votre compte.';
  end if;

  insert into public.liens_parent (parent_id, eleve_id) values (auth.uid(), invitation.eleve_id);
  delete from public.codes_parent where eleve_id = invitation.eleve_id;
  return 'ok';
end;
$$;

-- Élève : les parents liés à son compte (leur nom seulement)
create or replace function public.mes_parents()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nom
  from public.liens_parent l
  join public.profiles p on p.id = l.parent_id
  where l.eleve_id = auth.uid()
  order by p.nom;
$$;

revoke execute on function public.creer_code_parent() from public, anon;
grant  execute on function public.creer_code_parent() to authenticated;
revoke execute on function public.lier_enfant_avec_code(text) from public, anon;
grant  execute on function public.lier_enfant_avec_code(text) to authenticated;
revoke execute on function public.mes_parents() from public, anon;
grant  execute on function public.mes_parents() to authenticated;

-- Temps réel : l'élève voit le nom de son parent apparaître dès que le code est saisi
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'liens_parent'
     ) then
    alter publication supabase_realtime add table public.liens_parent;
  end if;
end;
$$;

-- L'ancienne liaison par e-mail disparaît : elle permettait de suivre n'importe quel élève
drop function if exists public.lier_enfant(text);

-- =====================================================================
-- PATCH PARCOURS (25/11/2026) : rôle Cantine pour le comptoir, lecture d'un ticket sans le servir,
-- absence signalée le jour même (moitié rendue). À coller tel quel dans Supabase > SQL Editor (relançable).
-- =====================================================================

-- 1. RÔLE CANTINE : le personnel du comptoir sert les repas sans voir les finances, les menus ni les stocks
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('eleve', 'parent', 'admin', 'cantine'));

-- Vrai pour l'admin et le personnel du comptoir
create or replace function public.est_personnel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.mon_role() in ('admin', 'cantine'), false);
$$;

-- Le comptoir lit les réservations (temps réel des compteurs) ; l'écriture reste réservée aux fonctions RPC
drop policy if exists reservations_lecture on public.reservations;
create policy reservations_lecture on public.reservations
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.est_personnel());

-- 2. SERVICE : mêmes fonctions qu'avant, ouvertes à l'admin ET au rôle cantine
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
  if not public.est_personnel() then
    return jsonb_build_object('ok', false, 'resultat', 'refuse', 'message', 'Réservé au personnel de la cantine.');
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

create or replace function public.commandes_du_jour(p_jour date default null)
returns table (
  reservation_id bigint,
  nom            text,
  plat           text,
  photo_url      text,
  alternative    boolean,
  code_retrait   text,
  statut         text,
  servie_le      timestamptz,
  allergies      text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_personnel() then
    return;
  end if;

  return query
  select
    r.id,
    p.nom,
    case when r.alternative then m.plat_alternatif else m.plat end,
    case when r.alternative then coalesce(nullif(m.photo_alternative, ''), m.photo_url) else m.photo_url end,
    r.alternative,
    r.code_retrait,
    r.statut,
    r.servie_le,
    p.allergies
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where m.jour = coalesce(p_jour, (now() at time zone 'Africa/Abidjan')::date)
    and r.statut <> 'annulee'
  order by p.nom, r.id;
end;
$$;

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
  if not public.est_personnel() then
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

-- 3. LIRE UN TICKET SANS LE SERVIR : la carte de remise du comptoir (qui, quel plat, quelles allergies)
create or replace function public.lire_ticket(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  code_nettoye text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  aujourdhui   date := (now() at time zone 'Africa/Abidjan')::date;
  ticket       record;
  autre_jour   date;
begin
  if not public.est_personnel() then
    return jsonb_build_object('ok', false, 'resultat', 'refuse', 'message', 'Réservé au personnel de la cantine.');
  end if;
  if code_nettoye !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Le code doit avoir 4 chiffres.');
  end if;

  select r.id, r.statut, r.montant, r.creneau, r.servie_le, r.alternative,
         p.nom, p.type_usager, p.allergies, p.regime, p.autre_allergie,
         case when r.alternative then m.plat_alternatif else m.plat end as plat,
         case when r.alternative then coalesce(nullif(m.photo_alternative, ''), m.photo_url) else m.photo_url end as photo_url,
         case when r.alternative then m.allergenes_alternatif else m.allergenes end as allergenes_plat,
         m.plat_alternatif
  into ticket
  from public.reservations r
  join public.menus m on m.id = r.menu_id
  join public.profiles p on p.id = r.eleve_id
  where r.code_retrait = code_nettoye
    and r.statut <> 'annulee'
    and m.jour = aujourdhui;

  if not found then
    select m.jour into autre_jour
    from public.reservations r
    join public.menus m on m.id = r.menu_id
    where r.code_retrait = code_nettoye and r.statut <> 'annulee'
    order by abs(m.jour - aujourdhui)
    limit 1;
    if autre_jour is not null then
      return jsonb_build_object('ok', false, 'resultat', 'pas_aujourdhui', 'message', 'Pas pour aujourd''hui',
        'code_retrait', code_nettoye, 'jour', autre_jour);
    end if;
    return jsonb_build_object('ok', false, 'resultat', 'inconnu', 'message', 'Code inconnu', 'code_retrait', code_nettoye);
  end if;

  return jsonb_build_object(
    'ok', ticket.statut = 'reservee',
    'resultat', case when ticket.statut = 'servie' then 'deja_servi' else 'a_remettre' end,
    'message', case when ticket.statut = 'servie' then 'Déjà servi' else 'À remettre' end,
    'code_retrait', code_nettoye,
    'nom', ticket.nom,
    'type_usager', ticket.type_usager,
    'plat', ticket.plat,
    'photo_url', ticket.photo_url,
    'montant', ticket.montant,
    'creneau', ticket.creneau,
    'servie_le', ticket.servie_le,
    'allergies', to_jsonb(coalesce(ticket.allergies, '{}')),
    'risques', to_jsonb(array(select unnest(coalesce(ticket.allergies, '{}')) intersect select unnest(coalesce(ticket.allergenes_plat, '{}')))),
    'regime', ticket.regime,
    'autre_allergie', ticket.autre_allergie,
    'plat_remplacement', case when ticket.alternative then '' else coalesce(ticket.plat_alternatif, '') end
  );
end;
$$;

-- 4. ABSENCE SIGNALÉE LE JOUR MÊME : après la veille 18 h et avant 10 h le jour du repas,
-- l'élève prévient qu'il ne viendra pas. La portion est déjà commandée : on lui rend la moitié.
create or replace function public.signaler_absence(p_reservation_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resa       public.reservations;
  jour_menu  date;
  nom_plat   text;
  rendu      integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Connecte-toi pour prévenir la cantine.');
  end if;

  select * into resa from public.reservations where id = p_reservation_id for update;
  if not found or resa.eleve_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'Réservation introuvable.');
  end if;
  if resa.statut <> 'reservee' then
    return jsonb_build_object('ok', false, 'message', 'Ce repas est déjà annulé ou servi.');
  end if;

  select jour, case when resa.alternative then plat_alternatif else plat end
  into jour_menu, nom_plat
  from public.menus where id = resa.menu_id;

  if now() < public.heure_limite(jour_menu) then
    return jsonb_build_object('ok', false, 'message', 'Tu peux encore annuler : tu récupères tout le montant.');
  end if;
  if now() >= (jour_menu + time '10:00') at time zone 'Africa/Abidjan' then
    return jsonb_build_object('ok', false, 'message', 'Trop tard : on prévient la cantine avant 10 h le jour du repas.');
  end if;

  rendu := resa.montant / 2;
  update public.reservations set statut = 'annulee' where id = resa.id;
  update public.profiles set solde = solde + rendu where id = resa.eleve_id;
  insert into public.mouvements (eleve_id, montant, motif)
  values (resa.eleve_id, rendu, 'Absence signalée : ' || nom_plat || ' (moitié rendue)');

  return jsonb_build_object('ok', true, 'message', 'La cantine est prévenue.', 'rendu', rendu);
end;
$$;

-- 5. DROITS : personne n'appelle ces fonctions sans être connecté
revoke execute on function public.est_personnel()               from public, anon;
revoke execute on function public.marquer_servie(text)          from public, anon;
revoke execute on function public.commandes_du_jour(date)       from public, anon;
revoke execute on function public.allergies_du_jour(date)       from public, anon;
revoke execute on function public.lire_ticket(text)             from public, anon;
revoke execute on function public.signaler_absence(bigint)      from public, anon;
grant  execute on function public.est_personnel()               to authenticated;
grant  execute on function public.marquer_servie(text)          to authenticated;
grant  execute on function public.commandes_du_jour(date)       to authenticated;
grant  execute on function public.allergies_du_jour(date)       to authenticated;
grant  execute on function public.lire_ticket(text)             to authenticated;
grant  execute on function public.signaler_absence(bigint)      to authenticated;
