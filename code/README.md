# Web app S&OP – socle (v0.1)

Application Google Apps Script, déployée en web app pour l'organisation Eureden. Elle lit un fichier de paramètres et écrit dans un fichier de sortie par campagne. Structure des classeurs : `docs/structure-des-feuilles.md`.

## Ce que fait le socle

| Brique | Fichier | Rôle |
|---|---|---|
| Structure | `Structure.gs` | En-têtes et types de chaque onglet. **Généré** par `python3 outils/structure.py`, ne pas modifier à la main |
| Accès aux feuilles | `Store.gs` | Lecture en objets, ajout de lignes, mise à jour de cellules, contrôle des en-têtes |
| Paramètres | `Params.gs` | Campagne sélectionnée, réglages, profils, accès |
| Identité et droits | `Auth.gs` | Adresse réelle, domaine, rôles, capacités, périmètre, campagne ouverte ou non |
| Trace | `Journal.gs` | JOURNAL (qui, quand, avant, après) et reçus OPERATIONS pour rejouer un appel sans doublon |
| Versions | `Versions.gs` | Liste, création (numérotation, une version courante par scénario), verrouillage |
| Mise en service | `Controles.gs`, `Setup.gs` | Contrôle des classeurs, de la campagne et des accès ; configuration depuis l'éditeur |
| Entrée | `Code.gs`, `Index.html`, `Styles.html`, `Client.html` | Page et fonctions `api*` appelées par le navigateur |

