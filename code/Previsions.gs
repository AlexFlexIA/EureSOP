// Prévision statistique : moyenne pondérée des années d'historique du PAC, par article et par entité.
//
// Une version STATISTIQUE est créée, PREVISION reçoit une ligne par article et entité (plateforme « * » tant que
// l'affectation des plateformes n'est pas branchée) et INSTANTANES garde la photo de la version.
// Règles de calcul :
//  - la pondération vient du réglage PONDERATION_ANNEES (ex. 50/30/20 : dernière année, avant-dernière, avant-avant) ;
//  - un article est calculé à partir de sa première année de vente ; une année sans vente entre les deux compte 0 ;
//  - un article sans vente la dernière année n'est pas reconduit (0) : c'est aux substitutions de le reprendre.

var Previsions = (function () {
  var PLATEFORME_NON_AFFECTEE = '*';
  var PONDERATION_DEFAUT = '50/30/20';

  function ponderations() {
    var brut = txt(Params.reglages().PONDERATION_ANNEES) || PONDERATION_DEFAUT;
    var poids = brut.split(/[\/;\s]+/).filter(Boolean).map(Number);
    if (!poids.length || poids.some(function (p) { return !isFinite(p) || p < 0; }) || poids.every(function (p) { return p === 0; })) {
      throw new AppError('PONDERATION_INVALIDE', 'Le réglage PONDERATION_ANNEES vaut « ' + brut.slice(0, 40) + ' ». Attendu : des nombres séparés par « / », par exemple 50/30/20.');
    }
    return poids;
  }

  function precision() {
    var brut = txt(Params.reglages().PRECISION_QTE);
    var n = Number(brut.replace(',', '.'));
    return brut !== '' && isFinite(n) && n >= 0 && n <= 6 ? Math.floor(n) : 3;
  }

  function arrondi(v, decimales) {
    var f = Math.pow(10, decimales);
    return Math.round(v * f) / f;
  }

  // Statistique d'un article. annees : années d'historique croissantes. poids[0] = dernière année.
  function statistique(parAnnee, annees, poids) {
    var n = annees.length;
    var derniere = parAnnee[annees[n - 1]];
    if (!derniere || !(derniere.qte > 0)) return 0;
    var premier = n;
    for (var i = 0; i < n; i++) if (parAnnee[annees[i]]) { premier = i; break; }
    var somme = 0, total = 0;
    for (var k = 0; k < poids.length && n - 1 - k >= premier; k++) {
      var p = parAnnee[annees[n - 1 - k]];
      somme += poids[k] * (p ? p.qte : 0);
      total += poids[k];
    }
    return total > 0 ? somme / total : derniere.qte;
  }

  function idLigne(idCampagne, entite, code) {
    return JSON.stringify([idCampagne, entite, code, PLATEFORME_NON_AFFECTEE]);
  }

  function calculer(acteur, entree, idOperation) {
    Auth.requireCap(acteur, SOP.TYPE_CAP.STATISTIQUE);
    if (!Auth.inScope(acteur, SOP.TYPE_CAP.STATISTIQUE, {})) {
      throw new AppError('CAPACITE_REFUSEE', 'Le calcul porte sur tous les articles : il demande un périmètre global.');
    }
    Auth.requireWritable(acteur);
    var ctx = Versions.contexte(acteur);
    var poids = ponderations();
    var dec = precision();
    var histo = Histo.agreger(acteur, true);
    if (histo.annees.length < 1) throw new AppError('HISTO_VIDE', 'Aucune année d\'historique à exploiter.');

    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var courante = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
        if (courante && yes(courante.Verrouillee)) {
          throw new AppError('VERSION_VERROUILLEE', 'La version courante ' + txt(courante['ID version']) + ' est verrouillée : elle ne peut pas être remplacée.');
        }
        var travaillee = Store.read(ctx.idSortie, 'PREVISION').rows.some(function (r) {
          return ['Qte TC', 'Qte evenements', 'Qte correction', 'Qte arbitree', 'Qte validee'].some(function (c) { return txt(r[c]) !== ''; });
        });
        if (travaillee) {
          throw new AppError('PREVISION_TRAVAILLEE', 'La prévision courante contient déjà des quantités de TC, d\'événements, de correction ou d\'arbitrage. Le recalcul statistique les effacerait : créez d\'abord une nouvelle campagne ou une nouvelle version dédiée.');
        }

        var annees = histo.annees;
        var derniere = annees[annees.length - 1];
        var libelle = txt(entree && entree.libelle) || ('Statistique ' + poids.join('/') + ' sur ' + annees.join(', '));
        var version = Versions.creerInterne(acteur, ctx, { type: 'STATISTIQUE', scenario: 'BASE', libelle: libelle, dateReunion: entree && entree.dateReunion, commentaire: entree && entree.commentaire }, idOperation);

        var maintenantTxt = maintenant();
        var lignes = [], photos = [];
        var totaux = {};
        histo.articles.forEach(function (a) {
          var n1 = a.parAnnee[derniere] ? a.parAnnee[derniere].qte : 0;
          var stat = arrondi(statistique(a.parAnnee, annees, poids), dec);
          var id = idLigne(ctx.idCampagne, a.entite, a.code);
          lignes.push({
            'ID ligne': id, 'Code produit': a.code, 'Entite': a.entite, 'Plateforme': PLATEFORME_NON_AFFECTEE,
            'Qte historique corrigee N-1': arrondi(n1, dec), 'Qte statistique': stat,
            'Statut': 'STATISTIQUE', 'Version': version.idVersion,
            'Modifie par': acteur.email, 'Modifie le': maintenantTxt
          });
          photos.push({ 'ID version': version.idVersion, 'ID ligne': id, 'Qte retenue': stat });
          var t = totaux[a.entite] = totaux[a.entite] || { entite: a.entite, n1: 0, statistique: 0, articles: 0 };
          t.n1 += n1; t.statistique += stat; t.articles++;
        });
        Store.viderDonnees(ctx.idSortie, 'PREVISION');
        Store.append(ctx.idSortie, 'PREVISION', lignes);
        Store.append(ctx.idSortie, 'INSTANTANES', photos);
        Journal.log(ctx.idSortie, acteur, 'PREVISION_STATISTIQUE', version.idVersion, '', lignes.length + ' ligne(s)', 'Pondération ' + poids.join('/') + ' sur ' + annees.join(','), idOperation);
        return {
          idVersion: version.idVersion, lignes: lignes.length, ponderation: poids, annees: annees,
          totaux: Object.keys(totaux).map(function (k) { return totaux[k]; })
        };
      });
    });
  }

  // Prévision courante lue dans PREVISION, avec les libellés de l'historique. Visible selon le périmètre (global ou entité).
  function courante(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = Versions.contexte(acteur);
    var version = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
    var rows = Store.read(ctx.idSortie, 'PREVISION').rows;
    if (!version || !rows.length) return { version: null, ponderation: ponderations(), articles: [], totaux: [] };
    var autorise = Histo.filtre(acteur);
    var visibles = rows.filter(function (r) { return autorise(txt(r.Entite), ''); });
    var libelles = {};
    try {
      Histo.agreger(acteur, false).articles.forEach(function (a) { libelles[a.entite + '|' + a.code] = a.libelle; });
    } catch (e) {
      // Sans historique lisible, les codes s'affichent seuls.
    }
    var totaux = {};
    var articles = visibles.map(function (r) {
      var entite = txt(r.Entite);
      var n1 = Number(r['Qte historique corrigee N-1']) || 0, stat = Number(r['Qte statistique']) || 0;
      var t = totaux[entite] = totaux[entite] || { entite: entite, n1: 0, statistique: 0, articles: 0 };
      t.n1 += n1; t.statistique += stat; t.articles++;
      return { code: txt(r['Code produit']), libelle: libelles[entite + '|' + txt(r['Code produit'])] || '', entite: entite, n1: n1, statistique: stat };
    }).sort(function (a, b) { return b.statistique - a.statistique || (a.code < b.code ? -1 : 1); });
    return {
      version: { id: txt(version['ID version']), libelle: txt(version.Libelle), creePar: txt(version['Cree par']), creeLe: txt(version['Cree le']), verrouillee: yes(version.Verrouillee), type: norm(version.Type) },
      ponderation: ponderations(),
      totaux: Object.keys(totaux).map(function (k) { return totaux[k]; }),
      nbArticles: articles.length,
      articles: articles.slice(0, 400),
      tronque: articles.length > 400
    };
  }

  return { calculer: calculer, courante: courante, statistique: statistique, ponderations: ponderations };
})();
