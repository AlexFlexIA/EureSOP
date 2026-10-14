# Génère un classeur .xlsx par fichier (en-têtes + quelques lignes par défaut). Usage : python3 outils/xlsx.py <dossier_sortie>
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from structure import FILES, STRUCTURE_VERSION
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

DEFAUTS = {
 "MODE_EMPLOI": [("Version", "Modèle de structure v" + STRUCTURE_VERSION + " – à compléter. L'application contrôle que les onglets et colonnes correspondent à cette version."),
                 ("Règles", "Codes en texte. Mois AAAA-MM. Semaine AAAA-Sss. OUI/NON. Une cellule vide n'est pas zéro."),
                 ("Attention", "Ne pas trier, insérer ou supprimer de lignes dans les onglets écrits par l'application.")],
 "SOURCES": [("HISTO_EUREDEN","HISTO_PAC","","Données {ANNEE}","A_LA_DEMANDE","QLIK","","NON","","","NON","Coller l'ID du fichier, puis Actif import = OUI","","Coop EUREDEN","PAC1","2024,2025,2026","SHEETS"),
             ("HISTO_ONA","HISTO_PAC","","Données {ANNEE}","A_LA_DEMANDE","QLIK","","NON","","","NON","Coller l'ID du fichier, puis Actif import = OUI","","NEGOCE ONA","PAC1","2024,2025,2026","SHEETS")],
 "REGLAGES": [("DOMAINES","eureden.com","Domaine exact de connexion"),("UNITE_PIVOT","T","Tonnes"),
   ("SEUIL_ECART_N1","15","Alerte si écart vs N-1 supérieur (%)"),("COUVERTURE_MIN_MOIS","1","Risque de rupture en dessous"),
   ("COUVERTURE_MAX_MOIS","3","Surstock au-dessus"),("PRECISION_QTE","3","Décimales"),("PRECISION_TONNES","3","Décimales"),
   ("MAX_LOT","1000","Lignes modifiées par enregistrement"),("VERSION_REFERENTIEL","1","Incrémenter après modification manuelle"),
   ("PONDERATION_ANNEES","50/30/20","Poids de N-1, N-2, N-3 dans la moyenne pondérée (à valider)"),
   ("BASE_ARBITRAGE","STATISTIQUE","Quantité de départ de l'arbitrage : STATISTIQUE ou TC (saisie des TC quand elle existe)"),
   ("BUDGET_VERSION","","Version du budget à comparer. Vide = dernière version du fichier"),
   ("ALPHA_LISSAGE","0,3","Lissage exponentiel (à valider)"),
   ("PUBLICATION_HEBDO_TOUS","NON","OUI = publier tous les articles à la semaine, sinon ceux de PARAMETRES_STOCK"),
   ("HORIZON_HEBDO_SEMAINES","78","Aligné sur le suivi de stock actuel (S32 2025 à S26 2027)"),
   ("RATTACHEMENT_SEMAINE","JEUDI","Une semaine appartient au mois de son jeudi (à confirmer)")],
 "PROFILS": [("ADMIN","OUI","OUI","OUI","OUI","OUI","OUI","OUI","OUI","GLOBAL"),
   ("PREV","OUI","OUI","OUI","NON","OUI","NON","OUI","NON","GLOBAL"),
   ("RM","OUI","NON","NON","NON","NON","OUI","NON","NON","Marche"),
   ("AM","OUI","NON","NON","NON","NON","NON","NON","NON","Marche"),
   ("RT","OUI","OUI","NON","NON","NON","NON","NON","NON","Territoire"),
   ("CD","OUI","OUI","NON","NON","NON","NON","NON","NON","Territoire"),
   ("RBP","OUI","OUI","NON","NON","NON","NON","NON","NON","Bassin"),
   ("TC","OUI","OUI","NON","NON","NON","NON","NON","NON","Code TC"),
   ("SUPPLY","OUI","NON","NON","NON","NON","NON","NON","NON","GLOBAL ou périmètre explicite")],
 "ARBITRAGES": [("Qui définit les coefficients de cadençage","À décider","A_COMPLETER"),
   ("Rôles","ADMIN, PREV, RM, AM, RT, CD, RBP, TC, SUPPLY","VALIDE_UTILISATEUR"),
   ("Qui corrige la prévision des TC","Responsable de territoire, à confirmer selon le modèle","A_VALIDER"),
   ("Maille des corrections","Article","VALIDE_UTILISATEUR"),
   ("Rattachement semaine vers mois","Mois du jeudi","VALIDE_UTILISATEUR"),
   ("Poids article","Lu dans un Google Sheet, lien à fournir","A_COMPLETER"),
   ("Accès au budget","À valider avec Emmanuel","A_COMPLETER"),
   ("Traitement par défaut des ventes en rupture","Perdues, reportées ou substituées : à décider, modifiable pour chaque rupture","A_COMPLETER"),
   ("Unité des capacités","Tonnes, kg, litres ou unités selon la plateforme et la famille","VALIDE_UTILISATEUR"),
   ("Niveau des capacités","Plateforme, zone (ex. Cevezo 2 à Glomel), famille, article dangereux","VALIDE_UTILISATEUR"),
   ("Décalage d'une commande","Plusieurs décideurs selon la période PAC, demande du client ou de la logistique (DECIDEURS_APPRO). Noms à fournir","A_COMPLETER"),
   ("Dates des campagnes PAC1 à PAC4 et morte saison","À renseigner","A_COMPLETER"),
   ("Cadençage","À la semaine (semaine ISO). Les mois du comité s'obtiennent en additionnant les semaines","VALIDE_UTILISATEUR"),
   ("Date de référence des ventes","Date de livraison ou de commande à choisir","A_COMPLETER"),
   ("Priorité entre les sources de poids","Poids de réf, Poids brut, Poids unitaire","A_COMPLETER")],
 "SUBSTITUTIONS": [("SUB_001","","","","PREVISION","ARRET","","","100","","","NON","Exemple : arrêt Minarix, à renseigner"),
   ("SUB_002","","","","PREVISION","REGLEMENTAIRE","","","","","","NON","Exemple : report ventes flufénacet, à renseigner")],
 "PLATEFORMES": [("GLOMEL","Glomel","PLATEFORME","","","OUI"),("CEVEZO2","Cevezo 2 (Glomel)","ZONE","GLOMEL","","OUI"),
   ("GRUEL","Gruel","PLATEFORME","","","OUI"),("CAMPENEAC","Campénéac","PLATEFORME","","","OUI")],
 "REGLES_STOCKAGE": [("GLOMEL","CEVEZO2","DANGEREUX","OUI","OBLIGATOIRE","OUI")],
 "CAMPAGNES": [("SOP_2027_PAC2","PAC 2 2027","PAC2","2027","2026","2025","","","","12","PREPARATION","","OUI","Exemple à adapter")],
}

