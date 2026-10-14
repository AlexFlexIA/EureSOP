// Budget : source de nature BUDGET (données sensibles, droit « voir le budget »).
//
// Colonnes reconnues (début du nom, sans accents ni casse) : Annee, Version budget, Mois (AAAA-MM), Code produit, Entite, Quantite, Valeur euro.
// Le budget retenu est celui de l'année de prévision de la campagne, dans la version du réglage BUDGET_VERSION
// (à défaut la dernière version du fichier). Aucune ligne n'est jamais renvoyée au navigateur : seulement des totaux par mois et par entité.

var Budget = (function () {
  function canon(v) { return txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' '); }
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    var n = t === '' ? 0 : Number(t);
    return isFinite(n) ? n : 0;
  }

  function synthese(acteur) {
    Auth.requireCap(acteur, 'consultation');
    if (!acteur.caps.voirBudget) return { disponible: false, raison: 'Votre rôle ne permet pas de voir le budget.' };
    var idCampagne = txt(acteur.campagne['ID campagne']);
    var src = Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === 'BUDGET' && yes(r['Actif import']) && txt(r['ID fichier']) && (!txt(r['ID campagne']) || txt(r['ID campagne']) === idCampagne);
    })[0];
    if (!src) return { disponible: false, raison: 'Aucune source de budget active : déclarez dans SOURCES une ligne de nature BUDGET (ID fichier, onglet) avec Actif import = OUI.' };
    if (!txt(src.Onglet)) return { disponible: false, raison: 'Source ' + txt(src['ID source']) + ' : onglet non renseigné.' };
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    if (!annee) return { disponible: false, raison: 'La campagne n\'a pas d\'année de prévision.' };
    var d = Store.read(txt(src['ID fichier']), txt(src.Onglet));
    var h = d.headers;
    var col = function (debut, obligatoire, nom) {
      var x = h.filter(function (y) { return y && canon(y).indexOf(debut) === 0; })[0];
      if (!x && obligatoire) throw new AppError('SOURCE_COLONNES', 'Budget : colonne manquante : ' + nom + '.');
      return x || null;
    };
    var cMois = col('mois', true, 'Mois'), cEnt = col('entite', true, 'Entite'), cQte = col('quantite', false), cEur = col('valeur', false);
    if (!cQte && !cEur) throw new AppError('SOURCE_COLONNES', 'Budget : colonne manquante : Quantite ou Valeur euro.');
    var cAnnee = col('annee', false), cVersion = col('version', false);
    var lignes = d.rows.filter(function (r) {
      var m = txt(r[cMois]);
      return /^\d{4}-\d{2}$/.test(m) && Number(m.slice(0, 4)) === annee && (!cAnnee || Number(r[cAnnee]) === annee || txt(r[cAnnee]) === '');
    });
    var versions = [];
    if (cVersion) lignes.forEach(function (r) { var v = txt(r[cVersion]); if (v && versions.indexOf(v) < 0) versions.push(v); });
    versions.sort();
    var voulue = txt(Params.reglages().BUDGET_VERSION);
    var version = voulue && versions.indexOf(voulue) >= 0 ? voulue : (versions.length ? versions[versions.length - 1] : '');
    var parMois = {};
    lignes.forEach(function (r) {
      if (cVersion && version && txt(r[cVersion]) !== version) return;
      var m = txt(r[cMois]), e = txt(r[cEnt]);
      if (!e) return;
      var ligne = parMois[m] = parMois[m] || { mois: m, parEntite: {} };
      var x = ligne.parEntite[e] = ligne.parEntite[e] || { q: 0, eur: 0 };
      if (cQte) x.q += nombre(r[cQte]);
      if (cEur) x.eur += nombre(r[cEur]);
    });
    return {
      disponible: true, annee: annee, version: version, versions: versions, avecQuantite: !!cQte, avecValeur: !!cEur,
      mois: Object.keys(parMois).sort().map(function (k) { return parMois[k]; })
    };
  }

  return { synthese: synthese };
})();
