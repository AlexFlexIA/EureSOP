// Prévisions saisies par les TC, lues dans la sortie EurePrev (source de nature PREV_TC, onglet DONNEES).
//
// Colonnes reconnues (début du nom, sans accents, casse ni soulignés de tête) : « Canal de distribution » (entité),
// « Code produit », « Code technicien » (TC), « PREV AAAA en QTE » (quantité saisie, AAAA = année de prévision de la campagne,
// à défaut l'unique colonne de ce nom), « Saisie pour prévisions Coop » (OUI = ligne à saisir).
// Une cellule vide n'est pas un zéro : la ligne n'est pas encore saisie.

var PrevTC = (function () {
  function canon(v) { return txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^_+/, '').replace(/\s+/g, ' '); }
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  function codeTexte(v) { return typeof v === 'number' ? String(Math.round(v)) : txt(v); }

  // Renvoie null sans source déclarée. Sinon { parArticle: { 'ENTITE|code': { entite, code, qte, nbTC } }, couverture, colonne }.
  function lire(acteur) {
    var idCampagne = txt(acteur.campagne['ID campagne']);
    var src = Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === 'PREV_TC' && yes(r['Actif import']) && txt(r['ID fichier']) && (!txt(r['ID campagne']) || txt(r['ID campagne']) === idCampagne);
    })[0];
    if (!src) return null;
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    var cle = Cache.cle('tc', [idCampagne, txt(src['ID fichier']), txt(src.Onglet), annee].join('~'));
    var enCache = Cache.lire(cle);
    if (enCache) return enCache;
    var resultat = lireFichier(src, annee);
    Cache.ecrire(cle, resultat);
    return resultat;
  }

  function lireFichier(src, annee) {
    var d = Store.read(txt(src['ID fichier']), txt(src.Onglet) || 'DONNEES');
    var h = d.headers;
    var trouver = function (debut) { return h.filter(function (x) { return x && canon(x).indexOf(debut) === 0; })[0]; };
    var cEnt = trouver('canal de distribution'), cCode = trouver('code produit'), cTc = trouver('code technicien'), cSaisie = trouver('saisie pour previsions');
    if (!cEnt || !cCode || !cTc) throw new AppError('SOURCE_COLONNES', 'Prévisions des TC : colonnes manquantes (Canal de distribution, Code produit, Code technicien).');
    var candidates = h.filter(function (x) { return /^prev \d{4} en qte$/.test(canon(x)); });
    var cPrev = annee ? candidates.filter(function (x) { return canon(x).indexOf('prev ' + annee + ' ') === 0; })[0] : (candidates.length === 1 ? candidates[0] : null);
    if (!cPrev) throw new AppError('SOURCE_COLONNES', 'Prévisions des TC : colonne « PREV ' + (annee || 'AAAA') + ' en QTE » introuvable dans ' + (txt(src.Onglet) || 'DONNEES') + '.');
    // Catalogue des produits (facultatif) : libellé, marché (groupe de structure), famille, segment, unité de stock. Première valeur non vide par code.
    var cLib = trouver('libelle produit'), cMarche = trouver('libelle groupe structure'), cFamille = trouver('libelle famille structure');
    var cSegment = trouver('segmentation'), cUnite = trouver('libelle abrege unite');
    var catalogue = {};
    var parArticle = {}, tcSaisis = {}, tcTous = {}, saisissables = 0, renseignees = 0;
    d.rows.forEach(function (r) {
      var code = codeTexte(r[cCode]), entite = txt(r[cEnt]), tc = codeTexte(r[cTc]);
      if (!code || !entite) return;
      var cat = catalogue[code] = catalogue[code] || { libelle: '', marche: '', famille: '', segment: '', unite: '' };
      if (!cat.libelle && cLib) cat.libelle = txt(r[cLib]);
      if (!cat.marche && cMarche) cat.marche = txt(r[cMarche]);
      if (!cat.famille && cFamille) cat.famille = txt(r[cFamille]);
      if (!cat.segment && cSegment) cat.segment = txt(r[cSegment]);
      if (!cat.unite && cUnite) cat.unite = norm(r[cUnite]);
      var aSaisir = !cSaisie || norm(r[cSaisie]) === 'OUI';
      if (aSaisir) { saisissables++; tcTous[entite + '|' + tc] = true; }
      var q = nombre(r[cPrev]);
      if (isNaN(q)) return;
      if (aSaisir) { renseignees++; tcSaisis[entite + '|' + tc] = true; }
      var k = norm(entite) + '|' + code;
      var x = parArticle[k] = parArticle[k] || { entite: entite, code: code, qte: 0, nbTC: 0 };
      x.qte += q; x.nbTC++;
    });
    return {
      parArticle: parArticle, colonne: cPrev, catalogue: catalogue,
      couverture: { lignes: d.rows.length, saisissables: saisissables, renseignees: renseignees, tc: Object.keys(tcTous).length, tcAyantSaisi: Object.keys(tcSaisis).length }
    };
  }

  return { lire: lire };
})();
