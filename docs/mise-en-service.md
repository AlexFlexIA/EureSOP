# Mise en service de l'application S&OP

Ce guide dit où brancher chaque donnée. Tout est lu et écrit dans des Google Sheets ; l'application n'a pas d'autre base.

## 1. Les trois niveaux de fichiers

| Fichier | Rôle | Qui écrit |
|---|---|---|
| `PARAMETRES_SOP` | Campagnes, accès, réglages, sources, substitutions, cadençage | Administrateurs, et l'application pour SUBSTITUTIONS et COEFFICIENTS |
| `SORTIE_SOP` (un par campagne) | Versions, prévision, corrections, journal, publication | L'application seulement |
| Fichiers externes (ventes, saisie des TC, stocks, commandes, budget) | Données lues par l'application | Exports et équipes, jamais l'application |

Le compte qui déploie l'application doit avoir accès à tous ces fichiers (lecture pour les externes, écriture pour les deux premiers).

## 2. CAMPAGNES

Une ligne par campagne, une seule avec `Selectionnee` = OUI (campagne ouverte par défaut). Colonnes à renseigner : `ID campagne` (ex. `PAC1_2027`), `Libelle`, `Type` (PAC1 à PAC4, MORTE_SAISON), **`Annee prevision`** (ex. 2027, obligatoire pour le cadençage, le budget et la publication), `Statut` (OUVERTE pour que l'on puisse écrire), `ID sortie` (ID du fichier SORTIE_SOP de la campagne).
Les lignes d'`ACCES` portent le même `ID campagne`.

## 3. SOURCES

Une ligne par fichier externe : `ID source`, `Nature`, `ID fichier` (partie de l'URL entre `/d/` et `/edit`), `Onglet`, `Actif import` = OUI. La colonne `ID campagne` reste vide pour valoir pour toutes les campagnes. Le fichier doit être un **Google Sheets natif** (un Excel se convertit : Fichier > Enregistrer en tant que feuille Google Sheets, l'ID change).

| Nature | Contenu | Colonnes reconnues (début du nom, sans accents ni casse) | Autres colonnes de SOURCES |
|---|---|---|---|
| `HISTO_PAC` | Ventes d'un PAC par année, par TC et article | `Code produit…`, `Libellé produit…`, `Code technicien…`, `Nom du technicien…` (facultative), `Total qtés vtes`, `Total Ha vtes`, `Total mt ht vtes` | `Onglet` = `Données {ANNEE}`, `Entite`, `PAC`, `Annees` (ex. `2024,2025,2026`), `Format` = SHEETS. Une ligne par entité |
| `PREV_TC` | Sortie EurePrev : saisie des TC **et catalogue** (marché, famille, unité) | `Canal de distribution`, `Code produit`, `Code technicien`, `PREV AAAA en QTE`, `Saisie pour prévisions Coop`, et pour le catalogue `Libellé produit…`, `Libellé groupe structure…` (marché), `Libellé famille structure…`, `Segmentation…`, `Libelle abrege unite…` | `Onglet` = `DONNEES` |
| `BUDGET` | Budget par mois (droit « Voir budget ») | `Annee`, `Version budget`, `Mois` (AAAA-MM), `Code produit`, `Entite`, `Quantite`, `Valeur euro` | `Onglet`, `Sensible` = OUI |
| `STOCKS` | Relevé de stock par plateforme | `Date stock`, `Plateforme`, `Code produit`, `Stock`, `Entite` (facultative) | `Onglet` |
| `COMMANDES_FOURN` | Commandes fournisseurs restant à livrer | `Code produit`, `Code point`, `Date limite livraison`, `Quantite reste a livrer`, `Code fournisseur` (facultative) | `Onglet` |

Un fichier illisible ne bloque jamais l'application : l'écran concerné ou une alerte du tableau de bord le dit. L'écran **Sources de données** donne l'état de chaque fichier ; **Contrôles de mise en service** vérifie en plus les classeurs, la campagne, les accès et les colonnes.

## 4. REGLAGES

| Clé | Valeur | Rôle |
|---|---|---|
| `DOMAINES` | `eureden.com` | Domaine exact des adresses autorisées |
| `PONDERATION_ANNEES` | `50/30/20` | Poids de la dernière année, de l'avant-dernière, etc. dans la statistique. L'écran Versions & fiabilité teste des alternatives sur l'historique |
| `PRECISION_QTE` | `3` | Décimales des quantités |
| `SEUIL_ECART_N1` | `15` | Écart (en %) au-delà duquel une alerte est levée |
| `BASE_ARBITRAGE` | `STATISTIQUE` ou `TC` | Quantité de départ de l'arbitrage |
| `BUDGET_VERSION` | ex. `V2` | Version du budget comparée ; vide = la dernière du fichier |
| `COUVERTURE_MAX_MOIS` | `3` | Au-delà, un stock de fin est un surstock |

## 5. Paramètres facultatifs qui enrichissent l'application

- `PARAMETRES_STOCK` : stock mini et lot de réapprovisionnement par article.
- `CONTRAINTES_APPRO` : délai fournisseur (`Lead time semaines`), par article ou pour tous.
- `COEFFICIENTS` : cadençage, saisi dans l'écran Cadençage (global, par marché ou par article).
- `SUBSTITUTIONS` : arrêts de produit et remplacements, saisis dans l'écran Historique & substitutions.

## 6. Dans l'ordre

1. Importer `PARAMETRES_SOP.xlsx` et `SORTIE_SOP.xlsx` (modèles v0.9) dans Google Sheets, noter les ID.
2. Déployer l'application (voir `code/README.md`), lancer `configurerParametres` puis `installerDepuisEditeur`.
3. Renseigner CAMPAGNES, ACCES, REGLAGES, SOURCES.
4. Lancer **Contrôles de mise en service** (administrateur) et corriger ce qui est signalé.
5. Dans **Prévision & arbitrage** : calculer la statistique, vérifier la pondération (écran Versions & fiabilité), définir le **Cadençage**.
6. En comité : saisir corrections, événements, arrêts et substitutions, enregistrer la reprévision, puis **Valider** la version (écran Versions & fiabilité). La validation écrit `PUBLICATION_MENSUELLE`, `PUBLICATION_HEBDO`, `PUBLICATION_APPRO` et `CONTRAT`, que les autres applications lisent.

## 7. Limites connues

- La projection des stocks est globale par article : la répartition par plateforme demande l'affectation des TC aux plateformes (`AFFECTATION_PLATEFORME`, pas encore branchée).
- Les tonnes ne sont calculées que pour les articles dont l'unité de stock est le kilogramme. Le poids des articles en unités ou en litres demande la source `POIDS_ARTICLE`.
- Les capacités de stockage, les ruptures déclarées (vue demande contre réel) et la publication d'une vue « réelle » ne sont pas encore branchées.
- Le cadençage est une répartition de la quantité du PAC sur des semaines ISO ; il ne calcule pas encore de profil à partir d'un historique hebdomadaire.
- Un périmètre de rôle par territoire, bassin ou marché ne donne accès à aucune ligne des fichiers actuels (ils ne portent pas ces informations) ; seuls les périmètres global, entité et code TC fonctionnent.
