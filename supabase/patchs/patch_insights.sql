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
