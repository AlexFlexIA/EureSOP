# Source unique de la structure des feuilles Google Sheets.
# Génère : modeles/<FICHIER>/<ONGLET>.csv (en-têtes seuls) et docs/structure-des-feuilles.md (intro + tableaux).
# Usage : python3 outils/structure.py
#
# Conventions (reprises d'EurePrev) : noms d'onglets en MAJUSCULES_SANS_ACCENT, en-têtes sans accent,
# codes et identifiants en TEXTE, OUI/NON en majuscules, vide = absence de valeur (jamais zéro).

T, E, D, DT, B = "TEXTE", "ENTIER", "DECIMAL", "DATE", "OUI/NON"

# (nom colonne, type, règle / exemple)
PARAM = {
 "MODE_EMPLOI": ("Aide courte à l'intérieur du classeur.", [
   ("Sujet", T, ""), ("Instruction", T, "")]),
 "CAMPAGNES": ("Une ligne par campagne S&OP. Exactement une ligne Selectionnee = OUI.", [
   ("ID campagne", T, "Ex. SOP_2027_PAC2. Unique."),
   ("Libelle", T, ""),
   ("Type", "LISTE", "PAC1 | PAC2 | PAC3 | PAC4 | MORTE_SAISON"),
   ("Annee prevision", E, "Ex. 2027"), ("Annee N-1", E, ""), ("Annee N-2", E, ""),
   ("Debut", DT, "AAAA-MM-JJ"), ("Fin", DT, "AAAA-MM-JJ"),
   ("Mois debut horizon", T, "AAAA-MM"), ("Horizon mois", E, "Ex. 12"),
   ("Statut", "LISTE", "PREPARATION | OUVERTE | GELEE | CLOTUREE"),
   ("ID sortie", T, "ID du fichier SORTIE_SOP de cette campagne"),
   ("Selectionnee", B, ""), ("Commentaire", T, "")]),
 "REGLAGES": ("Clé / valeur. Réglages globaux de l'application.", [
   ("Cle", T, "DOMAINES, UNITE_PIVOT, SEUIL_ECART_N1, COUVERTURE_MIN_MOIS, COUVERTURE_MAX_MOIS, HORIZON_HEBDO_SEMAINES, PONDERATION_ANNEES, ALPHA_LISSAGE, PUBLICATION_HEBDO_TOUS, PRECISION_QTE, PRECISION_TONNES, MAX_LOT, VERSION_REFERENTIEL, RATTACHEMENT_SEMAINE"),
   ("Valeur", T, ""), ("Commentaire", T, "")]),
 "PROFILS": ("Droits par rôle. Un rôle donne des capacités ; le périmètre est dans ACCES.", [
   ("Role", "LISTE", "ADMIN | PREV | RM | AM | RT | CD | RBP | TC | SUPPLY"),
   ("Consultation", B, ""), ("Correction prevision", B, ""), ("Arbitrage", B, ""),
   ("Validation", B, "Fige une version"), ("Correction historique", B, ""),
   ("Validation gamme", B, ""), ("Voir budget", B, "Données sensibles"),
   ("Configuration", B, ""), ("Perimetre obligatoire", T, "Ex. Territoire, Bassin, Marche, GLOBAL")]),
 "ACCES": ("Une ligne = un accès. Chaque colonne remplie est une condition ; vide ou * = pas de restriction.", [
   ("ID campagne", T, ""), ("Email Google", T, "@eureden.com"), ("Role", "LISTE", "voir PROFILS"),
   ("Code technicien", T, "Rôle TC uniquement"), ("Entite", T, ""), ("Calendrier", T, ""),
   ("Departement TC", T, ""), ("Territoire TC", T, ""), ("Bassin TC", T, ""),
   ("Marche", T, ""), ("Plateforme", T, ""), ("Global", B, ""), ("Actif", B, ""), ("Commentaire", T, "")]),
 "TC": ("Référentiel des techniciens. Même structure qu'EurePrev (permanent).", [
   ("Code technicien", T, "Texte, zéros initiaux conservés"), ("Libelle technicien", T, ""), ("Mail", T, ""),
   ("Entite", T, "Valeur exacte de _Canal de distribution"), ("Calendrier", T, ""),
   ("Departement TC", T, ""), ("Territoire TC", T, ""), ("Bassin TC", T, ""), ("Actif", B, ""), ("Source", T, "")]),
 "PRODUITS": ("Référentiel article, permanent. Une ligne par code produit et entité.", [
   ("Code produit", T, "Texte"), ("Entite", T, ""), ("Libelle produit", T, ""),
   ("Niv1", T, ""), ("Niv2", T, ""), ("Niv3", T, ""), ("Niv4", T, ""), ("Famille", T, ""), ("Groupe", T, ""),
   ("Marche", T, ""), ("Sous marche", T, ""), ("Segment", T, "PERF, REF, ACC, FLA conservés tels quels"),
   ("Unite stock", T, "U, KG, L, SAC..."), ("Dangereux", B, "Doit être stocké en zone dangereuse (ex. Cevezo 2 à Glomel)"), ("Classe danger", T, "Classe ADR ou code ONU, si connue"), ("Poids article", D, "Poids ou volume d'une unité de stock, en kg ou L"),
   ("Source poids", T, "Poids de réf, Poids brut, Poids unitaire : règle de priorité à fixer"), ("Unite poids", "LISTE", "KG | L"), ("Densite", D, "Pour convertir L en kg ; vide si KG"),
   ("Dose ha", D, "Reprise EurePrev"), ("Coefficient", D, "Reprise EurePrev"), ("Mode conversion", "LISTE", "DOSE_MULTIPLICATEUR | DOSE_DIVISEUR | SANS_SURFACE"),
   ("Date fin de vie", DT, "Vide si actif"), ("Actif", B, ""), ("Commentaire", T, "")]),
 "GAMME": ("Gamme par campagne, validée par les responsables de marché.", [
   ("ID campagne", T, ""), ("Code produit", T, ""), ("Entite", T, ""),
   ("Dans la gamme", B, ""), ("Vendable hors gamme", B, ""),
   ("Validation", "LISTE", "A_VALIDER | VALIDE"), ("Valide par", T, ""), ("Valide le", DT, "")]),
 "SUBSTITUTIONS": ("Remplacements et reports de ventes entre articles, renseignés par les responsables de marché. Vaut pour l'historique et pour la prévision.", [
   ("ID substitution", T, ""), ("Code ancien", T, "Article qui disparaît ou perd ses ventes"), ("Code nouveau", T, "Article qui reçoit le report"), ("Entite", T, ""),
   ("Portee", "LISTE", "HISTORIQUE | PREVISION | LES_DEUX"),
   ("Motif", "LISTE", "REMPLACEMENT | ARRET | REGLEMENTAIRE | AUTRE"),
   ("Date effet", DT, ""), ("Date fin", DT, "Vide si sans fin"),
   ("Taux de report", D, "% des ventes de l'ancien reportées sur le nouveau, 100 par défaut"),
   ("Renseigne par", T, ""), ("Valide par", T, ""), ("Actif", B, ""), ("Commentaire", T, "Ex. arrêt Minarix, report flufénacet")]),
 "PLATEFORMES": ("Lieux de stockage. Un dépôt peut dépendre d'une plateforme (GLOMEL vers dépôts) et une zone est une partie d'une plateforme (Cevezo 2 à Glomel). Les capacités sont dans CAPACITES.", [
   ("Plateforme", T, "Code, ex. GLOMEL"), ("Libelle", T, ""),
   ("Type", "LISTE", "PLATEFORME | DEPOT | DEPOT_DEBORD | ZONE"), ("Plateforme parente", T, "Alimente ce dépôt, ou plateforme qui contient la zone (CEVEZO2 pour GLOMEL)"),
   ("Entite", T, ""), ("Actif", B, "")]),
 "CAPACITES": ("Capacités par plateforme, avec ou sans détail par famille. Plusieurs lignes possibles par plateforme et par période.", [
   ("Plateforme", T, "Plateforme, dépôt ou zone"), ("Niveau", "LISTE", "PLATEFORME | ZONE | GROUPE | FAMILLE | MARCHE | ARTICLE | DANGEREUX"),
   ("Cle niveau", T, "* pour le total, sinon le groupe, la famille, le marché, le code article. OUI pour DANGEREUX"),
   ("Type capacite", "LISTE", "STOCKAGE | RECEPTION_HEBDO | EXPEDITION_HEBDO"),
   ("Unite", "LISTE", "T | KG | L | U"), ("Capacite", D, "Valeur maximale dans l'unité"),
   ("Seuil alerte pourcent", D, "Alerte au-delà de ce taux, ex. 90"),
   ("Debut validite", DT, "Vide = toujours. Permet une capacité saisonnière"), ("Fin validite", DT, ""),
   ("Commentaire", T, "Ex. stockage séparé des produits dangereux")]),
 "REGLES_STOCKAGE": ("Où stocker quoi : les articles dangereux, une famille ou un article sont orientés vers une zone.", [
   ("Plateforme", T, "Ex. GLOMEL"), ("Zone", T, "Ex. CEVEZO2"),
   ("Critere", "LISTE", "DANGEREUX | FAMILLE | MARCHE | ARTICLE"), ("Valeur critere", T, "OUI pour DANGEREUX, sinon le code"),
   ("Mode", "LISTE", "OBLIGATOIRE | PREFERE"), ("Actif", B, "")]),
 "AFFECTATION_PLATEFORME": ("Quelle plateforme sert quel bassin. Reprise de l'onglet PLATEFORMES d'EurePrev.", [
   ("Entite", T, ""), ("Territoire TC", T, ""), ("Bassin TC", T, ""), ("Plateforme", T, "Plateforme rattachée"), ("Km", D, "Distance bassin vers cette plateforme"),
   ("Validation", "LISTE", "A_VALIDER | VALIDE"), ("Source", T, "")]),
 "FORCAGES": ("Livraisons faites depuis une autre plateforme que la plateforme rattachée.", [
   ("Entite", T, ""), ("Bassin TC", T, ""), ("Code produit", T, "Vide = tout le marché"), ("Plateforme rattachee", T, ""), ("Plateforme forcee", T, ""),
   ("Debut", DT, ""), ("Fin", DT, ""), ("Motif", T, ""), ("Actif", B, "")]),
 "POINTS": ("Points de départ des livraisons (bases de proximité, magasins). Les magasins sont regroupés.", [
   ("Code point", T, "« Départ depuis » dans BO, « Code du point » dans les achats"), ("Libelle point", T, ""),
   ("Type point", "LISTE", "BDP | AB | KORIT | MAGASIN | AUTRE"), ("Groupe magasins", T, "Regroupement demandé pour les magasins"),
   ("Bassin TC", T, ""), ("Plateforme rattachee", T, ""), ("Actif", B, "")]),
 "CALENDRIER": ("Semaines, mois et campagnes. Évite les calculs de dates dans l'application.", [
   ("Semaine", T, "AAAA-Sss (ISO)"), ("Date debut", DT, "Lundi"), ("Date fin", DT, "Dimanche"),
   ("Mois rattache", T, "AAAA-MM, règle REGLAGES / RATTACHEMENT_SEMAINE"), ("Annee", E, ""),
   ("Type campagne", T, "PAC1 à PAC4 ou MORTE_SAISON")]),
 "COEFFICIENTS": ("Cadençage : répartition du besoin annuel sur les semaines. Les mois du comité s'obtiennent en additionnant les semaines.", [
   ("ID campagne", T, ""), ("Niveau", "LISTE", "MARCHE | FAMILLE | ARTICLE | PLATEFORME"),
   ("Cle niveau", T, "Valeur du niveau, ex. marché ENGRAIS"), ("Plateforme", T, "* = toutes"),
   ("Semaine", E, "Numéro de semaine ISO, 1 à 53"),
   ("Coefficient", D, "En % du besoin annuel. Somme = 100 par ensemble Niveau, Cle niveau, Plateforme"),
   ("Origine", "LISTE", "HISTORIQUE | BUDGET | MANUEL"),
   ("Version coefficients", E, "Incrémentée à chaque modification"), ("Validation", "LISTE", "A_VALIDER | VALIDE"),
   ("Valide par", T, "")]),
 "CONTRAINTES_APPRO": ("Fournisseurs, délais et conditions d'achat.", [
   ("Code fournisseur", T, ""), ("Libelle fournisseur", T, ""), ("Marche", T, ""), ("Code produit", T, "Vide = tout le marché"),
   ("Plateforme", T, "* = toutes"), ("Lead time semaines", E, ""), ("Mini commande T", D, ""),
   ("Multiple commande T", D, "Ex. camion complet"), ("Palier remise T", D, ""),
   ("Avance max semaines", E, "De combien on peut avancer une livraison pour respecter une capacité"), ("Retard max semaines", E, "De combien on peut la retarder sans risque de rupture"),
   ("Debut validite", DT, ""), ("Fin validite", DT, ""), ("Commentaire", T, "")]),
 "DECIDEURS_APPRO": ("Qui peut demander ou accepter un décalage de commande, selon la période de campagne. Une demande vient du client ou de la logistique.", [
   ("Type campagne", "LISTE", "PAC1 | PAC2 | PAC3 | PAC4 | MORTE_SAISON"), ("Marche", T, "* = tous"), ("Plateforme", T, "* = toutes"),
   ("Email Google", T, ""), ("Pouvoir", "LISTE", "DEMANDER | ACCEPTER"), ("Origine represente", "LISTE", "CLIENT | LOGISTIQUE"), ("Actif", B, "")]),
 "ROUTES_APPRO": ("D'où vient le stock d'un article sur une plateforme : fournisseur ou transfert depuis une autre plateforme.", [
   ("Plateforme", T, "Destination"), ("Code produit", T, "Vide = tout le marché"), ("Marche", T, ""),
   ("Type source", "LISTE", "FOURNISSEUR | PLATEFORME"), ("Code source", T, "Code fournisseur ou plateforme d'origine, ex. GRUEL"),
   ("Delai semaines", E, ""), ("Actif", B, ""), ("Commentaire", T, "")]),
 "PARAMETRES_STOCK": ("Seuils de stock par article et plateforme. Servent à calculer le besoin de réapprovisionnement.", [
   ("Plateforme", T, ""), ("Code produit", T, ""), ("Stock mini", D, "Unité de stock"), ("Stock cible", D, ""),
   ("Lot reappro", D, "Taille de lot ou palier d'achat"), ("Actif", B, "")]),
 "SEUILS_ALERTES": ("Alertes automatiques.", [
   ("Code alerte", "LISTE", "ECART_N1 | RUPTURE_PREVUE | SURSTOCK_PREVU | SATURATION_PREVUE | ECART_PREVISION | COUVERTURE_BASSE"),
   ("Libelle", T, ""), ("Seuil", D, ""), ("Unite seuil", T, "%, mois, T"),
   ("Perimetre", T, "Marché, plateforme ou * "), ("Role destinataire", T, ""), ("Actif", B, "")]),
 "SOURCES": ("Fichiers d'entrée alimentés par ailleurs. Une ligne par flux.", [
   ("ID source", T, ""), ("Nature", "LISTE", "VENTES | STOCKS | BUDGET | COMMANDES_FOURN | PREV_TC | POIDS_ARTICLE | ORDONNANCEMENT"),
   ("ID fichier", T, "ID Google Sheet natif"), ("Onglet", T, ""),
   ("Frequence", "LISTE", "HEBDO | MENSUEL | A_LA_DEMANDE"), ("Mode alimentation", "LISTE", "MANUEL | EXPORT_BO | QLIK | AUTOMATIQUE | APPLICATION"),
   ("Responsable", T, ""), ("Sensible", B, ""), ("Derniere synchro", DT, "Écrite par l'application"),
   ("Lignes", E, ""), ("Actif import", B, ""), ("Commentaire", T, "")]),
 "ARBITRAGES": ("Décisions de conception en attente ou validées (même principe qu'EurePrev).", [
   ("Decision", T, ""), ("Choix", T, ""), ("Statut", "LISTE", "VALIDE_UTILISATEUR | PROPOSITION | A_VALIDER | A_COMPLETER")]),
}

