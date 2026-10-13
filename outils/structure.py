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
   ("Cle", T, "DOMAINES, UNITE_PIVOT, SEUIL_ECART_N1, COUVERTURE_MIN_MOIS, COUVERTURE_MAX_MOIS, PRECISION_QTE, PRECISION_TONNES, MAX_LOT, VERSION_REFERENTIEL, RATTACHEMENT_SEMAINE"),
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
   ("Niv1", T, ""), ("Niv2", T, ""), ("Niv3", T, ""), ("Famille", T, ""), ("Groupe", T, ""),
   ("Marche", T, ""), ("Segment", T, "PERF, REF, ACC, FLA conservés tels quels"),
   ("Unite stock", T, "U, KG, L, SAC..."), ("Poids article", D, "Poids ou volume d'une unité de stock, en kg ou L"),
   ("Unite poids", "LISTE", "KG | L"), ("Densite", D, "Pour convertir L en kg ; vide si KG"),
   ("Dose ha", D, "Reprise EurePrev"), ("Coefficient", D, "Reprise EurePrev"), ("Mode conversion", "LISTE", "DOSE_MULTIPLICATEUR | DOSE_DIVISEUR | SANS_SURFACE"),
   ("Date fin de vie", DT, "Vide si actif"), ("Actif", B, ""), ("Commentaire", T, "")]),
 "GAMME": ("Gamme par campagne, validée par les responsables de marché.", [
   ("ID campagne", T, ""), ("Code produit", T, ""), ("Entite", T, ""),
   ("Dans la gamme", B, ""), ("Vendable hors gamme", B, ""),
   ("Validation", "LISTE", "A_VALIDER | VALIDE"), ("Valide par", T, ""), ("Valide le", DT, "")]),
 "SUBSTITUTIONS": ("Qui remplace qui, renseigné par les responsables de marché.", [
   ("ID substitution", T, ""), ("Code ancien", T, ""), ("Code nouveau", T, ""), ("Entite", T, ""),
   ("Date effet", DT, ""), ("Taux de report", D, "% de l'historique de l'ancien repris sur le nouveau, 100 par défaut"),
   ("Renseigne par", T, ""), ("Valide par", T, ""), ("Actif", B, ""), ("Commentaire", T, "")]),
 "PLATEFORMES": ("Lieux de stockage. Un dépôt peut dépendre d'une plateforme (GLOMEL vers dépôts).", [
   ("Plateforme", T, "Code, ex. GLOMEL"), ("Libelle", T, ""),
   ("Type", "LISTE", "PLATEFORME | DEPOT | DEPOT_DEBORD"), ("Plateforme parente", T, "Alimente ce dépôt"),
   ("Entite", T, ""), ("Capacite T", D, "Saturation"), ("Stock mini T", D, ""), ("Stock maxi T", D, ""), ("Actif", B, "")]),
 "AFFECTATION_PLATEFORME": ("Quelle plateforme sert quel bassin. Reprise de l'onglet PLATEFORMES d'EurePrev.", [
   ("Entite", T, ""), ("Territoire TC", T, ""), ("Bassin TC", T, ""), ("Plateforme", T, ""),
   ("Validation", "LISTE", "A_VALIDER | VALIDE"), ("Source", T, "")]),
 "CALENDRIER": ("Semaines, mois et campagnes. Évite les calculs de dates dans l'application.", [
   ("Semaine", T, "AAAA-Sss (ISO)"), ("Date debut", DT, "Lundi"), ("Date fin", DT, "Dimanche"),
   ("Mois rattache", T, "AAAA-MM, règle REGLAGES / RATTACHEMENT_SEMAINE"), ("Annee", E, ""),
   ("Type campagne", T, "PAC1 à PAC4 ou MORTE_SAISON")]),
 "COEFFICIENTS": ("Cadençage : répartition d'un besoin annuel en mois, puis en semaines du mois.", [
   ("ID campagne", T, ""), ("Niveau", "LISTE", "MARCHE | FAMILLE | ARTICLE | PLATEFORME"),
   ("Cle niveau", T, "Valeur du niveau, ex. marché ENGRAIS"), ("Plateforme", T, "* = toutes"),
   ("Granularite", "LISTE", "MOIS | SEMAINE_DU_MOIS"), ("Periode", E, "1 à 12, ou 1 à 5"),
   ("Coefficient", D, "En %. Somme = 100 par ensemble"), ("Origine", "LISTE", "HISTORIQUE | MANUEL"),
   ("Version coefficients", E, "Incrémentée à chaque modification"), ("Validation", "LISTE", "A_VALIDER | VALIDE"),
   ("Valide par", T, "")]),
 "CONTRAINTES_APPRO": ("Fournisseurs, délais et conditions d'achat.", [
   ("Code fournisseur", T, ""), ("Libelle fournisseur", T, ""), ("Marche", T, ""), ("Code produit", T, "Vide = tout le marché"),
   ("Plateforme", T, "* = toutes"), ("Lead time semaines", E, ""), ("Mini commande T", D, ""),
   ("Multiple commande T", D, "Ex. camion complet"), ("Palier remise T", D, ""),
   ("Debut validite", DT, ""), ("Fin validite", DT, ""), ("Commentaire", T, "")]),
 "SEUILS_ALERTES": ("Alertes automatiques.", [
   ("Code alerte", "LISTE", "ECART_N1 | RUPTURE_PREVUE | SURSTOCK_PREVU | ECART_PREVISION | COUVERTURE_BASSE"),
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
 "VENTES_MENSUELLES": ("Ventes réalisées. Un fichier par année civile (volume). Déposé depuis BO.", [
   ("Mois", T, "AAAA-MM"), ("Code produit", T, ""), ("Entite", T, ""), ("Code technicien", T, ""),
   ("Bassin TC", T, ""), ("Plateforme", T, "Si connue"), ("Quantite", D, "Unité de stock"),
   ("Valeur euro", D, "Vide si inconnue"), ("Source", T, "")]),
 "STOCKS_HEBDO": ("Stock par plateforme, extraction hebdomadaire.", [
   ("Date stock", DT, "Lundi"), ("Plateforme", T, ""), ("Code produit", T, ""), ("Entite", T, ""),
   ("Stock", D, "Unité de stock"), ("Source", T, "")]),
 "COMMANDES_FOURN": ("Commandes fournisseurs en cours.", [
   ("N commande", T, ""), ("Code fournisseur", T, ""), ("Code produit", T, ""), ("Plateforme", T, ""),
   ("Date commande", DT, ""), ("Date livraison prevue", DT, ""), ("Quantite", D, "Unité de stock"),
   ("Statut", "LISTE", "EN_COURS | LIVREE | ANNULEE")]),
 "BUDGET": ("Budget par article et mois. Données sensibles, accès restreint.", [
   ("Annee", E, ""), ("Version budget", T, ""), ("Mois", T, "AAAA-MM"), ("Code produit", T, ""),
   ("Entite", T, ""), ("Quantite", D, "Unité de stock"), ("Valeur euro", D, "")]),
}

SORTIE = {
 "MODE_EMPLOI": ("Aide courte.", [("Sujet", T, ""), ("Instruction", T, "")]),
 "VERSIONS": ("Catalogue des versions de la campagne. Une version = un jeu complet de prévisions.", [
   ("ID version", T, "Ex. V004"), ("ID campagne", T, ""), ("Numero", E, ""),
   ("Type", "LISTE", "PREV_TC | STATISTIQUE | ARBITREE | VALIDEE"),
   ("Libelle", T, ""), ("Statut", "LISTE", "BROUILLON | COURANTE | ARCHIVEE"),
   ("Date reunion S&OP", DT, ""), ("Version coefficients", E, "Cadençage utilisé"),
   ("Cree par", T, ""), ("Cree le", DT, ""), ("Verrouillee", B, "OUI après validation"), ("Commentaire", T, "")]),
 "PREVISION": ("Version courante. Une ligne par article, entité, plateforme et mois.", [
   ("ID ligne", T, "campagne|entite|produit|plateforme|mois, composants encodés"),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""), ("Mois", T, "AAAA-MM"),
   ("Qte historique corrigee N-1", D, "Unité de stock"), ("Qte statistique", D, ""),
   ("Qte TC", D, ""), ("Qte evenements", D, "Polco, promo, réglementaire"),
   ("Qte correction", D, ""), ("Qte arbitree", D, ""), ("Qte validee", D, ""),
   ("Unite stock", T, ""), ("Poids article", D, "Copié du référentiel"),
   ("Statut", "LISTE", "PREV_TC | ARBITREE | VALIDEE"), ("Version", T, "ID version courante"),
   ("Modifie par", T, ""), ("Modifie le", DT, "")]),
 "INSTANTANES": ("Photo de la quantité retenue à chaque figement de version. Permet de comparer les reprévisions.", [
   ("ID version", T, ""), ("ID ligne", T, ""), ("Qte retenue", D, "Arbitrée ou validée selon le type de version")]),
 "CORRECTIONS_HISTO": ("Corrections de l'historique. Le brut n'est jamais écrasé.", [
   ("ID correction", T, ""), ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, "* = toutes"),
   ("Mois debut", T, "AAAA-MM"), ("Mois fin", T, "AAAA-MM"),
   ("Type", "LISTE", "RUPTURE | ANOMALIE | EVENEMENT | SUBSTITUTION | APPRO_FOURNISSEUR"),
   ("Qte brute", D, ""), ("Qte corrigee", D, ""), ("Motif", T, ""), ("Commentaire", T, ""),
   ("Statut", "LISTE", "ACTIVE | ANNULEE"), ("Cree par", T, ""), ("Cree le", DT, ""),
   ("Annule par", T, ""), ("Annule le", DT, "")]),
 "EVENEMENTS_COMMERCE": ("Apports du commerce à la prévision : polco, promotions, grands comptes, appels d'offres, réglementaire.", [
   ("ID evenement", T, ""), ("Type", "LISTE", "POLCO | PROMO | GRAND_COMPTE | APPEL_OFFRES | REGLEMENTAIRE"),
   ("Code produit", T, "Vide = tout le marché"), ("Marche", T, ""), ("Entite", T, ""),
   ("Territoire TC", T, "* = tous"), ("Mois debut", T, ""), ("Mois fin", T, ""),
   ("Impact quantite", D, ""), ("Impact pourcent", D, "Un des deux impacts"),
   ("Commentaire", T, ""), ("Saisi par", T, ""), ("Saisi le", DT, ""), ("Actif", B, "")]),
 "STOCKS_PROJETES": ("Projection hebdomadaire par plateforme et marché pour la version courante.", [
   ("ID version", T, ""), ("Semaine", T, "AAAA-Sss"), ("Plateforme", T, ""), ("Marche", T, ""),
   ("Stock debut T", D, ""), ("Sorties prevues T", D, ""), ("Entrees fournisseurs T", D, ""),
   ("Stock fin T", D, ""), ("Couverture mois", D, ""),
   ("Alerte", "LISTE", "AUCUNE | RUPTURE | SURSTOCK | SATURATION")]),
 "FIABILITE": ("Écart entre prévu et réalisé, calculé à chaque clôture de mois.", [
   ("ID campagne", T, ""), ("Mois", T, ""), ("Niveau", "LISTE", "MARCHE | PLATEFORME | GROUPE | ARTICLE | TERRITOIRE | BASSIN"),
   ("Cle niveau", T, ""), ("Version evaluee", T, ""), ("Prevu T", D, ""), ("Realise T", D, ""),
   ("Ecart T", D, ""), ("Ecart pourcent", D, ""), ("Biais pourcent", D, "Signé, positif = sur-prévision")]),
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
   ("ID campagne", T, ""), ("Version contrat", T, ""), ("ID version", T, ""), ("Date validation", DT, ""),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""), ("Mois", T, "AAAA-MM"),
   ("Quantite", D, "Unité de stock"), ("Unite stock", T, ""), ("Tonnes", D, "Quantité × poids article")]),
 "PUBLICATION_HEBDO": ("Contrat de sortie. Prévision hebdomadaire sur l'horizon court (par défaut 13 semaines), pour l'ordonnancement.", [
   ("ID campagne", T, ""), ("Version contrat", T, ""), ("ID version", T, ""), ("Date validation", DT, ""),
   ("Code produit", T, ""), ("Entite", T, ""), ("Plateforme", T, ""), ("Semaine", T, "AAAA-Sss"),
   ("Quantite", D, ""), ("Unite stock", T, ""), ("Tonnes", D, "")]),
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
    print(sum(len(t) for _, t in FILES), "onglets")
