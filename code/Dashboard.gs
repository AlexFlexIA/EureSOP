// Tableau de bord : totaux, alertes calculées, échéances des campagnes.
// Tout vient des feuilles ; une source absente donne une alerte d'information, jamais un chiffre inventé.

var Dashboard = (function () {
  var ORDRE_TYPES = { PAC1: 1, PAC2: 2, PAC3: 3, PAC4: 4, MORTE_SAISON: 5 };
  var SOURCES_ATTENDUES = [
    ['PREV_TC', 'Prévisions des TC'],
    ['BUDGET', 'Budget'],
    ['STOCKS', 'Stocks hebdomadaires'],
    ['COMMANDES_FOURN', 'Commandes fournisseurs'],
    ['POIDS_ARTICLE', 'Poids des articles']
  ];

  function dateTxt(v) {
    if (v && typeof v.getFullYear === 'function') {
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    return txt(v);
  }
  function pad2(n) { return ('0' + n).slice(-2); }

  function seuilEcart() {
    var n = Number(txt(Params.reglages().SEUIL_ECART_N1).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : 15;
  }

  function echeances(acteur) {
    return Params.table('CAMPAGNES').filter(function (c) { return txt(c['ID campagne']); }).map(function (c) {
      return {
        id: txt(c['ID campagne']), libelle: txt(c.Libelle) || txt(c['ID campagne']), type: norm(c.Type), statut: norm(c.Statut),
        debut: dateTxt(c.Debut), fin: dateTxt(c.Fin), courante: txt(c['ID campagne']) === txt(acteur.campagne['ID campagne'])
      };
    }).sort(function (a, b) {
      return (ORDRE_TYPES[a.type] || 9) - (ORDRE_TYPES[b.type] || 9) || (a.id < b.id ? -1 : 1);
    });
  }

  function alertes(acteur, d) {
    var res = [];
    var seuil = seuilEcart();
    if (!d.version) {
      res.push({ niveau: 'ATTENTION', titre: 'Aucune prévision', detail: 'Calculez la prévision statistique (écran Prévision & arbitrage).' });
    } else {
      // Saisies ou annulations enregistrées dans le journal après la création de la version courante.
      var enAttente;
      if (d.version.type === 'STATISTIQUE') {
        var saisies = Ajustements.lister(acteur);
        enAttente = saisies.corrections.length + saisies.evenements.length + saisies.substitutions.length + saisies.historique.length;
      } else {
        var journal = Store.read(Versions.contexte(acteur).idSortie, 'JOURNAL').rows;
        var creation = 0;
        journal.forEach(function (j) { if (txt(j.Action) === 'VERSION_CREEE' && txt(j.Objet) === d.version.id) creation = j._row; });
        enAttente = journal.filter(function (j) {
          return j._row > creation && (txt(j.Action) === 'AJUSTEMENT_CREE' || txt(j.Action) === 'AJUSTEMENT_ANNULE');
        }).length;
      }
      if (enAttente) {
        res.push({ niveau: 'ATTENTION', titre: 'Saisies non appliquées', detail: enAttente + ' correction(s), événement(s) ou substitution(s) ne sont pas dans la version courante ' + d.version.id + '. Enregistrez la reprévision pour les appliquer.' });
      }
      var ecarts = d.articles.filter(function (a) { return a.n1 > 0 && Math.abs(a.retenue / a.n1 - 1) * 100 > seuil; })
        .sort(function (a, b) { return Math.abs(b.retenue - b.n1) - Math.abs(a.retenue - a.n1); });
      ecarts.slice(0, 5).forEach(function (a) {
        var p = Math.round((a.retenue / a.n1 - 1) * 100);
        res.push({ niveau: 'ATTENTION', titre: 'Écart vs ' + (d.anneeReference || 'N-1') + ' > ' + seuil + ' %', detail: (a.libelle || a.code) + ' (' + a.entite + ') : ' + (p > 0 ? '+' : '') + p + ' % (quantité retenue).' });
      });
      if (ecarts.length > 5) res.push({ niveau: 'INFO', titre: 'Autres écarts', detail: (ecarts.length - 5) + ' autre(s) article(s) dépassent aussi le seuil de ' + seuil + ' %.' });
      var arretes = d.articles.filter(function (a) { return a.n1 === 0 && a.statistique === 0 && !a.substitution && !a.evenements && !a.correction; }).length;
      if (arretes) res.push({ niveau: 'INFO', titre: 'Articles non reconduits', detail: arretes + ' article(s) vendus avant ' + (d.anneeReference || 'N-1') + ' mais pas depuis ne sont pas reconduits (prévision à zéro).' });
    }
    var declarees = {};
    Params.table('SOURCES').forEach(function (r) { if (yes(r['Actif import']) && txt(r['ID fichier'])) declarees[norm(r.Nature)] = true; });
    SOURCES_ATTENDUES.forEach(function (s) {
      if (!declarees[s[0]]) res.push({ niveau: 'INFO', titre: 'Source non connectée', detail: s[1] + ' : à déclarer dans SOURCES (nature ' + s[0] + ').' });
    });
    return res;
  }

  function synthese(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var d = Previsions.chargerCourante(acteur);
    return {
      campagne: { id: txt(acteur.campagne['ID campagne']), libelle: txt(acteur.campagne.Libelle), type: norm(acteur.campagne.Type), statut: norm(acteur.campagne.Statut), anneePrevision: Number(acteur.campagne['Annee prevision']) || 0 },
      version: d.version,
      anneeReference: d.anneeReference,
      totaux: d.totaux,
      alertes: alertes(acteur, d),
      echeances: echeances(acteur),
      seuilEcart: seuilEcart()
    };
  }

  return { synthese: synthese, alertes: alertes, echeances: echeances, seuil: seuilEcart };
})();