ENTREES = {
 "VENTES_HEBDO": ("Ventes réalisées, agrégées par semaine de livraison, article et point de départ. Un fichier par année civile. Déposé depuis BO ou Qlik.", [
   ("Semaine livraison", T, "AAAA-Sss"), ("Semaine commande", T, "Vide si inconnue"), ("Code produit", T, ""), ("Code point", T, "Départ depuis"),
   ("Entite", T, ""), ("Bassin TC", T, ""), ("Plateforme rattachee", T, ""), ("Plateforme forcee", T, "Si livraison forcée"),
   ("PAC", T, "Campagne de rattachement"), ("Reference PAC PAL", T, "Sens à confirmer"),
   ("Quantite", D, "Unité de stock"), ("Poids total kg", D, ""), ("Valeur euro", D, ""), ("Source", T, "")]),
 "STOCKS_HEBDO": ("Stock par plateforme, extraction hebdomadaire.", [
   ("Date stock", DT, "Lundi"), ("Plateforme", T, ""), ("Code produit", T, ""), ("Entite", T, ""),
   ("Stock", D, "Unité de stock"), ("Source", T, "")]),
 "COMMANDES_FOURN": ("Commandes fournisseurs (commandes d'achat), extraction ERP.", [
   ("N commande", T, ""), ("N commande vente associee", T, "Vide si achat pour stock"), ("Code fournisseur", T, ""), ("Nom fournisseur", T, ""),
   ("Societe partenaire", T, ""), ("Code produit", T, ""), ("Code point", T, "Plateforme de livraison"),
   ("Date commande", DT, ""), ("Date limite livraison", DT, ""), ("Etat", T, "Valeurs de l'ERP à lister"),
   ("Quantite commandee", D, "Unité de stock"), ("Quantite receptionnee", D, ""), ("Quantite reste a livrer", D, ""), ("Prix unitaire", D, "")]),
 "BUDGET": ("Budget par article et mois. Données sensibles, accès restreint.", [
   ("Annee", E, ""), ("Version budget", T, ""), ("Mois", T, "AAAA-MM"), ("Code produit", T, ""),
   ("Entite", T, ""), ("Quantite", D, "Unité de stock"), ("Valeur euro", D, "")]),
}

