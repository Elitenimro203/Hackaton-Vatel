AIDE-MÉMOIRE CantiJuste (base Supabase, supabase/schema.sql)

TABLES
- profiles(id uuid = auth.users.id, email, nom, role 'eleve'|'parent'|'admin'|'cantine', type_usager 'eleve'|'employe', solde int, allergies text[], cree_le)
- liens_parent(parent_id, eleve_id, cree_le)  clé (parent_id, eleve_id)
- menus(id bigint, jour date, entree, plat, dessert, boisson, (jour, plat) unique : plusieurs plats au choix par jour, allergenes text[], prix int (élève), prix_employe int (défaut 1500), photo_url, plat_alternatif text ('' = aucun), photo_alternative, allergenes_alternatif text[], cree_le)
- reservations(id bigint, eleve_id, menu_id, jour date (rempli par déclencheur ; un repas actif par élève et par jour, code unique par jour), statut 'reservee'|'annulee'|'servie', code_retrait '0812', montant int, creneau time null, alternative bool (plat de remplacement), cree_le, servie_le)
- alertes(id bigint, eleve_id, menu_id null, allergenes text[], message, lue bool, cree_le)  élève qui réserve malgré son allergie ; lecture : élève, parents liés, admin
- mouvements(id bigint, eleve_id, montant int +/-, motif, cree_le)
- avis(id bigint, eleve_id null, menu_id null, plat, etoiles 1-5, commentaire null, source 'appli'|'import', cree_le)  unique (eleve_id, menu_id)
- ingredients(id bigint, nom unique, unite 'kg', quantite numeric, seuil numeric)
- ingredients_par_menu(menu_id, ingredient_id, quantite_par_repas numeric)
Allergènes autorisés : 'arachide', 'lait', 'gluten', 'poisson', 'oeuf'

ÉCRITURE DEPUIS REACT
- Direct (RLS) : profiles.nom (soi-même) ; type_usager, allergies, régime : bloqués par trigger (patch_audit), passer par modifier_profil_alimentaire() ; menus, ingredients, ingredients_par_menu, avis import (admin) ; avis source 'appli' (élève, si repas réservé) ; liens_parent delete (parent)
- Interdit : role, solde, email (bloqués par trigger) ; reservations, mouvements et alertes (RPC seulement ; insert/update/delete sur mouvements retirés à authenticated)

