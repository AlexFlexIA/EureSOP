// Référentiel des techniciens : code TC → entité, département, territoire, bassin, calendrier ; bassin → plateforme.
//
// Sources, par ordre de priorité :
//  1. l'onglet TC des paramètres (permanent, saisi ou repris d'EurePrev) ;
//  2. les colonnes « Departement », « Territoire », « Bassin » (début du nom) de l'onglet DONNEES de la sortie EurePrev
//     déclarée en source PREV_TC, quand elles existent : elles complètent les cases vides de l'onglet TC.
// Plateforme d'un TC : AFFECTATION_PLATEFORME, d'abord par bassin, sinon par territoire (même entité ou entité vide).

var Referentiel = (function () {
  var memo = null;

  function codeTexte(v) { return typeof v === 'number' ? String(Math.round(v)) : txt(v); }

  function tousLesTC(acteur) {
    var res = {};
    var ajouter = function (code, o, prioritaire) {
      if (!code) return;
      var x = res[code] = res[code] || { code: code, entite: '', calendrier: '', departement: '', territoire: '', bassin: '' };
      Object.keys(o).forEach(function (k) { if (o[k] && (prioritaire || !x[k])) x[k] = o[k]; });
    };
    try {
      Params.table('TC').forEach(function (r) {
        if (txt(r.Actif) !== '' && !yes(r.Actif)) return;
        ajouter(codeTexte(r['Code technicien']), {
          entite: txt(r.Entite), calendrier: txt(r.Calendrier), departement: norm(r['Departement TC']), territoire: norm(r['Territoire TC']), bassin: norm(r['Bassin TC'])
        }, true);
      });
    } catch (e) { if (!(e && e.code)) throw e; }
    try {
      var t = PrevTC.lire(acteur);
      if (t && t.tcInfos) Object.keys(t.tcInfos).forEach(function (code) {
        var i = t.tcInfos[code];
        ajouter(code, { entite: i.entite, calendrier: i.calendrier, departement: norm(i.departement), territoire: norm(i.territoire), bassin: norm(i.bassin) }, false);
      });
    } catch (e) { if (!(e && e.code)) throw e; }
    return res;
  }

  function plateformes() {
    var liste = [];
    try {
      liste = Params.table('AFFECTATION_PLATEFORME').filter(function (r) { return txt(r.Plateforme) !== ''; });
    } catch (e) { if (!(e && e.code)) throw e; }
    return liste;
  }

  function plateformeDe(liste, tc) {
    var egal = function (a, b) { return !txt(a) || norm(a) === '*' || norm(a) === norm(b); };
    var ok = function (r) { return egal(r.Entite, tc.entite); };
    var parBassin = liste.filter(function (r) { return ok(r) && txt(r['Bassin TC']) && norm(r['Bassin TC']) === tc.bassin; })[0];
    if (parBassin) return norm(parBassin.Plateforme);
    var parTerr = liste.filter(function (r) { return ok(r) && !txt(r['Bassin TC']) && txt(r['Territoire TC']) && norm(r['Territoire TC']) === tc.territoire; })[0];
    return parTerr ? norm(parTerr.Plateforme) : '';
  }

  // { code: { code, entite, calendrier, departement, territoire, bassin, plateforme } } ; mémorisé pour l'exécution.
  function charger(acteur) {
    if (memo && memo.camp === txt(acteur.campagne['ID campagne'])) return memo.tc;
    var tc = tousLesTC(acteur), liste = plateformes();
    Object.keys(tc).forEach(function (c) { tc[c].plateforme = plateformeDe(liste, tc[c]); });
    memo = { camp: txt(acteur.campagne['ID campagne']), tc: tc };
    return tc;
  }

  function reset() { memo = null; }

  return { charger: charger, reset: reset };
})();
