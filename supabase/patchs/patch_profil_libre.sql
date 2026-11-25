-- =========================================================
-- Profil alimentaire écrit par l'élève ou son parent (25/11)
-- - régime : une des propositions ('aucun', 'vegetarien', 'sans_porc', 'halal') ou un texte libre de 40 caractères au plus
-- - autre_allergie : plusieurs allergies libres séparées par des virgules (« kiwi, crevettes »), 200 caractères au plus
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
