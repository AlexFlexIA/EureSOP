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

  // Pondérations candidates selon le nombre d'années disponibles avant l'année testée.
  function candidates(k) {
    if (k <= 1) return [[100]];
    if (k === 2) return [[100, 0], [70, 30], [60, 40], [50, 50]];
    return [[100, 0, 0], [60, 30, 10], [50, 30, 20], [40, 30, 30], [34, 33, 33]];
  }

  // Aide au choix de la pondération : on prédit la dernière année avec les années d'avant seulement,
  // puis on compare au réel. Erreur = somme des écarts absolus par article et entité / ventes réelles.
  // Biais = prévision totale / ventes réelles - 1 (positif : on surestime).
  function essai(acteur) {
    Auth.requireCap(acteur, 'consultation');
    if (!Auth.inScope(acteur, 'consultation', {})) {
      throw new AppError('CAPACITE_REFUSEE', 'Le test porte sur tous les articles : il demande un périmètre global.');
    }
    var histo = Histo.agreger(acteur, true);
    var annees = histo.annees;
    if (annees.length < 2) throw new AppError('ESSAI_IMPOSSIBLE', 'Il faut au moins deux années d\'historique pour tester une pondération.');
    var cible = annees[annees.length - 1];
    var avant = annees.slice(0, annees.length - 1);
    var actuelle = ponderations().slice(0, Math.min(3, avant.length));
    var liste = candidates(Math.min(3, avant.length)).map(function (p) { return { ponderation: p, actuelle: false }; });
    // Même pondération si les parts sont identiques une fois ramenées à 100 (50 seul équivaut à 100 seul).
    var parts = function (p) { var t = p.reduce(function (a, b) { return a + b; }, 0); return p.map(function (x) { return Math.round(x / t * 100); }).join('/'); };
    var deja = liste.some(function (c) { return parts(c.ponderation) === parts(actuelle); });
    if (deja) liste.forEach(function (c) { c.actuelle = parts(c.ponderation) === parts(actuelle); });
    else liste.push({ ponderation: actuelle, actuelle: true });
    var totalReel = 0;
    var articles = histo.articles.map(function (a) {
      var reel = a.parAnnee[cible] ? a.parAnnee[cible].qte : 0;
      totalReel += reel;
      var base = {};
      avant.forEach(function (y) { if (a.parAnnee[y]) base[y] = a.parAnnee[y]; });
      return { reel: reel, base: base };
    });
    var resultats = liste.map(function (c) {
      var ecart = 0, prevu = 0;
      articles.forEach(function (a) {
        var p = statistique(a.base, avant, c.ponderation);
        ecart += Math.abs(p - a.reel);
        prevu += p;
      });
      return {
        ponderation: c.ponderation, actuelle: c.actuelle,
        erreur: totalReel > 0 ? ecart / totalReel : 0,
        biais: totalReel > 0 ? prevu / totalReel - 1 : 0
      };
    });
    var meilleur = 0;
    resultats.forEach(function (r, i) { if (r.erreur < resultats[meilleur].erreur) meilleur = i; });
    return { anneeTestee: cible, anneesBase: avant, nbArticles: articles.length, meilleur: meilleur, resultats: resultats };
  }

  // Fiabilité réelle : prévision de la campagne (validée, sinon arbitrée, sinon statistique) comparée aux ventes réelles de
  // l'année prévue, dès que l'historique la contient. Erreur = somme des écarts absolus / ventes ; biais = prévu / réel - 1.
  function fiabiliteReelle(acteur) {
    Auth.requireCap(acteur, 'consultation');
    if (!Auth.inScope(acteur, 'consultation', {})) return { disponible: false, raison: 'La mesure porte sur tous les articles : elle demande un périmètre global.' };
    var annee = Number(acteur.campagne['Annee prevision']) ? String(Number(acteur.campagne['Annee prevision'])) : '';
    if (!annee) return { disponible: false, raison: 'La campagne n\'a pas d\'année de prévision (colonne Annee prevision de CAMPAGNES).' };
    var ctx = Versions.contexte(acteur);
    var version = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
    var rows = Store.read(ctx.idSortie, 'PREVISION').rows;
    if (!version || !rows.length) return { disponible: false, raison: 'Aucune prévision à comparer.' };
    var h = Histo.agreger(acteur, true, true);
    if (h.annees.indexOf(annee) < 0) return { disponible: false, raison: 'L\'historique ne contient pas encore ' + annee + ' : la fiabilité réelle se mesure quand les ventes de la campagne sont arrivées (nouvel onglet « Données ' + annee + ' »).' };
    var num = function (v) { var n = Number(v); return isFinite(n) && txt(v) !== '' ? n : 0; };
    var cles = {};
    rows.forEach(function (r) {
      var prevu = txt(r['Qte validee']) !== '' ? num(r['Qte validee']) : (txt(r['Qte arbitree']) !== '' ? num(r['Qte arbitree']) : num(r['Qte statistique']));
      cles[norm(r.Entite) + '|' + txt(r['Code produit'])] = { entite: txt(r.Entite), prevu: prevu, reel: 0 };
    });
    h.articles.forEach(function (a) {
      var k = norm(a.entite) + '|' + a.code;
      var reel = a.parAnnee[annee] ? a.parAnnee[annee].qte : 0;
      if (!cles[k]) cles[k] = { entite: a.entite, prevu: 0, reel: 0 };
      cles[k].reel = reel;
    });
    var parEntite = {};
    var cumul = function (o, x) { o.ecart += Math.abs(x.prevu - x.reel); o.prevu += x.prevu; o.reel += x.reel; o.nb++; };
    var global = { ecart: 0, prevu: 0, reel: 0, nb: 0 };
    Object.keys(cles).forEach(function (k) {
      var x = cles[k];
      cumul(global, x);
      cumul(parEntite[x.entite] = parEntite[x.entite] || { entite: x.entite, ecart: 0, prevu: 0, reel: 0, nb: 0 }, x);
    });
    var fin = function (o) { return { entite: o.entite, nb: o.nb, prevu: o.prevu, reel: o.reel, erreur: o.reel > 0 ? o.ecart / o.reel : 0, biais: o.reel > 0 ? o.prevu / o.reel - 1 : 0 }; };
    return {
      disponible: true, annee: annee, version: { id: txt(version['ID version']), type: norm(version.Type) },
      global: fin(global), parEntite: Object.keys(parEntite).map(function (k) { return fin(parEntite[k]); })
    };
  }

  function idLigne(idCampagne, entite, code) {
    return JSON.stringify([idCampagne, entite, code, PLATEFORME_NON_AFFECTEE]);
  }

  // Écrit la version (verrou et reçu d'opération déjà pris par l'appelant) : PREVISION, INSTANTANES, journal.
  function ecrireVersion(acteur, ctx, type, entree, idOperation, histo) {
    var poids = ponderations();
    var dec = precision();
    var courante = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
    if (courante && yes(courante.Verrouillee)) {
      throw new AppError('VERSION_VERROUILLEE', 'La version courante ' + txt(courante['ID version']) + ' est verrouillée : elle ne peut pas être remplacée.');
    }
    if (Store.read(ctx.idSortie, 'PREVISION').rows.some(function (r) { return txt(r['Qte validee']) !== ''; })) {
      throw new AppError('PREVISION_VALIDEE', 'La prévision contient des quantités validées : elle ne peut plus être recalculée.');
    }

    var annees = histo.annees;
    var derniere = annees[annees.length - 1];
    var base = {};
    histo.articles.forEach(function (a) {
      base[norm(a.entite) + '|' + a.code] = {
        entite: a.entite, code: a.code,
        n1: a.parAnnee[derniere] ? a.parAnnee[derniere].qte : 0,
        stat: arrondi(statistique(a.parAnnee, annees, poids), dec)
      };
    });
    // Saisie des TC (facultative) : colonne Qte TC, et quantité de départ si BASE_ARBITRAGE = TC.
    var avertissementsTc = [], tcLu = null;
    try { tcLu = PrevTC.lire(acteur); } catch (e) {
      if (!(e && e.code)) throw e;
      avertissementsTc.push(e.message);
    }
    var baseTc = norm(Params.reglages().BASE_ARBITRAGE) === 'TC';
    if (tcLu) {
      Object.keys(tcLu.parArticle).forEach(function (k) {
        var x = tcLu.parArticle[k];
        if (!base[k]) base[k] = { entite: x.entite, code: x.code, n1: 0, stat: 0 };
        base[k].tc = arrondi(x.qte, dec);
      });
    }
    Object.keys(base).forEach(function (k) { base[k].base = baseTc && base[k].tc !== undefined ? base[k].tc : base[k].stat; });
    var eff = type === 'ARBITREE' ? Ajustements.effets(acteur, base) : { cles: {}, avertissements: [], nbEvenements: 0, nbCorrections: 0, nbSubstitutions: 0 };

    var libelle = txt(entree && entree.libelle) || (type === 'ARBITREE'
      ? 'Arbitrée sur ' + (baseTc && tcLu ? 'la saisie des TC' : 'la statistique') + ' : ' + eff.nbEvenements + ' événement(s), ' + eff.nbCorrections + ' correction(s), ' + eff.nbSubstitutions + ' substitution(s) ou arrêt(s)'
      : 'Statistique ' + poids.join('/') + ' sur ' + annees.join(', '));
    var version = Versions.creerInterne(acteur, ctx, { type: type, scenario: 'BASE', libelle: libelle, dateReunion: entree && entree.dateReunion, commentaire: entree && entree.commentaire }, idOperation);

    var cles = {};
    Object.keys(base).forEach(function (k) { cles[k] = true; });
    Object.keys(eff.cles).forEach(function (k) { cles[k] = true; });
    var maintenantTxt = maintenant();
    var lignes = [], photos = [], totaux = {}, negatifs = 0;
    Object.keys(cles).sort().forEach(function (k) {
      var b = base[k], f = eff.cles[k];
      var entite = b ? b.entite : f.entite, code = b ? b.code : f.code;
      var n1 = b ? b.n1 : 0, stat = b ? b.stat : 0, tc = b ? b.tc : undefined, depart = b ? b.base : 0;
      var id = idLigne(ctx.idCampagne, entite, code);
      var ligne = {
        'ID ligne': id, 'Code produit': code, 'Entite': entite, 'Plateforme': PLATEFORME_NON_AFFECTEE,
        'Qte historique corrigee N-1': arrondi(n1, dec), 'Qte statistique': stat,
        'Statut': type, 'Version': version.idVersion, 'Modifie par': acteur.email, 'Modifie le': maintenantTxt
      };
      if (tc !== undefined) ligne['Qte TC'] = tc;
      var retenue = stat;
      if (type === 'ARBITREE') {
        var ev = f ? arrondi(f.evenements, dec) : 0, co = f ? arrondi(f.correction, dec) : 0, su = f ? arrondi(f.substitution, dec) : 0;
        if (ev) ligne['Qte evenements'] = ev;
        if (co) ligne['Qte correction'] = co;
        if (su) ligne['Qte substitution'] = su;
        var somme = depart + ev + co + su;
        if (somme < 0) negatifs++;
        retenue = arrondi(Math.max(0, somme), dec);
        ligne['Qte arbitree'] = retenue;
      }
      lignes.push(ligne);
      photos.push({ 'ID version': version.idVersion, 'ID ligne': id, 'Qte retenue': retenue });
      var t = totaux[entite] = totaux[entite] || { entite: entite, n1: 0, statistique: 0, tc: 0, retenue: 0, articles: 0 };
      t.n1 += n1; t.statistique += stat; t.tc += tc || 0; t.retenue += retenue; t.articles++;
    });
    var avertissements = eff.avertissements.concat(avertissementsTc);
    if (negatifs) avertissements.push(negatifs + ' article(s) tombent sous zéro après les corrections : la quantité arbitrée est ramenée à 0.');

    Store.viderDonnees(ctx.idSortie, 'PREVISION');
    Store.append(ctx.idSortie, 'PREVISION', lignes);
    Store.append(ctx.idSortie, 'INSTANTANES', photos);
    Journal.log(ctx.idSortie, acteur, type === 'ARBITREE' ? 'PREVISION_ARBITREE' : 'PREVISION_STATISTIQUE', version.idVersion, '', lignes.length + ' ligne(s)', libelle, idOperation);
    return {
      idVersion: version.idVersion, type: type, lignes: lignes.length, ponderation: poids, annees: annees,
      evenements: eff.nbEvenements, corrections: eff.nbCorrections, substitutions: eff.nbSubstitutions, baseTc: baseTc && !!tcLu,
      avertissements: avertissements,
      totaux: Object.keys(totaux).map(function (k) { return totaux[k]; })
    };

  }

  function controlerCalcul(acteur, type) {
    Auth.requireCap(acteur, SOP.TYPE_CAP[type]);
    if (!Auth.inScope(acteur, SOP.TYPE_CAP[type], {})) {
      throw new AppError('CAPACITE_REFUSEE', 'Le calcul porte sur tous les articles : il demande un périmètre global.');
    }
    Auth.requireWritable(acteur);
  }

  // type : STATISTIQUE (moyenne pondérée seule) ou ARBITREE (statistique + événements, corrections, substitutions et arrêts).
  function construire(acteur, type, entree, idOperation) {
    controlerCalcul(acteur, type);
    var ctx = Versions.contexte(acteur);
    var histo = Histo.agreger(acteur, true);
    if (histo.annees.length < 1) throw new AppError('HISTO_VIDE', 'Aucune année d\'historique à exploiter.');
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        return ecrireVersion(acteur, ctx, type, entree, idOperation, histo);
      });
    });
  }

  // Reprévision du comité : remplace les corrections saisies dans le tableau, puis crée la version arbitrée, en une seule opération.
  function reprevision(acteur, entree, idOperation) {
    entree = entree || {};
    controlerCalcul(acteur, 'ARBITREE');
    Auth.requireCap(acteur, 'correctionPrevision');
    var ctx = Versions.contexte(acteur);
    var histo = Histo.agreger(acteur, true);
    if (histo.annees.length < 1) throw new AppError('HISTO_VIDE', 'Aucune année d\'historique à exploiter.');
    var lignes = Ajustements.preparerCorrections(entree.corrections || [], entree.motif, entree.commentaire);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var changements = Ajustements.remplacerCorrections(acteur, ctx, lignes, idOperation);
        var res = ecrireVersion(acteur, ctx, 'ARBITREE', { libelle: txt(entree.libelle), commentaire: txt(entree.commentaire), dateReunion: entree.dateReunion }, idOperation, histo);
        res.corrigees = changements.cree;
        res.annulees = changements.annule;
        return res;
      });
    });
  }

  function calculer(acteur, entree, idOperation) { return construire(acteur, 'STATISTIQUE', entree, idOperation); }
  function arbitrer(acteur, entree, idOperation) { return construire(acteur, 'ARBITREE', entree, idOperation); }

  // Prévision courante lue dans PREVISION, jointe à l'historique (libellés, hectares, valeur). Visible selon le périmètre (global ou entité).
  // Unités : Q = quantité en unités de stock ; H = hectares ; E = valeur HT. Hectares et valeur d'une quantité prévue se déduisent
  // de la dernière année où l'article s'est vendu (hectares par unité, euros par unité). Article jamais vendu : coefficient 0.
  function chargerCourante(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = Versions.contexte(acteur);
    var version = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
    var rows = Store.read(ctx.idSortie, 'PREVISION').rows;
    if (!version || !rows.length) return { version: null, ponderation: ponderations(), articles: [], totaux: [], anneeReference: '' };
    var autorise = Histo.filtre(acteur);
    var visibles = rows.filter(function (r) { return autorise(txt(r.Entite), ''); });
    var histoParCle = {};
    var anneeReference = '';
    try {
      var h = Histo.agreger(acteur, false);
      anneeReference = h.annees[h.annees.length - 1] || '';
      h.articles.forEach(function (a) {
        var dernier = a.parAnnee[anneeReference];
        var ratio = { rh: 0, re: 0 };
        for (var i = h.annees.length - 1; i >= 0; i--) {
          var p = a.parAnnee[h.annees[i]];
          if (p && p.qte > 0) { ratio = { rh: p.ha / p.qte, re: p.mt / p.qte }; break; }
        }
        histoParCle[norm(a.entite) + '|' + a.code] = { libelle: a.libelle, rh: ratio.rh, re: ratio.re, n1ha: dernier ? dernier.ha : 0, n1eur: dernier ? dernier.mt : 0 };
      });
    } catch (e) {
      // Sans historique lisible, les codes s'affichent seuls et les unités autres que la quantité restent à 0.
    }
    var num = function (v) { var n = Number(v); return isFinite(n) && txt(v) !== '' ? n : 0; };
    var zero = function () { return { n1: 0, statistique: 0, tc: 0, evenements: 0, correction: 0, substitution: 0, retenue: 0 }; };
    var baseTc = norm(Params.reglages().BASE_ARBITRAGE) === 'TC';
    var totaux = {};
    var articles = visibles.map(function (r) {
      var entite = txt(r.Entite), code = txt(r['Code produit']);
      var hs = histoParCle[norm(entite) + '|' + code] || { libelle: '', rh: 0, re: 0, n1ha: 0, n1eur: 0 };
      var n1 = num(r['Qte historique corrigee N-1']), stat = num(r['Qte statistique']);
      var ev = num(r['Qte evenements']), co = num(r['Qte correction']), su = num(r['Qte substitution']);
      var tc = txt(r['Qte TC']) !== '' ? num(r['Qte TC']) : null;
      var arbitree = txt(r['Qte arbitree']) !== '';
      var retenue = arbitree ? num(r['Qte arbitree']) : stat;
      var depart = arbitree && baseTc && tc !== null ? tc : stat;
      var t = totaux[entite] = totaux[entite] || { entite: entite, articles: 0, q: zero(), ha: zero(), eur: zero() };
      t.articles++;
      [['q', 1, n1], ['ha', hs.rh, hs.n1ha], ['eur', hs.re, hs.n1eur]].forEach(function (u) {
        var m = t[u[0]];
        m.n1 += u[0] === 'q' ? n1 : u[2];
        m.statistique += stat * u[1]; m.tc += (tc || 0) * u[1]; m.evenements += ev * u[1]; m.correction += co * u[1]; m.substitution += su * u[1]; m.retenue += retenue * u[1];
      });
      return { code: code, libelle: hs.libelle, entite: entite, n1: n1, statistique: stat, tc: tc, depart: depart, evenements: ev, correction: co, substitution: su, retenue: retenue, rh: hs.rh, re: hs.re, n1ha: hs.n1ha, n1eur: hs.n1eur };
    }).sort(function (a, b) { return b.retenue - a.retenue || (a.code < b.code ? -1 : 1); });
    return {
      version: { id: txt(version['ID version']), libelle: txt(version.Libelle), creePar: txt(version['Cree par']), creeLe: txt(version['Cree le']), verrouillee: yes(version.Verrouillee), type: norm(version.Type) },
      ponderation: ponderations(),
      anneeReference: anneeReference,
      totaux: Object.keys(totaux).map(function (k) {
        var t = totaux[k];
        // Compatibilité : les champs de quantité restent à la racine.
        return { entite: t.entite, articles: t.articles, n1: t.q.n1, statistique: t.q.statistique, tc: t.q.tc, evenements: t.q.evenements, correction: t.q.correction, substitution: t.q.substitution, retenue: t.q.retenue, q: t.q, ha: t.ha, eur: t.eur };
      }),
      articles: articles
    };
  }

  function courante(acteur) {
    var d = chargerCourante(acteur);
    d.nbArticles = d.articles.length;
    d.tronque = d.articles.length > 400;
    d.articles = d.articles.slice(0, 400);
    return d;
  }

  return { calculer: calculer, arbitrer: arbitrer, fiabiliteReelle: fiabiliteReelle, reprevision: reprevision, chargerCourante: chargerCourante, essai: essai, courante: courante, statistique: statistique, ponderations: ponderations };
})();
