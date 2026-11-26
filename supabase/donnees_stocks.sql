-- CantiJuste : données de DÉMONSTRATION du module Stocks. Relançable sans doublons (Supabase > SQL Editor).
-- À lancer APRÈS patch_stocks.sql et donnees_demo.sql.
-- 10 ingrédients ivoiriens et la recette (quantité par repas) de chacun des 5 plats de démo, appliquée à tous les menus
-- qui portent ce plat. Pour que la démo montre l'alerte : la pâte d'arachide est sous son seuil (stock bas) et le thon ne
-- couvre pas le prochain service (rupture). Relancer remet ces 10 stocks à leur état de départ.

insert into public.ingredients (nom, unite, quantite, seuil) values
  ('Attiéké',            'kg',    120,  40),
  ('Riz',                'kg',     80,  30),
  ('Poisson braisé',     'kg',     60,  25),
  ('Poulet',             'kg',     70,  30),
  ('Thon',               'kg',      1.5, 5),
  ('Banane plantain',    'pièce', 150,  60),
  ('Huile rouge',        'L',      40,  10),
  ('Pâte d''arachide',   'kg',      6,  10),
  ('Tomate',             'kg',     30,  10),
  ('Piment',             'kg',      5,   1)
on conflict (nom) do update set unite = excluded.unite, quantite = excluded.quantite, seuil = excluded.seuil;

with recettes (plat, ingredient, quantite_par_repas) as (
  values
    ('Garba maison',           'Attiéké',          0.200),
    ('Garba maison',           'Thon',             0.100),
    ('Garba maison',           'Tomate',           0.030),
    ('Garba maison',           'Piment',           0.005),
    ('Garba maison',           'Huile rouge',      0.020),
    ('Riz sauce arachide',     'Riz',              0.150),
    ('Riz sauce arachide',     'Pâte d''arachide', 0.040),
    ('Riz sauce arachide',     'Poulet',           0.100),
    ('Riz sauce arachide',     'Tomate',           0.040),
    ('Riz sauce arachide',     'Huile rouge',      0.020),
    ('Attiéké poisson braisé', 'Attiéké',          0.200),
    ('Attiéké poisson braisé', 'Poisson braisé',   0.200),
    ('Attiéké poisson braisé', 'Tomate',           0.040),
    ('Attiéké poisson braisé', 'Piment',           0.005),
    ('Attiéké poisson braisé', 'Huile rouge',      0.010),
    ('Kédjénou de poulet',     'Poulet',           0.250),
    ('Kédjénou de poulet',     'Tomate',           0.050),
    ('Kédjénou de poulet',     'Piment',           0.005),
    ('Kédjénou de poulet',     'Banane plantain',  0.500),
    ('Kédjénou de poulet',     'Huile rouge',      0.020),
    ('Garba au piment doux',   'Attiéké',          0.200),
    ('Garba au piment doux',   'Thon',             0.100),
    ('Garba au piment doux',   'Tomate',           0.030),
    ('Garba au piment doux',   'Piment',           0.003)
)
insert into public.ingredients_par_menu (menu_id, ingredient_id, quantite_par_repas)
select m.id, i.id, r.quantite_par_repas
from recettes r
join public.menus m on m.plat = r.plat
join public.ingredients i on i.nom = r.ingredient
on conflict (menu_id, ingredient_id) do update set quantite_par_repas = excluded.quantite_par_repas;

-- Vérification : les 2 ingrédients à surveiller (le thon en rupture, la pâte d'arachide sous le seuil)
select nom, quantite, unite, seuil from public.ingredients where quantite < seuil order by nom;