SORTIE = {
 "MODE_EMPLOI": ("Aide courte.", [("Sujet", T, ""), ("Instruction", T, "")]),
 "VERSIONS": ("Catalogue des versions de la campagne. Une version = un jeu complet de prévisions.", [
   ("ID version", T, "Ex. V004"), ("ID campagne", T, ""), ("Numero", E, ""),
   ("Type", "LISTE", "PREV_TC | STATISTIQUE | ARBITREE | VALIDEE"),
   ("Scenario", T, "BASE par défaut. Ex. ARRET_MINARIX"),
   ("Libelle", T, ""), ("Statut", "LISTE", "BROUILLON | COURANTE | ARCHIVEE"),
   ("Date reunion S&OP", DT, ""), ("Version coefficients", E, "Cadençage utilisé"),
   ("Cree par", T, ""), ("Cree le", DT, ""), ("Verrouillee", B, "OUI après validation"), ("Commentaire", T, "")]),
 "PREVISION": ("Version courante. Une ligne par article, entité et plateforme : le besoin sur l'horizon de la campagne. La répartition par semaine est calculée avec COEFFICIENTS et AJUSTEMENTS_SEMAINE.", [
   ("ID ligne", T, "campagne|entite|produit|plateforme, composants encodés"),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""),
   ("Qte historique corrigee N-1", D, "Unité de stock, sur l'horizon"), ("Qte statistique", D, "Moyenne pondérée et lissage exponentiel"),
   ("Tendance retenue", D, "% appliqué à l'historique N-1, choisi par le prévisionniste"),
   ("Qte TC", D, ""), ("Qte evenements", D, "Polco, promo, réglementaire"),
   ("Qte correction", D, ""), ("Qte arbitree", D, "Demande, comme si l'article était disponible"), ("Qte validee", D, ""),
   ("Qte reelle attendue", D, "Après ruptures déclarées dans RUPTURES. Vide si aucune"),
   ("Unite stock", T, ""), ("Poids article", D, "Copié du référentiel"),
   ("Statut", "LISTE", "PREV_TC | ARBITREE | VALIDEE"), ("Version", T, "ID version courante"),
   ("Version coefficients", E, "Cadençage appliqué"), ("Modifie par", T, ""), ("Modifie le", DT, "")]),
 "AJUSTEMENTS_SEMAINE": ("Exceptions à la répartition normale : une correction ou un événement sur certaines semaines. Ajouts uniquement, jamais de suppression.", [
   ("ID ajustement", T, ""), ("Code produit", T, "Vide = tout le marché"), ("Marche", T, ""), ("Entite", T, ""), ("Plateforme", T, "* = toutes"),
   ("Semaine debut", T, "AAAA-Sss"), ("Semaine fin", T, "AAAA-Sss"),
   ("Type", "LISTE", "CORRECTION | DEPLACEMENT | EVENEMENT"),
   ("Quantite", D, "Unité de stock, ajoutée sur la période"), ("Pourcent", D, "Alternative à la quantité"),
   ("Motif", T, ""), ("Statut", "LISTE", "ACTIF | ANNULE"), ("Cree par", T, ""), ("Cree le", DT, ""), ("Annule par", T, ""), ("Annule le", DT, "")]),
 "INSTANTANES": ("Photo de la quantité retenue à chaque figement de version (besoin sur l'horizon, une ligne par article, entité, plateforme). Permet de comparer les reprévisions.", [
   ("ID version", T, ""), ("ID ligne", T, ""), ("Qte retenue", D, "Arbitrée ou validée selon le type de version")]),
 "CORRECTIONS_HISTO": ("Corrections de l'historique. Le brut n'est jamais écrasé.", [
   ("ID correction", T, ""), ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, "* = toutes"),
   ("Semaine debut", T, "AAAA-Sss"), ("Semaine fin", T, "AAAA-Sss"),
   ("Type", "LISTE", "RUPTURE | ANOMALIE | EVENEMENT | SUBSTITUTION | APPRO_FOURNISSEUR"),
   ("Qte brute", D, "Ce qui a été vendu"), ("Qte corrigee", D, "Demande estimée sans la cause"), ("Methode estimation", "LISTE", "SEMAINES_COMPARABLES | MOYENNE | MANUELLE"), ("Motif", T, ""), ("Commentaire", T, ""),
   ("Statut", "LISTE", "ACTIVE | ANNULEE"), ("Cree par", T, ""), ("Cree le", DT, ""),
   ("Annule par", T, ""), ("Annule le", DT, "")]),
 "EVENEMENTS_COMMERCE": ("Apports du commerce à la prévision : polco, promotions, grands comptes, appels d'offres, réglementaire.", [
   ("ID evenement", T, ""), ("Type", "LISTE", "POLCO | PROMO | GRAND_COMPTE | APPEL_OFFRES | REGLEMENTAIRE"),
   ("Code produit", T, "Vide = tout le marché"), ("Marche", T, ""), ("Entite", T, ""),
   ("Territoire TC", T, "* = tous"), ("Semaine debut", T, "AAAA-Sss"), ("Semaine fin", T, "AAAA-Sss"),
   ("Impact quantite", D, ""), ("Impact pourcent", D, "Un des deux impacts"),
   ("Commentaire", T, ""), ("Saisi par", T, ""), ("Saisi le", DT, ""), ("Actif", B, "")]),
 "STOCKS_PROJETES": ("Projection hebdomadaire du stock par article et plateforme, version et scénario courants. Une ligne par mouvement.", [
   ("ID version", T, ""), ("Scenario", T, ""), ("Vue", "LISTE", "DEMANDE | REEL"), ("Semaine", T, "AAAA-Sss"), ("Plateforme", T, ""), ("Code produit", T, ""),
   ("Mouvement", "LISTE", "STOCK_DEBUT | ACHATS | BESOIN_REAPPRO | RETOURS_MAGASINS | TRANSFERT_ENTRANT | VENTES_PREV | VENTES_PERDUES | REPORT_VENTES | STOCK_FIN"),
   ("Quantite", D, "Unité de stock"), ("Origine", T, "Ex. plateforme du transfert, article du report, motif"),
   ("Alerte", "LISTE", "AUCUNE | RUPTURE | SURSTOCK | SATURATION")]),
 "FIABILITE": ("Écart entre prévu et réalisé, calculé à chaque clôture de semaine. Les mois s'obtiennent par agrégation.", [
   ("ID campagne", T, ""), ("Semaine", T, "AAAA-Sss"), ("Niveau", "LISTE", "MARCHE | PLATEFORME | GROUPE | ARTICLE | TERRITOIRE | BASSIN"),
   ("Cle niveau", T, ""), ("Version evaluee", T, ""), ("Prevu T", D, ""), ("Realise T", D, ""),
   ("Ecart T", D, ""), ("Ecart pourcent", D, ""), ("Biais pourcent", D, "Signé, positif = sur-prévision")]),
 "RUPTURES": ("Ruptures constatées ou prévues, et ce que deviennent les ventes. Permet de lire la demande et le réel en parallèle.", [
   ("ID rupture", T, ""), ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, "* = toutes"),
   ("Semaine debut", T, "AAAA-Sss"), ("Semaine fin", T, "Vide si en cours"),
   ("Origine", "LISTE", "CONSTATEE | PREVUE | PROPOSEE"), ("Cause", "LISTE", "APPRO_FOURNISSEUR | REGLEMENTAIRE | QUALITE | AUTRE"),
   ("Traitement ventes", "LISTE", "PERDUES | REPORTEES | SUBSTITUEES"),
   ("Taux report", D, "% des ventes non réalisées qui reviennent ou passent au substitut"),
   ("Semaine retour", T, "Semaine où les ventes reportées reviennent"), ("Code produit substitut", T, "Si SUBSTITUEES"),
   ("Statut", "LISTE", "ACTIVE | CLOTUREE | ANNULEE"), ("Commentaire", T, ""), ("Cree par", T, ""), ("Cree le", DT, "")]),
 "PLAN_APPRO": ("Commandes proposées, cadencées pour respecter minimums, multiples, délais et capacités. Chaque ligne dit quelles contraintes ont joué.", [
   ("ID ligne appro", T, ""), ("ID version", T, ""), ("Scenario", T, ""), ("Plateforme", T, ""), ("Code produit", T, ""),
   ("Code fournisseur", T, ""), ("Semaine besoin", T, "Semaine où le stock passerait sous le mini"),
   ("Semaine commande", T, "AAAA-Sss"), ("Semaine livraison", T, "AAAA-Sss"),
   ("Quantite besoin brut", D, "Unité de stock, avant contraintes"), ("Quantite proposee", D, "Après contraintes"),
   ("Unite stock", T, ""), ("Contraintes appliquees", T, "MIN_COMMANDE | MULTIPLE | LEAD_TIME | CAPACITE_RECEPTION | CAPACITE_STOCKAGE | PALIER_REMISE"),
   ("Ecart semaines", E, "Livraison moins besoin. Négatif = avancée"),
   ("Origine decalage", "LISTE", "AUCUN | CAPACITE | CLIENT | LOGISTIQUE | FOURNISSEUR"), ("Verrouillee", B, "OUI = date imposée, le calcul ne la déplace pas"),
   ("Statut", "LISTE", "PROPOSEE | VALIDEE | PASSEE | ANNULEE"), ("Valide par", T, ""), ("Valide le", DT, ""), ("Commentaire", T, "")]),
 "DEMANDES_DECALAGE": ("Demandes de décalage d'une commande, venant du client ou de la logistique, et leur décision.", [
   ("ID demande", T, ""), ("ID ligne appro", T, ""), ("Plateforme", T, ""), ("Code produit", T, ""),
   ("Origine", "LISTE", "CLIENT | LOGISTIQUE"), ("Demandeur", T, "Email réel"), ("Demande le", DT, ""),
   ("Semaine livraison souhaitee", T, "AAAA-Sss"), ("Date imposee", B, "OUI = ne peut pas être déplacée ensuite"), ("Motif", T, ""),
   ("Decision", "LISTE", "DEMANDEE | ACCEPTEE | REFUSEE"), ("Decide par", T, "Voir DECIDEURS_APPRO"), ("Decide le", DT, ""), ("Commentaire", T, "")]),
 "OCCUPATION_PROJETEE": ("Charge projetée face aux capacités, par semaine, plateforme et famille.", [
   ("ID version", T, ""), ("Scenario", T, ""), ("Semaine", T, "AAAA-Sss"), ("Plateforme", T, ""),
   ("Niveau", "LISTE", "PLATEFORME | ZONE | GROUPE | FAMILLE | MARCHE | ARTICLE | DANGEREUX"), ("Cle niveau", T, ""),
   ("Type capacite", "LISTE", "STOCKAGE | RECEPTION_HEBDO | EXPEDITION_HEBDO"), ("Unite", "LISTE", "T | KG | L | U"),
   ("Charge", D, "Stock projeté ou flux de la semaine"), ("Capacite", D, ""), ("Taux pourcent", D, ""),
   ("Alerte", "LISTE", "AUCUNE | SEUIL | SATURATION")]),
 "ALERTES": ("Alertes générées par l'application.", [
   ("ID alerte", T, ""), ("Date", DT, ""), ("Code alerte", T, "Voir SEUILS_ALERTES"), ("Cle", T, "Marché, article ou plateforme concerné"),
   ("Valeur", D, ""), ("Seuil", D, ""), ("Statut", "LISTE", "OUVERTE | ACQUITTEE"), ("Acquittee par", T, ""), ("Acquittee le", DT, "")]),
 "DECISIONS": ("Décisions prises en comité S&OP.", [
   ("ID decision", T, ""), ("Date reunion", DT, ""), ("Sujet", T, ""), ("Decision", T, ""),
   ("Decideurs", T, "Collectif"), ("ID version", T, ""), ("Saisi par", T, "")]),
 "JOURNAL": ("Trace de chaque modification (même principe qu'EurePrev).", [
   ("Horodatage", DT, ""), ("Auteur", T, "Email réel"), ("Action", T, ""), ("Objet", T, "Onglet et clé"),
   ("Ancienne valeur", T, ""), ("Nouvelle valeur", T, ""), ("Motif", T, ""), ("ID operation", T, "")]),
 "OPERATIONS": ("Reçus de sauvegarde pour rejouer un appel sans doublon.", [
   ("ID operation", T, ""), ("Auteur", T, ""), ("Horodatage", DT, ""), ("Lignes", E, ""), ("Resultat", T, "")]),
 "CONTRAT": ("Description versionnée des onglets PUBLICATION_*. Les autres applications se fient à elle.", [
   ("Onglet", T, ""), ("Colonne", T, ""), ("Type", T, ""), ("Description", T, ""), ("Version contrat", T, "Ex. 1.0")]),
 "PUBLICATION_MENSUELLE": ("Contrat de sortie. Prévision validée mensuelle, lue par les autres applications. Écrite uniquement à la validation.", [
   ("ID campagne", T, ""), ("Version contrat", T, ""), ("ID version", T, ""), ("Scenario", T, ""), ("Date validation", DT, ""),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""), ("Mois", T, "AAAA-MM"),
   ("Quantite demande", D, "Unité de stock, comme si l'article était disponible"), ("Quantite reelle", D, "Après ruptures déclarées. Égale à la demande sans rupture"),
   ("Unite stock", T, ""), ("Tonnes demande", D, "Quantité × poids article"), ("Tonnes reelle", D, "")]),
 "PUBLICATION_APPRO": ("Contrat de sortie. Commandes proposées ou validées, lues par l'ordonnancement et les achats.", [
   ("ID campagne", T, ""), ("Version contrat", T, ""), ("ID version", T, ""), ("Scenario", T, ""), ("Date validation", DT, ""),
   ("Plateforme", T, ""), ("Code produit", T, ""), ("Code fournisseur", T, ""),
   ("Semaine commande", T, ""), ("Semaine livraison", T, ""), ("Quantite", D, "Unité de stock"), ("Unite stock", T, ""), ("Tonnes", D, ""),
   ("Statut", "LISTE", "PROPOSEE | VALIDEE | PASSEE")]),
 "PUBLICATION_HEBDO": ("Contrat de sortie. Prévision hebdomadaire sur l'horizon du suivi de stock (HORIZON_HEBDO_SEMAINES, 78 par défaut), pour l'ordonnancement.", [
   ("ID campagne", T, ""), ("Version contrat", T, ""), ("ID version", T, ""), ("Scenario", T, ""), ("Date validation", DT, ""),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""), ("Semaine", T, "AAAA-Sss"),
   ("Quantite demande", D, ""), ("Quantite reelle", D, ""), ("Unite stock", T, ""), ("Tonnes demande", D, ""), ("Tonnes reelle", D, "")]),
}

