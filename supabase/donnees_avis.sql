-- Données de démo Insights : 500 avis réalistes sur les 4 dernières semaines (sans élève, source 'import').
-- Relançable : ne fait rien s'il y a déjà au moins 100 avis importés. Prérequis : patch_insights.sql.
-- À lancer dans le SQL Editor de Supabase (le rôle postgres est accepté).
select public.generer_avis_demo(500)
where (select count(*) from public.avis where source = 'import') < 100;
