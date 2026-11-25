-- Patch réservation : reserver() refuse un plat qui contient une allergie du profil tant que l'élève n'a pas confirmé. Relançable.

-- L'ancienne version (2 paramètres) est remplacée par celle à 3 paramètres
drop function if exists public.reserver(bigint, time);

-- Réserver le repas d'un jour : vérifie le rôle, l'heure limite, la double réservation, l'allergie confirmée
-- et le solde, débite le prix élève ou employé, crée la réservation et le mouvement
create or replace function public.reserver(
  p_menu_id bigint,
  p_creneau time default null,
  p_accepte_allergie boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_choisi  public.menus;
  profil       public.profiles;
  prix_a_payer integer;
  nouveau_code text;
begin
  if auth.uid() is null then
    return 'Connecte-toi pour réserver.';
  end if;
  if public.mon_role() is distinct from 'eleve' then
    return 'Seul un élève ou un employé peut réserver un repas.';
  end if;

  select * into menu_choisi from public.menus where id = p_menu_id;
  if not found then
    return 'Ce menu n''existe pas.';
  end if;
  if now() >= public.heure_limite(menu_choisi.jour) then
    return 'Trop tard : on réserve au plus tard la veille à 18 h.';
  end if;

  -- Verrou sur le profil : deux réservations en même temps ne peuvent pas dépasser le solde
  select * into profil from public.profiles where id = auth.uid() for update;
  if not found then
    return 'Profil introuvable.';
  end if;

  if exists (
    select 1 from public.reservations
    where eleve_id = auth.uid() and menu_id = p_menu_id and statut <> 'annulee'
  ) then
    return 'Tu as déjà réservé ce repas.';
  end if;

  if menu_choisi.allergenes && profil.allergies and not coalesce(p_accepte_allergie, false) then
    return 'Ce plat contient un allergène de ton profil : confirme pour réserver quand même.';
  end if;

  prix_a_payer := case when profil.type_usager = 'employe' then menu_choisi.prix_employe else menu_choisi.prix end;
  if profil.solde < prix_a_payer then
    return 'Solde insuffisant : recharge ton compte.';
  end if;

  loop
    nouveau_code := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (
      select 1 from public.reservations
      where menu_id = p_menu_id and code_retrait = nouveau_code and statut <> 'annulee'
    );
  end loop;

  insert into public.reservations (eleve_id, menu_id, code_retrait, montant, creneau)
  values (auth.uid(), p_menu_id, nouveau_code, prix_a_payer, p_creneau);

  update public.profiles set solde = solde - prix_a_payer where id = auth.uid();

  insert into public.mouvements (eleve_id, montant, motif)
  values (auth.uid(), -prix_a_payer, 'Repas : ' || menu_choisi.plat);

  return 'ok';
exception
  when unique_violation then
    return 'Tu as déjà réservé ce repas.';
end;
$$;

revoke execute on function public.reserver(bigint, time, boolean) from public, anon;
grant  execute on function public.reserver(bigint, time, boolean) to authenticated;
