# Audit CantiJuste du 25 novembre

Audit de l'appli complète (dépôt GitHub + livraisons design_v1, icones_v1, corrections_v1) contre le guide officiel du hackathon Vatel, sa grille d'évaluation, la charte visuelle et les règles du projet. Écarts classés par points en jeu.

## 1. Écarts trouvés, par impact sur la note

| # | Écart | Critère touché | Gravité | État |
| --- | --- | --- | --- | --- |
| 1 | **Le dépôt GitHub s'arrête au 21/11** (3 commits) : design, icônes et corrections jamais poussés. C'est ce que le jury ouvre. | Code 15, Présentation 15, soumission | Bloquant | À pousser (commandes ci-dessous) |
| 2 | **README = modèle Vite** en anglais. Le guide exige un README qui décrit le projet et comment le lancer. | Soumission, Code 15 | Bloquant | Corrigé |
| 3 | **Pas de dossier `supabase/` dans le dépôt** : le jury ne voit ni la base, ni la RLS, ni les fonctions sécurisées (le meilleur argument sécurité). | Code 15 | Fort | Corrigé |
| 4 | **Base de démo pas à jour** : le patch des corrections n'était pas appliqué ; la connexion échoue (colonnes `regime`, `autre_allergie` absentes). | Fonctionnalité 30 | Bloquant pour la démo | SQL tout-en-un livré |
| 5 | **« Générer des rapports d'activité »** (besoin admin du guide) absent. | Fonctionnalité 30 | Fort | Corrigé : export du rapport du mois |
| 6 | **Faille** : un utilisateur pouvait modifier son propre type (employé → élève) et payer 1 000 F au lieu de 1 500 F. | Code 15 (sécurité) | Fort | Corrigé en base (déclencheur) |
| 7 | **Bonus « application mobile » et « hors ligne »** absents alors que la librairie PWA était autorisée. | Innovation 20 | Moyen | Corrigé : appli installable, menu lisible sans réseau |
| 8 | **Carte cantine virtuelle** : un concurrent l'a. Identité + solde + code du jour + allergies d'un regard. | UX 20, Innovation 20 | Moyen | Ajoutée (élève et parent) |
| 9 | **Lint : 30 erreurs** (`npm run lint`), espaces en fin de ligne dans des dizaines de fichiers. | Code 15 | Moyen | Corrigé : 0 erreur |
| 10 | Fichiers morts du modèle Vite (`src/assets/`, `public/icons.svg`), `src/admin.css` obsolète, hook rangé hors de `src/lib/`, 12 patchs SQL en vrac. | Code 15 | Faible | Corrigé |
| 11 | 3 fonctions internes appelables sans être connecté, 1 fonction sans `search_path` (alertes du conseiller Supabase). | Code 15 | Faible | Corrigé |
| 12 | **Pilotage affichait « 0 FCFA évités » et « +87 % de pertes »** : les jours passés depuis l'historique de démo gardaient leurs repas « à servir ». Le ticket CJ · 0812 du jour n'existait plus non plus. | Fonctionnalité 30, Présentation 15 | Fort (écran vedette de la démo) | Corrigé côté données de démo (`donnees_rafraichir_demo.sql`). Le calcul, lui, est juste : sur une vraie cantine, un repas réservé et jamais retiré est bien une perte. |
| 13 | Noms tapés en minuscules affichés tels quels (« bakayoko sania », « jules kouassi ») sur la carte profil, la recharge, les listes admin. | UX 20 | Moyen | Corrigé : noms mis en forme dès la lecture (`nomPropre`) |
| 14 | Comptoir : un bouton « Servi » piment par convive (des dizaines), contre la règle « un seul bouton piment par écran ». | UX 20 | Moyen | Corrigé : boutons secondaires, vert une fois servi |
| 15 | Historique élève et parent : un repas passé jamais retiré restait « Réservé » (et comptait dans « à venir » chez le parent). | UX 20 | Moyen | Corrigé : badge « Pas retiré » |
| 16 | Stocks : « Calculé à partir des 0 réservation » alors qu'il y en avait 203. | Fonctionnalité 30 | Moyen | Corrigé |
| 17 | Insights : 0 avis sur 115 analysés dans la base de démo, donc thèmes et résumé vides. | Innovation 20 | Moyen | À faire avant la démo : cliquer « Analyser les nouveaux avis » sur le lien Vercel |
| 18 | Deux noms de garba dans les données (« Garba maison », « Garba au piment doux ») au lieu de « Garba du marché » (charte) ; photo terne du riz sauce arachide. | UX 20 | Faible | Restant (données de démo) |
| 19 | Multi-langue FR / EN absent. | Innovation (bonus) | Faible | Restant |
| 20 | Notifications push hors de l'appli absentes (le temps réel dans l'appli existe). | Innovation (bonus) | Faible | Restant |
| 21 | Suggestions de repas par l'IA côté élève absentes (l'IA existe côté admin). | Innovation (bonus) | Faible | Restant |