from xml.sax.saxutils import escape
import zipfile

def col(n):
    r = ""
    while n:
        n, m = divmod(n - 1, 26); r = chr(65 + m) + r
    return r

def sheet_xml(cols, rows):
    def c(ref, v, st=0):
        return f'<c r="{ref}" t="inlineStr"{" s=\"1\"" if st else ""}><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'
    out = ['<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
           '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
           '<cols>' + "".join(f'<col min="{i}" max="{i}" width="{max(14, min(34, len(n) + 4))}" customWidth="1"/>' for i, n in enumerate(cols, 1)) + '</cols><sheetData>']
    out.append('<row r="1">' + "".join(c(f"{col(i)}1", n, 1) for i, n in enumerate(cols, 1)) + '</row>')
    for r, row in enumerate(rows, 2):
        out.append(f'<row r="{r}">' + "".join(c(f"{col(i)}{r}", v) for i, v in enumerate(row, 1) if v != "") + '</row>')
    out.append('</sheetData></worksheet>')
    return "".join(out)

def write_xlsx(path, tabs):  # tabs: [(nom, colonnes, lignes)]
    n = len(tabs)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, n + 1)) + '</Types>')
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + "".join(f'<sheet name="{escape(t[0])}" sheetId="{i}" r:id="rId{i}"/>' for i, t in enumerate(tabs, 1)) + '</sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, n + 1)) + f'<Relationship Id="rId{n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E22F"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>')
        for i, t in enumerate(tabs, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(t[1], t[2]))

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for fname, tabs in FILES:
    if fname == "ENTREES":   # un fichier par flux
        for tab, (_, cols) in tabs.items():
            write_xlsx(out / f"ENTREE_{tab}.xlsx", [(tab, [c[0] for c in cols], [])])
        continue
    write_xlsx(out / f"{fname}.xlsx", [(tab, [c[0] for c in cols], [list(r)[:len(cols)] for r in DEFAUTS.get(tab, [])]) for tab, (_, cols) in tabs.items()])
