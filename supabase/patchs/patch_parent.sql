-- CantiJuste : patch espace parent. Relançable sans erreur (Supabase > SQL Editor).
-- lier_enfant() distingue maintenant « e-mail inconnu », « pas un compte élève » et « déjà lié ».
-- La RLS parent était déjà correcte (testée) : rien d'autre à changer.

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

revoke execute on function public.lier_enfant(text) from public, anon;
grant  execute on function public.lier_enfant(text) to authenticated;
