// Cadençage : répartition du besoin du PAC sur les semaines de livraison, puis sur les mois du comité.
//
// Les coefficients sont dans l'onglet COEFFICIENTS des paramètres (une ligne par semaine ISO), au niveau GLOBAL (cle « * »)
// ou ARTICLE (cle = code produit). Un coefficient est un pourcentage du besoin ; les coefficients d'un jeu font 100.
// La semaine ISO se rattache au mois de son jeudi. L'année des semaines est l'année de prévision de la campagne.

var Cadencage = (function () {
  var NIVEAUX = ['GLOBAL', 'MARCHE', 'ARTICLE'];

  function pad2(n) { return ('0' + n).slice(-2); }

  // Jeudi de la semaine ISO (date UTC). La semaine 1 est celle du 4 janvier.
  function jeudi(annee, sem) {
    var jan4 = Date.UTC(annee, 0, 4);
    var jourSem = (new Date(jan4).getUTCDay() + 6) % 7;
    return new Date(jan4 - jourSem * 86400000 + ((sem - 1) * 7 + 3) * 86400000);
  }
  function nbSemaines(annee) {
    var d = new Date(Date.UTC(annee, 11, 28));
    var j = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
    return Math.floor((j.getTime() - Date.UTC(j.getUTCFullYear(), 0, 1)) / (7 * 86400000)) + 1;
  }
  function mois(annee, sem) { var j = jeudi(annee, sem); return j.getUTCFullYear() + '-' + pad2(j.getUTCMonth() + 1); }
  function etiquette(annee, sem) { return annee + '-S' + pad2(sem); }

  function anneePrevue(acteur) {
    var a = Number(acteur.campagne['Annee prevision']);
    if (!a) throw new AppError('ANNEE_PREVISION_ABSENTE', 'La campagne n\'a pas d\'année de prévision (colonne Annee prevision de CAMPAGNES).');
    return a;
  }

  // Clé d'un jeu : le marché se compare sans tenir compte de la casse, le code produit tel quel.
  function cleDe(niveau, cle) {
    var n = norm(niveau);
    return n + '|' + (n === 'GLOBAL' ? '*' : (n === 'MARCHE' ? norm(cle) : txt(cle)));
  }

  // Jeux de coefficients de la campagne : { 'GLOBAL|*': { niveau, cle, semaines: {n: coef}, version, validation, origine, validePar } }
  function lire(acteur) {
    var idCampagne = txt(acteur.campagne['ID campagne']);
    var jeux = {};
    Params.table('COEFFICIENTS').forEach(function (r) {
      if (txt(r['ID campagne']) !== idCampagne) return;
      var niveau = norm(r.Niveau), sem = Number(r.Semaine), coef = Number(txt(r.Coefficient).replace(',', '.'));
      if (NIVEAUX.indexOf(niveau) < 0 || !(sem >= 1 && sem <= 53) || !isFinite(coef) || txt(r.Coefficient) === '') return;
      var k = cleDe(niveau, r['Cle niveau']);
      var j = jeux[k] = jeux[k] || { niveau: niveau, cle: niveau === 'GLOBAL' ? '*' : txt(r['Cle niveau']), semaines: {}, version: 0, validation: 'A_VALIDER', origine: norm(r.Origine) || 'MANUEL', validePar: '' };
      j.semaines[sem] = coef;
      j.version = Math.max(j.version, Number(r['Version coefficients']) || 0);
      if (norm(r.Validation) === 'VALIDE') { j.validation = 'VALIDE'; j.validePar = txt(r['Valide par']); }
    });
    return jeux;
  }

  // Jeu applicable à un article : le sien, sinon celui de son marché, sinon le global, sinon aucun.
  function profil(jeux, code, marche) { return jeux['ARTICLE|' + txt(code)] || (txt(marche) ? jeux['MARCHE|' + norm(marche)] : null) || jeux['GLOBAL|*'] || null; }

  // Part de chaque semaine (coef / somme des coefficients), sans arrondi.
  function parts(jeu) {
    var sems = Object.keys(jeu.semaines).map(Number).sort(function (a, b) { return a - b; });
    var somme = sems.reduce(function (s, n) { return s + jeu.semaines[n]; }, 0);
    return somme > 0 ? sems.map(function (n) { return { sem: n, part: jeu.semaines[n] / somme }; }) : [];
  }

  // Répartit une quantité sur les semaines du jeu (parts = coef / somme). Les arrondis (3 décimales) sont repris sur la plus grosse semaine.
  function repartir(quantite, jeu) {
    var sems = Object.keys(jeu.semaines).map(Number).sort(function (a, b) { return a - b; });
    var somme = sems.reduce(function (s, n) { return s + jeu.semaines[n]; }, 0);
    if (!(somme > 0)) return [];
    var res = sems.map(function (n) { return { sem: n, qte: Math.round(quantite * jeu.semaines[n] / somme * 1000) / 1000 }; });
    var ecart = Math.round((quantite - res.reduce(function (s, x) { return s + x.qte; }, 0)) * 1000) / 1000;
    if (ecart) {
      var gros = res.reduce(function (m, x, i) { return jeu.semaines[x.sem] > jeu.semaines[res[m].sem] ? i : m; }, 0);
      res[gros].qte = Math.round((res[gros].qte + ecart) * 1000) / 1000;
    }
    return res;
  }

  function controlerDroit(acteur, cap) {
    Auth.requireCap(acteur, cap);
    if (!Auth.inScope(acteur, cap, {})) throw new AppError('CAPACITE_REFUSEE', 'Le cadençage vaut pour toute la campagne : il demande un périmètre global.');
    Auth.requireWritable(acteur);
  }

  function reecrire(garder, ajouter) {
    var idParam = Params.idFichier();
    var lignes = Store.read(idParam, 'COEFFICIENTS').rows.filter(garder).map(function (r) {
      var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o;
    }).concat(ajouter);
    Store.viderDonnees(idParam, 'COEFFICIENTS');
    Store.append(idParam, 'COEFFICIENTS', lignes);
  }

  function memeJeu(acteur, niveau, cle) {
    var id = txt(acteur.campagne['ID campagne']), k = cleDe(niveau, cle);
    return function (r) { return txt(r['ID campagne']) === id && cleDe(r.Niveau, r['Cle niveau']) === k; };
  }

  // entree : { niveau: GLOBAL|ARTICLE, cle, coefficients: { '5': 10, ... }, origine }. Les coefficients font 100.
  function sauvegarder(acteur, entree, idOperation) {
    entree = entree || {};
    controlerDroit(acteur, 'arbitrage');
    var niveau = norm(entree.niveau);
    if (NIVEAUX.indexOf(niveau) < 0) throw new AppError('NIVEAU_INVALIDE', 'Niveau de cadençage inconnu : ' + txt(entree.niveau) + '.');
    var cle = niveau === 'GLOBAL' ? '*' : txt(entree.cle);
    if (!cle) throw new AppError('CODE_OBLIGATOIRE', niveau === 'MARCHE' ? 'Le marché est obligatoire pour un cadençage de marché.' : 'Le code produit est obligatoire pour un cadençage d\'article.');
    var annee = anneePrevue(acteur), max = nbSemaines(annee);
    var coefs = {}, somme = 0;
    Object.keys(entree.coefficients || {}).forEach(function (k) {
      var n = Number(k), brut = entree.coefficients[k];
      if (txt(brut) === '') return;
      var v = Number(txt(brut).replace(',', '.'));
      if (!(n >= 1 && n === Math.floor(n))) throw new AppError('SEMAINE_INVALIDE', 'Semaine invalide : ' + k + '.');
      if (n > max) throw new AppError('SEMAINE_INVALIDE', 'L\'année ' + annee + ' n\'a que ' + max + ' semaines (semaine ' + n + ' refusée).');
      if (!isFinite(v) || v < 0) throw new AppError('COEFFICIENT_INVALIDE', 'Coefficient invalide pour la semaine ' + n + '.');
      if (v > 0) { coefs[n] = v; somme += v; }
    });
    if (!Object.keys(coefs).length) throw new AppError('COEFFICIENT_INVALIDE', 'Aucun coefficient renseigné.');
    if (Math.abs(somme - 100) > 0.01) throw new AppError('SOMME_INVALIDE', 'Les coefficients font ' + (Math.round(somme * 100) / 100) + ' % : le total doit faire 100 %.');
    var origine = norm(entree.origine) === 'HISTORIQUE' ? 'HISTORIQUE' : 'MANUEL';
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var avant = lire(acteur)[cleDe(niveau, cle)];
        var version = (avant ? avant.version : 0) + 1;
        var id = txt(acteur.campagne['ID campagne']);
        var nouvelles = Object.keys(coefs).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
          return { 'ID campagne': id, 'Niveau': niveau, 'Cle niveau': cle, 'Plateforme': '*', 'Semaine': n, 'Coefficient': coefs[n], 'Origine': origine, 'Version coefficients': version, 'Validation': 'A_VALIDER', 'Valide par': '' };
        });
        reecrire(function (r) { return !memeJeu(acteur, niveau, cle)(r); }, nouvelles);
        Journal.log(ctx.idSortie, acteur, 'COEFFICIENTS_MODIFIES', niveau + ' ' + cle, avant ? 'v' + avant.version : '', 'v' + version + ' · ' + nouvelles.length + ' semaine(s)', origine, idOperation);
        return { niveau: niveau, cle: cle, version: version, semaines: nouvelles.length };
      });
    });
  }

  function supprimer(acteur, niveau, cle, idOperation) {
    controlerDroit(acteur, 'arbitrage');
    niveau = norm(niveau);
    if (niveau !== 'ARTICLE' && niveau !== 'MARCHE') throw new AppError('NIVEAU_INVALIDE', 'Seul un cadençage d\'article ou de marché peut être supprimé : le cadençage global se remplace.');
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var avant = lire(acteur)[cleDe(niveau, cle)];
        if (!avant) throw new AppError('CADENCAGE_INCONNU', 'Aucun cadençage pour l\'article ' + txt(cle) + '.');
        reecrire(function (r) { return !memeJeu(acteur, niveau, cle)(r); }, []);
        Journal.log(ctx.idSortie, acteur, 'COEFFICIENTS_SUPPRIMES', niveau + ' ' + txt(cle), 'v' + avant.version, '', '', idOperation);
        return { niveau: niveau, cle: txt(cle) };
      });
    });
  }

  // Marque un jeu comme validé (capacité de validation).
  function validerJeu(acteur, niveau, cle, idOperation) {
    controlerDroit(acteur, 'validation');
    niveau = norm(niveau);
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var jeu = lire(acteur)[cleDe(niveau, cle)];
        if (!jeu) throw new AppError('CADENCAGE_INCONNU', 'Aucun cadençage à valider.');
        var idParam = Params.idFichier();
        Store.read(idParam, 'COEFFICIENTS').rows.filter(memeJeu(acteur, niveau, niveau === 'GLOBAL' ? '*' : cle)).forEach(function (r) {
          Store.updateRow(idParam, 'COEFFICIENTS', r._row, { 'Validation': 'VALIDE', 'Valide par': acteur.email });
        });
        Journal.log(ctx.idSortie, acteur, 'COEFFICIENTS_VALIDES', niveau + ' ' + (jeu.cle), 'A_VALIDER', 'VALIDE', '', idOperation);
        return { niveau: niveau, cle: jeu.cle, version: jeu.version };
      });
    });
  }

  // Date (UTC) d'une cellule : objet Date, AAAA-MM-JJ ou JJ/MM/AAAA. Null si illisible.
  function dateDe(v) {
    if (v && typeof v.getFullYear === 'function') return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    var t = txt(v), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t))) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return null;
  }
  // Semaine ISO d'une date UTC : { annee, sem, etiquette }.
  function semaineDe(d) {
    var j = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    j.setUTCDate(j.getUTCDate() - ((j.getUTCDay() + 6) % 7) + 3);
    var annee = j.getUTCFullYear(), jan4 = new Date(Date.UTC(annee, 0, 4));
    var sem = 1 + Math.round(((j.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return { annee: annee, sem: sem, etiquette: etiquette(annee, sem) };
  }

  // Répartit des quantités de PREVISION sur les semaines de l'année prévue.
  // lignes : [{ entite, code, qte }] ; renvoie { demande: { 'ENTITE|code': { 'AAAA-Sss': quantité } }, nonCadences, annee }.
  function hebdoPourLignes(acteur, lignes, catalogue) {
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    var jeux = lire(acteur);
    var res = { demande: {}, nonCadences: 0, annee: annee, cadence: !!annee && Object.keys(jeux).length > 0 };
    if (!res.cadence) return res;
    lignes.forEach(function (l) {
      var j = profil(jeux, l.code, catalogue && catalogue[l.code] && catalogue[l.code].marche);
      if (!j) { res.nonCadences++; return; }
      if (!(l.qte > 0)) return;
      var cible = res.demande[norm(l.entite) + '|' + txt(l.code)] = res.demande[norm(l.entite) + '|' + txt(l.code)] || {};
      repartir(l.qte, j).forEach(function (x) {
        var e = etiquette(annee, x.sem);
        cible[e] = Math.round(((cible[e] || 0) + x.qte) * 1000) / 1000;
      });
    });
    return res;
  }

  // Quantité retenue par semaine de livraison : { code: { 'AAAA-Sss': quantité } }, toutes entités confondues.
  function demandeHebdo(acteur) {
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    var jeux = lire(acteur);
    var res = { annee: annee, parArticle: {}, nonCadences: 0 };
    if (!annee || !Object.keys(jeux).length) return res;
    var d = Previsions.chargerCourante(acteur);
    d.articles.forEach(function (a) {
      var j = profil(jeux, a.code, a.marche);
      if (!j) { res.nonCadences++; return; }
      if (!(a.retenue > 0)) return;
      var cible = res.parArticle[a.code] = res.parArticle[a.code] || {};
      repartir(a.retenue, j).forEach(function (x) {
        var e = etiquette(annee, x.sem);
        cible[e] = Math.round(((cible[e] || 0) + x.qte) * 1000) / 1000;
      });
    });
    return res;
  }

  // Écran : jeux de coefficients et répartition de la quantité retenue par semaine et par mois, dans les trois unités.
  function synthese(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    var jeux = lire(acteur);
    var liste = Object.keys(jeux).map(function (k) { return jeux[k]; }).sort(function (a, b) { return a.niveau === b.niveau ? (a.cle < b.cle ? -1 : 1) : (a.niveau === 'GLOBAL' ? -1 : 1); });
    var res = { annee: annee, marches: Catalogue.marches(Catalogue.lire(acteur)), nbSemaines: annee ? nbSemaines(annee) : 53, jeux: liste.map(function (j) {
      var libelle = null;
      return { niveau: j.niveau, cle: j.cle, version: j.version, validation: j.validation, validePar: j.validePar, origine: j.origine, semaines: j.semaines, libelle: libelle };
    }), semaines: [], mois: [], nonCadences: 0, entites: [] };
    if (!annee || !liste.length) return res;
    var d = Previsions.chargerCourante(acteur);
    if (!d.version) return res;
    var parSem = {}, entites = {};
    d.articles.forEach(function (a) {
      var j = profil(jeux, a.code, a.marche);
      if (!j) { res.nonCadences++; return; }
      entites[a.entite] = true;
      parts(j).forEach(function (x) {
        var k = x.sem;
        var ligne = parSem[k] = parSem[k] || { sem: k, etiquette: etiquette(annee, k), mois: mois(annee, k), parEntite: {} };
        var e = ligne.parEntite[a.entite] = ligne.parEntite[a.entite] || { q: 0, ha: 0, eur: 0 };
        var part = x.part * a.retenue;
        e.q += part; e.ha += part * a.rh; e.eur += part * a.re;
      });
    });
    res.entites = Object.keys(entites).sort();
    res.semaines = Object.keys(parSem).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return parSem[k]; });
    var parMois = {};
    res.semaines.forEach(function (s) {
      var m = parMois[s.mois] = parMois[s.mois] || { mois: s.mois, parEntite: {} };
      Object.keys(s.parEntite).forEach(function (e) {
        var x = m.parEntite[e] = m.parEntite[e] || { q: 0, ha: 0, eur: 0 };
        x.q += s.parEntite[e].q; x.ha += s.parEntite[e].ha; x.eur += s.parEntite[e].eur;
      });
    });
    res.mois = Object.keys(parMois).sort().map(function (k) { return parMois[k]; });
    return res;
  }

  return { hebdoPourLignes: hebdoPourLignes, dateDe: dateDe, semaineDe: semaineDe, demandeHebdo: demandeHebdo, lire: lire, profil: profil, repartir: repartir, sauvegarder: sauvegarder, supprimer: supprimer, valider: validerJeu, synthese: synthese,
    jeudi: jeudi, nbSemaines: nbSemaines, mois: mois, etiquette: etiquette, anneePrevue: anneePrevue };
})();
