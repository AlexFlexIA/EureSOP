// État des sources de données déclarées dans SOURCES : le fichier s'ouvre-t-il, les onglets existent-ils, combien de lignes.
// Aucune donnée n'est lue : seules les tailles des onglets le sont.

var Sources = (function () {
  var FICHIERS = {
    HISTO_PAC: 'Historique des ventes par PAC', VENTES: 'Ventes hebdomadaires', STOCKS: 'Stocks hebdomadaires', BUDGET: 'Budget',
    COMMANDES_FOURN: 'Commandes fournisseurs', PREV_TC: 'Prévisions des TC', POIDS_ARTICLE: 'Poids des articles', ORDONNANCEMENT: 'Ordonnancement'
  };

  function lien(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; }

  function verifier(id, onglets) {
    var total = 0;
    for (var i = 0; i < onglets.length; i++) {
      try {
        total += Store.apercu(id, onglets[i]).lignes;
      } catch (e) {
        return { etat: 'ERREUR', detail: e && e.message ? e.message : 'Lecture impossible.', lignes: 0 };
      }
    }
    return { etat: 'OK', detail: onglets.length + ' onglet(s) lisible(s)', lignes: total };
  }

  function etat(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var voirLiens = !!acteur.caps.configuration;
    var campagne = txt(acteur.campagne['ID campagne']);
    var res = Params.table('SOURCES').filter(function (r) { return txt(r['ID source']); }).map(function (r) {
      var nature = norm(r.Nature), id = txt(r['ID fichier']);
      var item = { id: txt(r['ID source']), nature: nature, libelle: FICHIERS[nature] || nature, entite: txt(r.Entite), pac: txt(r.PAC), campagne: txt(r['ID campagne']), alimentation: txt(r['Mode alimentation']), responsable: txt(r.Responsable), sensible: yes(r.Sensible), actif: yes(r['Actif import']), format: norm(r.Format) || 'SHEETS' };
      if (!id) { item.etat = 'A_CONNECTER'; item.detail = 'ID du fichier non renseigné.'; return item; }
      if (!item.actif) { item.etat = 'INACTIF'; item.detail = 'Actif import = NON.'; return item; }
      if (item.campagne && item.campagne !== campagne) { item.etat = 'AUTRE_CAMPAGNE'; item.detail = 'Réservée à la campagne ' + item.campagne + '.'; return item; }
      var onglet = txt(r.Onglet);
      var onglets;
      if (nature === 'HISTO_PAC') {
        onglets = txt(r.Annees).split(/[,;\s]+/).filter(Boolean).map(function (a) { return (onglet || 'Données {ANNEE}').replace('{ANNEE}', a); });
      } else {
        onglets = onglet ? [onglet] : [];
      }
      if (!onglets.length) { item.etat = 'A_CONNECTER'; item.detail = 'Onglet non renseigné.'; return item; }
      var v = verifier(id, onglets);
      item.etat = v.etat; item.detail = v.detail; item.lignes = v.lignes;
      if (voirLiens) item.lien = lien(id);
      return item;
    });
    return {
      sources: res,
      fichiers: voirLiens ? [
        { nom: 'Paramètres (PARAMETRES_SOP)', lien: lien(Params.idFichier()) },
        { nom: 'Sortie de la campagne (SORTIE_SOP)', lien: lien(Params.idSortie(acteur.campagne)) }
      ] : []
    };
  }

  return { etat: etat };
})();
