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
4. Dans `Setup.gs`, renseigner l'ID du fichier PARAMETRES_SOP dans `configurerParametres_`, puis lancer la fonction depuis l'éditeur. Lancer ensuite `installerDepuisEditeur_` : le compte courant devient administrateur initial. Aucune autre adresse n'est créée.
5. Déployer en **Application web** : exécuter en tant que **moi (le déployeur)**, accès **limité à l'organisation**. Ne jamais déployer en accès anonyme.
6. Ouvrir l'URL `/exec`, onglet **Contrôles**, lancer les contrôles et corriger ce qui est signalé.

Si la page affiche `IDENTITE_INDISPONIBLE`, les politiques Workspace empêchent de lire l'adresse du visiteur : demander à l'administrateur Workspace de corriger le déploiement, sans contourner le contrôle.

## Tests

```
python3 outils/structure.py   # régénère Structure.gs et les modèles si la structure change
node tests/run.js             # 45 tests, aucune dépendance
```

Les tests exécutent le vrai code Apps Script dans Node avec un double en mémoire de Google Sheets, construit à partir des en-têtes de `modeles/`. Ils ne couvrent ni les quotas de Google, ni les politiques du domaine, ni la lecture réelle de l'adresse du visiteur. Ces points se vérifient en recette, avec plusieurs comptes.

## Limites connues du socle

- Chaque appel relit les onglets de paramètres en entier. C'est sans conséquence pour des paramètres de quelques centaines de lignes, mais les grosses tables (PREVISION, VENTES) devront être lues par plages.
- Les écritures groupent un seul onglet à la fois. Les écritures multi-onglets atomiques (comme la transaction Sheets API d'EurePrev) viendront avec la saisie des prévisions.
- Les accès sont lus à chaque appel. Pour de nombreux utilisateurs simultanés, prévoir un cache court après mesure en recette.

## Prochaines étapes

Import des historiques et des ventes, calcul de la prévision statistique, cadençage hebdomadaire, saisie des corrections avec conflits de version, projection de stock, approvisionnement cadencé.
