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