**Parcours testé** : élève, parent et admin sur la vraie base, à 360 px et 1 440 px, 22 écrans : aucun débordement horizontal, aucune erreur dans la console (captures dans `docs/captures/`).

## 2. Ce qui est solide (à mettre en avant au pitch)

- Les 7 fonctionnalités minimum sont là et marchent : inscription / connexion, menu de la semaine, réservation, solde et historique, création / modification des menus, commandes du jour, tableau de bord.
- Les 5 problèmes du guide ont chacun une réponse concrète et chiffrée (file d'attente simulée, gaspillage évité en FCFA, allergies avec remplacement et alerte parent, prix sur le bouton, admin outillé).
- Sécurité sérieuse : RLS sur les 13 tables, tout l'argent passe par des fonctions SQL qui vérifient rôle, montant et délai, réservation sous verrou, aucune clé secrète côté navigateur, clé Claude seulement côté serveur avec contrôle du rôle admin.
- Design cohérent sur tous les écrans (charte « Appétit »), aucun débordement à 360 px.

## 3. Ce qui reste, honnêtement

- **Mobile Money simulé** : à dire au jury (badge « Simulation » dans l'appli). En production : agrégateur de paiement + webhook serveur.
- Type élève / employé déclaré à l'inscription : en production, validé par l'établissement.
- Multi-langue, push hors appli, suggestions IA côté élève : non faits, à citer dans « Ce que je ferais en plus ».
- Identité visuelle Vatel : le guide officiel (PDF) ne contient ni logo ni couleurs de l'école. On garde « Cantine Vatel · Vallon » (charte, règle 11) et la carte reprend les couleurs CantiJuste ; si l'organisation fournit sa charte, il suffit d'adapter les dégradés de la carte (section 34 de `index.css`).

## 4. Prêt pour une vraie cantine, ou seulement pour la démo ?

### Prêt pour un usage réel
- **Comptes et sécurité** : inscription, connexion, rôles, RLS, fonctions SQL qui protègent l'argent, verrou contre la double dépense. Rien ne dépend des données de démo.
- **Menus, réservation, annulation, remboursement, comptoir par code** : fonctionnent sur de vraies réservations, avec l'heure d'Abidjan et la limite de la veille 18 h.
- **Allergies et régimes** : vérification du plat, plat de remplacement, alerte au parent, liste « À surveiller » en cuisine.
- **Chiffres du Pilotage** : calculés en SQL à partir des vraies réservations et des vrais repas servis (taux de gaspillage, prévision, repas à préparer). Seule l'hypothèse « une cantine sans réservation prépare 15 % de trop » est une estimation à faire valider par la cuisine.
- **Stocks** : besoins calculés sur les réservations, stock déduit à chaque repas servi.
- **Rapport du mois, carte cantine, appli installable, mode hors ligne** : marchent avec de vraies données.

### Pas encore prêt pour un usage réel
- **Paiement Mobile Money simulé** : aucun argent ne circule. Il faut un contrat avec un agrégateur (CinetPay, Wave Business…), un appel côté serveur et une confirmation par webhook avant de créditer le solde.
- **Type élève / employé déclaré par l'utilisateur** à l'inscription : il faut une liste des inscrits fournie par l'établissement, ou une validation par l'admin.
- **Création des comptes admin à la main** (SQL), pas d'écran pour gérer l'équipe de cuisine.
- **Pas de « mot de passe oublié »** dans l'appli, et confirmation de l'e-mail désactivée pour la démo.
- **Un seul établissement** : pas de gestion de plusieurs cantines ou sites du groupe.
- **Données personnelles** (allergies d'enfants) : pas encore de mentions légales, de consentement parental ni de durée de conservation.
- **Analyse des avis par l'IA** : coût de l'API à prévoir, et clé à mettre dans Vercel.

### N'existe que pour la démo
- Les 3 comptes « démo » et le bouton de connexion en un clic sur l'accueil (à retirer en production).
- Les 24 convives fictifs, l'historique de 4 semaines, les 500 avis générés et les stocks de départ (`donnees_*.sql`).
- `donnees_rafraichir_demo.sql` : il « sert » les jours passés qu'aucun comptoir n'a tenus et remet le ticket CJ · 0812. Il ne doit jamais tourner sur une vraie cantine.