Règles reprises d'EurePrev :
- Chaque appel serveur recalcule l'identité et les droits. Le navigateur ne décide de rien.
- Les écritures passent sous verrou de script (30 s d'attente au plus).
- Un appel qui écrit porte un identifiant d'opération : rejoué après une coupure réseau, il renvoie le résultat enregistré sans écrire deux fois.
- Les codes et dates sont écrits au format texte pour garder les zéros initiaux.
- Une colonne inconnue est refusée à l'écriture.

## Droits

Les capacités viennent de l'onglet PROFILS, le périmètre de l'onglet ACCES. Une ligne d'accès dont le rôle est inconnu ou dont le périmètre obligatoire est vide est ignorée (signalée par les contrôles). Création de version :

| Type | Capacité requise |
|---|---|
| PREV_TC | Configuration |
| STATISTIQUE, ARBITREE | Arbitrage |
| VALIDEE | Validation |

Les écritures sont permises quand la campagne est OUVERTE, et en PREPARATION pour les rôles de configuration seulement.

## Installation

1. Créer les classeurs à partir de `modeles/xlsx/` et les convertir en Google Sheets (PARAMETRES_SOP, SORTIE_SOP). Compléter CAMPAGNES (une seule ligne `Selectionnee = OUI`, `ID sortie` = ID du fichier SORTIE_SOP), REGLAGES (`DOMAINES`) et ACCES.
2. Restreindre le partage des classeurs. Les utilisateurs n'ont pas besoin d'y accéder : la web app s'exécute au nom du déployeur.
3. Créer un projet Apps Script avec un compte `@eureden.com` habilité. Copier tous les `.gs` et `.html` de `code/` et le manifeste `appsscript.json` (afficher le manifeste dans les paramètres du projet).
4. Vérifier que le projet contient **tous** les fichiers : `Code.gs` (point d'entrée de la web app), `Versions.gs`, `Structure.gs`, etc. Sans `Code.gs`, la page ne s'ouvre pas.
5. Dans `Setup.gs`, renseigner l'ID du fichier PARAMETRES_SOP dans `configurerParametres`, enregistrer, puis choisir cette fonction dans la liste « Exécuter » et la lancer. Lancer ensuite `installerDepuisEditeur` : le compte courant devient administrateur initial. Aucune autre adresse n'est créée. Lancer enfin `verifierInstallation` et lire le résultat dans le journal d'exécution.
6. Déployer en **Application web** : exécuter en tant que **moi (le déployeur)**, accès **limité à l'organisation**. Ne jamais déployer en accès anonyme.
7. Ouvrir l'URL `/exec`, onglet **Contrôles**, lancer les contrôles et corriger ce qui est signalé.

Les fonctions de `Setup.gs` n'ont volontairement pas de `_` final : Apps Script masque dans la liste « Exécuter » les fonctions qui en portent un. Comme elles restent appelables depuis la page, chacune refuse tout appelant qui n'est pas le compte déployeur.

Si la page affiche `IDENTITE_INDISPONIBLE`, les politiques Workspace empêchent de lire l'adresse du visiteur : demander à l'administrateur Workspace de corriger le déploiement, sans contourner le contrôle.

## Tests

```
python3 outils/structure.py   # régénère Structure.gs et les modèles si la structure change
node tests/run.js             # 53 tests, aucune dépendance
```

Les tests exécutent le vrai code Apps Script dans Node avec un double en mémoire de Google Sheets, construit à partir des en-têtes de `modeles/`. Ils ne couvrent ni les quotas de Google, ni les politiques du domaine, ni la lecture réelle de l'adresse du visiteur. Ces points se vérifient en recette, avec plusieurs comptes.

## Limites connues du socle

- Chaque appel relit les onglets de paramètres en entier. C'est sans conséquence pour des paramètres de quelques centaines de lignes, mais les grosses tables (PREVISION, VENTES) devront être lues par plages.
- Les écritures groupent un seul onglet à la fois. Les écritures multi-onglets atomiques (comme la transaction Sheets API d'EurePrev) viendront avec la saisie des prévisions.
- Les accès sont lus à chaque appel. Pour de nombreux utilisateurs simultanés, prévoir un cache court après mesure en recette.

## Prochaines étapes

Import des historiques et des ventes, calcul de la prévision statistique, cadençage hebdomadaire, saisie des corrections avec conflits de version, projection de stock, approvisionnement cadencé.

## Historique des ventes d'un PAC (v0.1.0)

L'écran **Historique** lit directement les fichiers déclarés dans l'onglet SOURCES de PARAMETRES_SOP (Nature = `HISTO_PAC`).

Une ligne par fichier, donc une pour Eureden et une pour ONA :

| Colonne | Valeur |
|---|---|
| ID source | `HISTO_EUREDEN`, `HISTO_ONA` |
| Nature | `HISTO_PAC` |
| ID fichier | ID du Google Sheets (partie de l'URL entre `/d/` et `/edit`) |
| Onglet | `Données {ANNEE}` (`{ANNEE}` est remplacé par chaque année) |
| Actif import | `OUI` |
| Entite | `Coop EUREDEN` ou `NEGOCE ONA` |
| PAC | `PAC1` |
| Annees | `2024,2025,2026` |
| Format | `SHEETS` |

Colonnes lues dans chaque onglet (reconnues par leur début, sans tenir compte des accents ni de la casse) : `Code produit…`, `Libellé produit…`, `Code technicien…`, `Nom du technicien…` (facultative), `Total qtés vtes`, `Total Ha vtes`, `Total mt ht vtes`.

- Le compte qui déploie l'application doit avoir accès aux deux fichiers.
- Un fichier Excel doit d'abord être enregistré en Google Sheets (Fichier > Enregistrer en tant que feuille Google Sheets) : l'ID change.
- L'application ne recoupe aucune période : elle prend le contenu de l'onglet.
- Droits : global, ou périmètre limité à un Code TC et/ou une Entité. Un périmètre territoire, bassin ou marché ne donne accès à aucune ligne (ces fichiers ne portent pas ces informations).
- Les contrôles de mise en service ouvrent chaque onglet et vérifient les colonnes.

## Prévision statistique (v0.1.0)

L'écran **Prévision** calcule, par article et par entité, la moyenne pondérée des années de l'historique du PAC.

- Pondération : réglage `PONDERATION_ANNEES` (défaut `50/30/20`, dernière année en premier). Décimales : `PRECISION_QTE` (défaut 3).
- Un article est calculé depuis sa première année de vente. Une année sans vente entre deux ventes compte 0. Un article sans vente la dernière année n'est pas reconduit (0).
- Le calcul crée une version `STATISTIQUE` (scénario BASE), remplace `PREVISION` (plateforme `*` tant que l'affectation des plateformes n'est pas branchée), écrit la photo dans `INSTANTANES` et journalise.
- Droits : capacité d'arbitrage et périmètre global. Campagne OUVERTE (ou PREPARATION pour les rôles de configuration).
- Refus si la version courante est verrouillée, ou si `PREVISION` contient déjà des quantités de TC, d'événements, de correction ou d'arbitrage.

### Aide au choix de la pondération

Le bouton « Tester les pondérations sur l'historique » (écran Prévision) prédit la dernière année d'historique avec les années précédentes seulement, pour plusieurs pondérations, puis compare au réel : erreur (somme des écarts absolus par article et entité / ventes réelles) et biais (total prévu / total réel - 1). Il faut au moins deux années et un périmètre global.

## Corrections, événements, arrêts de produit, substitutions (v0.1.0)

L'onglet **Corrections** enregistre quatre types de saisie. Aucune ne modifie `PREVISION` avant le bouton « Appliquer les corrections (version arbitrée) » de l'écran Prévision.

| Saisie | Où elle est écrite | Effet |
|---|---|---|
| Correction | `AJUSTEMENTS_SEMAINE` (SORTIE), type CORRECTION | Quantité ou % de la statistique, avec motif obligatoire |
| Événement | `EVENEMENTS_COMMERCE` (SORTIE) : POLCO, PROMO, GRAND_COMPTE, APPEL_OFFRES, REGLEMENTAIRE | Quantité ou % de la statistique |
| Arrêt de produit | `SUBSTITUTIONS` (PARAMETRES_SOP), sans nouveau code | L'article perd le taux indiqué (100 % par défaut) |
| Substitution | `SUBSTITUTIONS` (PARAMETRES_SOP) | L'ancien perd le taux, le nouveau le reçoit (même entité) |

Règles :
- Version arbitrée : quantité retenue = statistique + événements + corrections + substitutions, au minimum 0 (avertissement si une quantité tombe sous zéro). Les colonnes `Qte evenements`, `Qte correction`, `Qte substitution`, `Qte arbitree` de `PREVISION` portent le détail. La colonne `Qte substitution` est la dernière de l'onglet (modèle v0.9).
- Un pourcentage s'applique à la statistique de l'article. Pas de chaînage de substitutions : tout part de la statistique.
- Un nouvel article (sans historique) reçoit une ligne `PREVISION` avec réalisé 0.
- Une substitution ou un arrêt s'applique si l'année de prévision de la campagne tombe dans sa période (années de `Date effet` et `Date fin`), et si sa portée est PREVISION ou LES_DEUX.
- Les semaines saisies sur corrections et événements sont conservées pour le cadençage ; au niveau du PAC seule la quantité compte.
- Droits : correction et événement demandent la capacité de correction de la prévision, arrêt et substitution la validation de gamme ou l'arbitrage, tous avec un périmètre global. Annulation : mêmes droits. Journal et reçus d'opération comme ailleurs.
- Recalculer la statistique crée une version STATISTIQUE sans effets : les saisies actives sont conservées, il suffit de réappliquer.

## Organisation de l'interface (v0.2.0)

Interface sur le modèle de la maquette : en-tête (campagne, entité, unité), menu à gauche, écrans.

| Fichier | Rôle |
|---|---|
| `Index.html` | Ossature de la page (en-tête, menu, zone de contenu, boîte de dialogue) |
| `Styles.html` | Feuille de style (charte Eureden) |
| `ClientCore.html` | Appels serveur (`api`), unités, filtres, navigation, boîte de dialogue, export CSV, graphique |
| `VueDashboard.html` | Tableau de bord |
| `VuePrevision.html` | Prévision & arbitrage (corrections dans le tableau, reprévision, événements) |
| `VueHistorique.html` | Historique, arrêts de produit et substitutions |
| `VueAutres.html` | Versions & fiabilité, sources de données, contrôles, écrans à venir |
| `Code.gs` | `doGet` et point d'entrée unique `api(nom, arguments, idCampagne)` |

- Le navigateur n'appelle que `api` : chaque appel recalcule l'identité, les rôles et le périmètre pour la campagne choisie.
- Unités : Quantité (unités de stock), Hectares, Valeur €. Hectares et valeur d'une quantité prévue se déduisent de la dernière année de vente de l'article. « Tonnes » viendra avec le catalogue (poids).
- L'ancien fichier `Client.html` est supprimé : retirez-le d'Apps Script.

## Tests

- `node tests/run.js` : tests unitaires du serveur (feuilles simulées en mémoire).
- `node tests/e2e.js` : test de bout en bout, vrai navigateur (Playwright) branché sur le code serveur. `CAPTURES=<dossier>` enregistre une capture par étape.

## Corrections de l'historique, validation, cadençage, publication (v0.3.0)

- **Corrections de l'historique** (`CORRECTIONS_HISTO`, SORTIE) : une correction remplace la quantité d'un article pour une année (type : rupture, anomalie, événement exceptionnel, substitution, problème d'appro fournisseur). Le brut des fichiers n'est jamais écrasé (colonne `Qte brute`). Elle compte dans la statistique à la reprévision suivante. Droit : correction de l'historique. Un TC voit toujours le brut.
- **Validation** : un rôle avec la capacité de validation valide la version arbitrée courante. Une version `VALIDEE` verrouillée est créée, `Qte validee` est figée dans `PREVISION`, la photo est écrite dans `INSTANTANES`. Aucun recalcul ni reprévision n'est ensuite possible sur cette version.
- **Comparaison** de deux versions à partir de `INSTANTANES`, **fiabilité réelle** (prévision comparée aux ventes de l'année prévue dès que l'historique la contient), **journal** des modifications, exports CSV.
- **Cadençage** (`COEFFICIENTS`, PARAMETRES_SOP) : une ligne par semaine ISO, niveau `GLOBAL` (cle `*`) ou `ARTICLE` (cle = code produit), somme 100. Un cadençage d'article remplace le global pour cet article. Les semaines sont celles de l'année de prévision de la campagne ; une semaine se rattache au mois de son jeudi. Les coefficients se saisissent dans l'écran Cadençage (saisie semaine par semaine, répartition uniforme, ou collage d'une colonne). Droit : arbitrage pour enregistrer, validation pour valider.
- **Publication** (`PUBLICATION_MENSUELLE`, `PUBLICATION_HEBDO`, `CONTRAT`, SORTIE) : écrite à la validation d'une version, et à la demande (bouton Republier) après un changement de cadençage. Sans cadençage, la validation réussit mais rien n'est publié (message explicite). Une ligne par article, entité et semaine (ou mois). `Quantite demande` est la demande prévue ; `Quantite reelle` en retire les ventes perdues ou reportées par les ruptures déclarées (onglet RUPTURES, écran Stocks) et y ajoute les ventes reportées sur un substitut ; `Unite stock` et les tonnes restent vides tant que le catalogue (poids) n'est pas lu. Le contrat est décrit dans `CONTRAT` (version `SOP.CONTRAT_VERSION`, 1.0).

## Projection des stocks et approvisionnements (v0.4.0)

L'écran **Projection des stocks** projette, semaine par semaine et par article, le stock à partir du dernier relevé, des commandes fournisseurs restant à livrer et de la prévision retenue cadencée.

Sources déclarées dans SOURCES (ID fichier, Onglet, Actif import = OUI) :

| Nature | Colonnes reconnues (début du nom, sans accents ni casse) |
|---|---|
| `STOCKS` | `Date stock`, `Plateforme`, `Code produit`, `Stock`, `Entite` (facultative) |
| `COMMANDES_FOURN` (facultative) | `Code produit`, `Code point`, `Date limite livraison`, `Quantite reste a livrer`, `Code fournisseur` (facultative) |

- Dates acceptées : date Google Sheets, `AAAA-MM-JJ`, `JJ/MM/AAAA`. Le dernier relevé de chaque plateforme et article sert de départ ; plusieurs lignes d'un même relevé (par entité) s'additionnent.
- Une commande en retard est reçue dès la première semaine ; une commande soldée est ignorée.
- Rupture : le stock projeté passe sous le minimum de l'article (`PARAMETRES_STOCK`, somme des minimums, 0 par défaut). Surstock : le stock de fin dépasse `COUVERTURE_MAX_MOIS` (3 par défaut) de demande mensuelle moyenne.
- Besoin de réapprovisionnement : manque maximal, arrondi au lot de `PARAMETRES_STOCK`, à commander avant la semaine du besoin moins le délai de `CONTRAINTES_APPRO` (0 si absent).
- La projection est **globale par article** : répartir la demande par plateforme demande l'affectation des TC aux plateformes (non branchée). Les capacités de stockage demandent le poids des articles.
- Les ruptures et surstocks alimentent les alertes du tableau de bord. Les commandes proposées sont publiées dans `PUBLICATION_APPRO` à la validation d'une version.

## Saisie des TC, cache (v0.5.0)

- **Saisie des TC** : source de nature `PREV_TC` dans SOURCES, pointant vers la sortie EurePrev (onglet `DONNEES` par défaut). Colonnes lues (début du nom, sans accents ni soulignés de tête) : `Canal de distribution` (entité), `Code produit`, `Code technicien`, `PREV AAAA en QTE` (AAAA = année de prévision de la campagne), `Saisie pour prévisions Coop` (OUI = ligne à saisir). Une cellule vide n'est pas un zéro. La saisie est agrégée par article et par entité dans la colonne `Qte TC` de `PREVISION`, et comparée à la statistique (alertes si l'écart dépasse `SEUIL_ECART_N1`).
- **Quantité de départ de l'arbitrage** : réglage `BASE_ARBITRAGE` = `STATISTIQUE` (par défaut) ou `TC` (saisie des TC quand elle existe, sinon statistique). Les pourcentages de correction et les substitutions s'appliquent à cette quantité.
- Un fichier TC illisible n'empêche jamais le calcul : un avertissement est affiché.
- **Cache** (`Cache.gs`) : l'historique agrégé et la saisie des TC sont gardés 10 minutes dans le cache du script (entrées découpées sous 100 Ko). Le bouton « Actualiser » de l'en-tête force la relecture. Un cache indisponible ne change rien au résultat, seulement au temps de réponse.

## Budget (v0.6.0)

Source de nature `BUDGET` dans SOURCES (ID fichier, Onglet). Colonnes reconnues : `Annee`, `Version budget`, `Mois` (AAAA-MM), `Code produit`, `Entite`, `Quantite`, `Valeur euro` (quantité ou valeur au choix). Seul le budget de l'année de prévision est lu, dans la version du réglage `BUDGET_VERSION` (à défaut la dernière du fichier). Réservé au droit « Voir budget » ; seuls des totaux par mois et par entité sont renvoyés au navigateur.

Le tableau de bord compare la prévision retenue au budget **des mois du cadençage** (indicateur, colonnes Budget et vs budget, courbe mensuelle). Il n'y a pas de budget en hectares. Sans cadençage, le budget attend pour être comparé.

## Catalogue (v0.7.0)

Le catalogue (libellé, marché = groupe de structure, famille, segment, unité de stock) est lu dans la même source `PREV_TC` que la saisie des TC (même fichier, même cache). Sans cette source, il est vide et l'application fonctionne sans marché ni unité.

- Dans le tableau de bord : **vue comité par marché** ; dans la prévision : filtre par marché et marché sous le code produit.
- **Cadençage par marché** : le jeu d'un marché (`COEFFICIENTS`, niveau `MARCHE`, clé = nom du marché, casse indifférente) remplace le cadençage global pour ses articles ; le jeu d'un article remplace celui de son marché.
- `PREVISION.Unite stock` et les onglets de publication portent l'unité du catalogue. Les tonnes sont renseignées pour les articles en **KG** (÷ 1000) ; pour les unités et les litres elles restent vides tant que le poids des articles n'est pas lu.

Voir aussi `docs/mise-en-service.md` (branchement de chaque source).

## Ruptures (demande et réel en parallèle)

Une rupture se déclare depuis l'écran Stocks (entité, article, semaines, cause, traitement des ventes : perdues, reportées en partie à une semaine de retour, ou transférées en partie vers un article substitut). Elle est écrite dans l'onglet RUPTURES de la sortie et ne modifie jamais la demande. À la prochaine reprévision, la colonne `Qte reelle attendue` de PREVISION est recalculée ; à la validation, `Quantite reelle` est publiée à côté de `Quantite demande`. L'écran Stocks affiche la projection « demande » (qui peut passer sous zéro) et la projection « réelle » (plancher à zéro) et les ventes perdues prévues.

## Relecture indépendante

Défauts corrigés après relecture : création de version réservée au périmètre global et impossible sur une version validée ; budget filtré par entité ; « * » refusé comme périmètre d'un TC ; reprévision atomique (contrôles avant écriture) ; reçu d'opération tronqué au-delà de 40 000 caractères ; en-têtes lus sans relire tout l'onglet et grille agrandie avant écriture ; dernier relevé de stock pris par plateforme ; stocks réservés au périmètre global ; mois du budget acceptés au format date ; export CSV neutralisant les formules ; cadre d'intégration (iframe) retiré. Restent connus : réécriture complète de COEFFICIENTS à chaque sauvegarde, (un échec de publication après validation est désormais journalisé et signalé, le reçu est enregistré).
