-- CantiJuste : module « Files d'attente », partie élève (créneau de passage). Relançable sans erreur (Supabase > SQL Editor).
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