FONCTIONS RPC (renvoient 'ok' ou un message d'erreur en français)
- reserver(p_menu_id, p_creneau = null, p_accepte_allergie = false, p_alternative = false)   élève ; RENVOIE UN JSON { ok, message, alerte_allergie, code_retrait } ; limite veille 18 h Abidjan ; 1 repas par jour ; plat avec un allergène du profil → ok=false + alerte_allergie ['arachide'] sauf si p_accepte_allergie = true (alors réservé + ligne dans alertes pour le parent) ; p_alternative = true réserve le plat de remplacement ; débite prix ou prix_employe
- modifier_allergies(p_eleve_id, p_allergies text[])     l'élève lui-même, un parent lié ou l'admin
- marquer_alerte_lue(p_alerte_id)                         parent lié ou admin
- allergies_du_jour(p_jour = aujourd'hui)                 admin ; lignes (reservation_id, nom, allergies, plat, alternative, risques, code_retrait)
- annuler(p_reservation_id)                                élève (ou admin) ; avant la limite ; rembourse
- crediter(p_eleve_id, p_montant, p_motif = 'Crédit cantine')   admin ; 1 à 100 000 ; élève ou employé seulement ; crée un mouvement
- recharger_mobile_money(p_eleve_id, p_montant, p_operateur = 'Wave')   rôle eleve (lui-même) ou parent (enfant lié) vérifié en base ; 100 à 50 000 ; opérateurs 'Wave'|'Orange Money'|'MTN MoMo'|'Moov Money' ; mouvement 'Recharge <opérateur>'
- chercher_personnes(p_texte)   admin ; 2 lettres mini ; lignes (id, nom, email, type_usager, solde) des élèves/employés, 8 max
- lier_enfant_avec_code(p_code)                            parent ; 'ok' ou message (code inconnu/expiré, déjà lié)
- creer_code_parent()                                      élève ; { ok, code, expire_le } (24 h, un seul usage)
- mes_parents()                                            élève ; ses parents liés (id, nom)
- est_personnel()                                          vrai pour admin et cantine (rôle du comptoir, patch_parcours)
- lire_ticket(p_code)                                      admin ou cantine ; JSON { ok, resultat 'a_remettre'|'deja_servi'|'pas_aujourdhui'|'inconnu'|'refuse', nom, plat, photo_url, montant, creneau, allergies, risques, regime, autre_allergie, plat_remplacement } ; ne sert pas
- signaler_absence(p_reservation_id)                      élève ; après la veille 18 h et avant 10 h le jour même ; rend la moitié ; JSON { ok, message, rendu }
- marquer_servie, commandes_du_jour, allergies_du_jour : admin OU cantine depuis patch_parcours
- marquer_servie(p_code)                                   admin ; accepte '0812' ou 'CJ · 0812' ; RENVOIE UN JSON { ok, resultat, message, prenom, plat, allergies, code_retrait, jour } ; resultat = 'servi' | 'deja_servi' | 'pas_aujourdhui' | 'inconnu' | 'refuse' ; réservation du jour (heure d'Abidjan) seulement
- commandes_du_jour(p_jour = aujourd'hui)                  admin ; lignes (reservation_id, nom, plat, photo_url, alternative, code_retrait, statut, servie_le, allergies) des réservations actives
Aides : mon_role(), est_parent_de(p_eleve_id), heure_limite(p_jour)
Appel React : const { data } = await supabase.rpc('annuler', { p_reservation_id: 3 }) ; data === 'ok'   (reserver : data.ok === true)

INSCRIPTION : supabase.auth.signUp({ email, password, options: { data: { nom, role: 'eleve'|'parent', type_usager: 'eleve'|'employe' } } })
ADMIN : update public.profiles set role = 'admin' where email = '...';  (SQL Editor, à la main)
TEMPS RÉEL : profiles, menus, reservations, mouvements, avis, alertes
TABLEAU DE BORD ADMIN (patch_tableau_de_bord.sql ; données de démo : historique_demo.sql, à lancer après donnees_demo.sql)
- chiffres_pilotage(p_jour = aujourd'hui)   admin ; 1 ligne : reserves_mois, servis_mois, taux_gaspillage (%), evolution_pertes (% vs mois précédent), repas_evites, fcfa_evites, prix_moyen, surplus_sans_resa (15), jour_a_preparer, repas_a_preparer ; mois en cours jusqu'à hier
- prevision_semaine(p_jour)                 admin ; lundi à vendredi prochains : jour, reserves, moyenne, prevision = max(réservés, moyenne des 4 mêmes jours), conseille = prévision + 5 %
- historique_service(p_jour, p_semaines=4)  admin ; jour, reserves, servis (jours ouvrés avant aujourd'hui)
- favoris_cantine(p_limite = 3)             admin ; plat, photo_url, note, nombre_avis (3 avis minimum)
- Gaspillage évité = 15 % x servis − (réservés − servis), en repas, x prix moyen en FCFA. prevision_du_jour() est interne (non appelable).
FILES D'ATTENTE (patch_file_attente.sql ; démo : donnees_file_attente.sql, après historique_demo.sql)
- reglages_file(id = 1, guichets 2, sec_sans_ticket 30, sec_avec_ticket 20)  lecture : tout connecté ; update : admin
- reservations.creneau time null : '11:50' à '12:50' de 10 en 10 ; null = pas de créneau (anciennes réservations OK)
- reserver(..., p_creneau) refuse un créneau inconnu ('Ce créneau n'existe pas.') ou plein ('Ce créneau est complet : choisis-en un autre.')
- affluence_creneaux(p_jour)  tout connecté ; 7 lignes (creneau, reservations, plafond) ; plafond_creneau(reglages) = floor(0,75 x guichets x 60/sec_avec_ticket x 10) = 45
- Calculs JS purs dans src/lib/fileAttente.js (erlangC, attentesParCreneau, badge, plafond, preparerCreneaux, creneauConseille)
- Admin (onglet File) : simulerKolmogorov(profil, mu, c) → { attenteMoyenne, fileMax, courbe } ; guichetsConseilles(comptes, mu) ; plageGuichets ; profils PROFIL_AVANT / PROFIL_LISSE dans src/lib/fileAttente.js. Écran src/ecrans/admin/FileAttente.jsx
STOCKS (patch_stocks.sql ; démo : donnees_stocks.sql)
- ingredients(nom, unite 'kg'|'L'|'pièce', quantite, seuil)  recette d'un menu = ingredients_par_menu(menu_id, ingredient_id, quantite_par_repas) ; mouvements_stock(ingredient_id, quantite +entrée / −sortie, motif, reservation_id) : lecture admin, écriture par RPC seulement
- besoins_stock(p_jour = prochain jour de service)  admin ; par ingrédient : quantite, seuil, besoin (réservations encore 'reservee' x recette), manque, statut 'ok'|'bas'|'rupture', jour, repas
- entree_stock(p_ingredient_id, p_quantite)  admin ; 'ok' ou message ; mouvement 'Livraison'
- enregistrer_recette(p_menu_id, p_lignes jsonb [{ingredient_id, quantite}])  admin ; remplace la recette
- marquer_servie() déduit aussi la recette du stock (jamais sous 0, une seule fois par réservation) ; même JSON qu'avant
INSIGHTS, DONNÉES (patch_insights.sql ; démo : donnees_avis.sql)
- avis(eleve_id null si importé, menu_id, plat, etoiles 1-5, commentaire ≤ 280, source 'appli'|'import', cree_le) ; un seul avis par (eleve_id, menu_id) : index partiel where eleve_id is not null → on conflict (eleve_id, menu_id) where eleve_id is not null
- themes(code, libelle, mots_cles[]) : gout, portion, temperature, attente, prix, variete, allergies, accueil ; lecture : tout connecté
- codages(avis_id, theme, sentiment 'positif'|'neutre'|'negatif', confiance 0-1, extrait, source 'ia'|'mots_cles'|'humain', statut 'auto'|'a_revoir'|'valide'|'corrige') ; 1 à 3 par avis (trigger) ; lecture et écriture : admin seulement
- RLS avis : l'élève lit et note les siens, le parent lit ceux de ses enfants, l'admin tout. L'élève passe par noter_repas.
- noter_repas(p_menu_id, p_etoiles, p_commentaire = null)  élève ; repas servi seulement, modifiable ; renvoie 'ok' ou un message en français
- importer_avis(p_lignes jsonb [{date, plat, etoiles, commentaire}])  admin ; renvoie {importes, rejetes:[{ligne, raison}]}
- generer_avis_demo(p_nombre = 500)  admin (ou postgres dans le SQL Editor) ; avis sans élève, source 'import', 4 dernières semaines, relançable via donnees_avis.sql (ne fait rien s'il y a déjà 100 avis importés)
- Tendances de la démo : attente de plus en plus négative depuis 2 semaines, foutou « portion trop grande », garba le mieux noté, inquiétude sur le riz sauce arachide, « tiède » surtout le lundi, ~8 % d'avis pièges (ironie, 5 étoiles avec plainte, sans commentaire)
INSIGHTS, ANALYSE (patch_insights.sql ; IA dans api/analyser-avis.js, front dans src/lib/insights.js)
- avis_sans_codage(p_limite = 1000)  admin ; id, plat, etoiles, commentaire des avis sans aucun codage
- enregistrer_codages(p_resultats jsonb [{id, codages:[{theme, sentiment, confiance, extrait}]}], p_source 'ia'|'mots_cles')  admin ; renvoie {enregistres, avis_ignores} ; avis déjà codé ignoré ; 3 codages max ; statut 'a_revoir' si confiance < 0,7, sentiment contraire aux étoiles (positif 1-2 ★, négatif 4-5 ★) ou thème inconnu (rangé sous 'gout'), sinon 'auto'
- reviser_codage(p_codage_id, p_theme, p_sentiment)  admin ; inchangé → 'valide' ; sinon source 'humain', statut 'corrige' ; 'ok' ou message
- POST /api/analyser-avis (Authorization: Bearer <jeton Supabase>, admin) : {mode:'coder', themes, avis ≤ 25} → {resultats} ; {mode:'resumer', chiffres} → {resume[3], actions[3]} ; erreur → {erreur} + code HTTP
- Mode secours (mots-clés) : confiance 0,6 ou 0,45 (0,3 sans mot-clé, thème 'gout') → tous ses codages partent en revue
INSIGHTS, ÉCRAN ADMIN (patch_insights.sql ; src/ecrans/admin/Insights.jsx, lib/statsInsights.js, lib/csv.js)
- Seuls les codages 'auto', 'valide', 'corrige' comptent dans les chiffres (jamais 'a_revoir' ni 'ignore'). Statut 'ignore' ajouté à codages.statut.
- stats_insights(p_debut, p_fin)  admin ; jsonb : avis_total, avis_analyses, avis_sans_codage, codages_a_revoir, note_moyenne, valides, corriges, accord_ia_humain (validés ÷ validés + corrigés), sources {ia, mots_cles, humain}, themes[{code, libelle, avis, positif, neutre, negatif, negatif_prec, evolution_negatifs (% vs période précédente de même durée), extrait, plat_extrait}], portion[{plat, avis, trop_grande, part_pct, taux_non_servis}] (plats de 5 avis au moins)
- avis_du_theme(p_theme, p_debut, p_fin, p_limite = 60)  admin ; avis, étoiles, sentiment, confiance
- file_revue(p_limite = 30)  admin ; codages 'a_revoir', moins sûrs d'abord, colonne total
- ignorer_codage(p_codage_id)  admin ; statut 'ignore' ; 'ok' ou message
- export_codages(p_debut, p_fin)  admin ; une ligne par codage, tous statuts, pour avis_codes.csv
- Import CSV : colonnes date (AAAA-MM-JJ ou JJ/MM/AAAA) ; plat ; étoiles ; commentaire, puis importer_avis. Export : CSV avec BOM UTF-8, séparateur ;, virgule décimale.

AUDIT DU 25/11 (patchs/patch_audit.sql, déjà dans schema.sql)
- Trigger proteger_colonnes_profil : role, solde, email, type_usager, allergies, regime, autre_allergie ne changent plus que par les RPC
- rapport_activite(p_debut = 1er du mois, p_fin = aujourd'hui)   admin ; lignes (jour, plat, reserves, servis, non_venus, recettes, note, nombre_avis) ; export CSV depuis Pilotage
- mon_role et est_parent_de ne sont plus appelables sans être connecté
