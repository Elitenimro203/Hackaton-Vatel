-- Patch recharge du solde : crédit admin plafonné, recharge Mobile Money simulée (rôle vérifié), recherche de personnes pour l'admin, mouvements en lecture seule. Relançable.

-- =====================================================================
-- 1. MOUVEMENTS : lecture seule (la personne, son parent lié, l'admin), écriture par les RPC uniquement
-- =====================================================================

alter table public.mouvements enable row level security;

drop policy if exists mouvements_lecture on public.mouvements;
create policy mouvements_lecture on public.mouvements
  for select to authenticated
  using (eleve_id = auth.uid() or public.est_parent_de(eleve_id) or public.mon_role() = 'admin');

-- Même sans règle d'écriture, on retire les droits : personne n'écrit un mouvement depuis l'appli
revoke insert, update, delete on public.mouvements from anon, authenticated;

-- =====================================================================
-- 2. CRÉDIT MANUEL PAR L'ADMIN (100 000 FCFA maximum par crédit)
-- =====================================================================

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

-- =====================================================================
-- 3. RECHARGE MOBILE MONEY SIMULÉE (élève pour lui-même, parent pour son enfant lié, 100 à 50 000 FCFA)
-- =====================================================================

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

-- =====================================================================
-- 4. RECHERCHE D'UN ÉLÈVE OU EMPLOYÉ PAR NOM OU E-MAIL (admin seulement, 8 résultats)
-- =====================================================================

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

-- =====================================================================
-- 5. DROITS : fonctions appelables seulement par un utilisateur connecté
-- =====================================================================

revoke execute on function public.crediter(uuid, integer, text)               from public, anon;
revoke execute on function public.recharger_mobile_money(uuid, integer, text) from public, anon;
revoke execute on function public.chercher_personnes(text)                    from public, anon;
grant  execute on function public.crediter(uuid, integer, text)               to authenticated;
grant  execute on function public.recharger_mobile_money(uuid, integer, text) to authenticated;
grant  execute on function public.chercher_personnes(text)                    to authenticated;