FILES = [("PARAMETRES_SOP", PARAM), ("ENTREES", ENTREES), ("SORTIE_SOP", SORTIE)]

if __name__ == "__main__":
    import csv, os, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    for fname, tabs in FILES:
        d = root / "modeles" / fname
        d.mkdir(parents=True, exist_ok=True)
        for tab, (_, cols) in tabs.items():
            with open(d / f"{tab}.csv", "w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([c[0] for c in cols])
    out = []
    titles = {"PARAMETRES_SOP": "Fichier PARAMETRES_SOP", "ENTREES": "Fichiers d'entrée (un fichier par flux)", "SORTIE_SOP": "Fichier SORTIE_SOP (un par campagne)"}
    for fname, tabs in FILES:
        out.append(f"\n## {titles[fname]}\n")
        for tab, (desc, cols) in tabs.items():
            out.append(f"### {tab}\n{desc}\n\n| Colonne | Type | Règle ou exemple |\n|---|---|---|")
            for n, t, r in cols:
                out.append(f"| {n} | {t} | {r} |")
            out.append("")
    intro = (root / "docs" / "_intro.md").read_text(encoding="utf-8")
    (root / "docs" / "structure-des-feuilles.md").write_text(intro + "\n# Détail des onglets\n" + "\n".join(out), encoding="utf-8")
    import json
    cols = {f: {t: [c[0] for c in v[1]] for t, v in tabs.items()} for f, tabs in FILES}
    types = {f: {t: [c[1] for c in v[1]] for t, v in tabs.items()} for f, tabs in FILES}
    (root / "code").mkdir(exist_ok=True)
    (root / "code" / "Structure.gs").write_text(
        "// Généré par outils/structure.py. Ne pas modifier à la main.\n"
        "var SOP_STRUCTURE = " + json.dumps(cols, ensure_ascii=False, indent=1) + ";\n"
        "var SOP_TYPES = " + json.dumps(types, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(sum(len(t) for _, t in FILES), "onglets")
