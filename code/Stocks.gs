// Projection hebdomadaire des stocks et besoins de réapprovisionnement.
//
// Sources (SOURCES, colonnes reconnues par leur début, sans accents ni casse) :
//  - nature STOCKS : Date stock, Plateforme, Code produit, [Entite], Stock. Le dernier relevé de chaque article et plateforme sert de départ.
//  - nature COMMANDES_FOURN : Code produit, Code point, Date limite livraison, Quantite reste a livrer, [Code fournisseur].
// Paramètres facultatifs : PARAMETRES_STOCK (stock mini, lot de réappro), CONTRAINTES_APPRO (délai fournisseur).
// Demande : quantité retenue de la prévision, répartie par le cadençage, toutes entités et plateformes confondues.
// La projection est globale par article : la répartition de la demande par plateforme demande l'affectation des TC aux plateformes.

var Stocks = (function () {
  var HORIZON_MAX = 104;

  function canon(v) { return txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' '); }
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    var n = t === '' ? 0 : Number(t);
    return isFinite(n) ? n : 0;
  }
  function codeTexte(v) { return typeof v === 'number' ? String(Math.round(v)) : txt(v); }
  function arr(x) { return Math.round(x * 1000) / 1000; }

  function colonne(headers, debuts, obligatoire, nomAffiche) {
    for (var i = 0; i < debuts.length; i++) {
      var h = headers.filter(function (x) { return x && canon(x).indexOf(debuts[i]) === 0; })[0];
      if (h) return h;
    }
    if (obligatoire) throw new AppError('SOURCE_COLONNES', 'Colonne manquante : ' + nomAffiche + '.');
    return null;
  }

  function lireSource(nature, idCampagne) {
    var src = Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === nature && yes(r['Actif import']) && txt(r['ID fichier']) && (!txt(r['ID campagne']) || txt(r['ID campagne']) === idCampagne);
    })[0];
    if (!src) return null;
    if (!txt(src.Onglet)) throw new AppError('SOURCE_ONGLET', 'Source ' + txt(src['ID source']) + ' : onglet non renseigné.');
    var d = Store.read(txt(src['ID fichier']), txt(src.Onglet));
    return { src: src, headers: d.headers, rows: d.rows };
  }

  // Stocks de départ : { code: { plateforme: quantité } } et date du dernier relevé.
  function chargerStocks(idCampagne) {
    var s = lireSource('STOCKS', idCampagne);
    if (!s) return null;
    var cDate = colonne(s.headers, ['date stock', 'date'], true, 'Date stock'), cPlat = colonne(s.headers, ['plateforme'], true, 'Plateforme');
    var cCode = colonne(s.headers, ['code produit'], true, 'Code produit'), cStock = colonne(s.headers, ['stock'], true, 'Stock');
    // Dernier relevé de chaque plateforme et article ; plusieurs lignes du même relevé (entités) s'additionnent.
    var plusRecent = {}, derniereDate = null;
    var lignes = [];
    s.rows.forEach(function (r) {
      var d = Cadencage.dateDe(r[cDate]), code = codeTexte(r[cCode]);
      if (!d || !code) return;
      var k = txt(r[cPlat]) + '|' + code;
      if (!plusRecent[k] || d.getTime() > plusRecent[k]) plusRecent[k] = d.getTime();
      if (!derniereDate || d.getTime() > derniereDate.getTime()) derniereDate = d;
      lignes.push({ k: k, t: d.getTime(), plat: txt(r[cPlat]), code: code, qte: nombre(r[cStock]) });
    });
    var res = {};
    lignes.forEach(function (x) {
      if (x.t !== plusRecent[x.k]) return;
      var parPlat = res[x.code] = res[x.code] || {};
      parPlat[x.plat] = arr((parPlat[x.plat] || 0) + x.qte);
    });
    return { parArticle: res, date: derniereDate, nbLignes: s.rows.length };
  }

  // Commandes restant à livrer : [{ code, plat, date, qte, fournisseur }].
  function chargerCommandes(idCampagne) {
    var s = lireSource('COMMANDES_FOURN', idCampagne);
    if (!s) return null;
    var cCode = colonne(s.headers, ['code produit'], true, 'Code produit'), cDate = colonne(s.headers, ['date limite livraison'], true, 'Date limite livraison');
    var cReste = colonne(s.headers, ['quantite reste a livrer'], true, 'Quantité reste à livrer');
    var cPoint = colonne(s.headers, ['code point'], false), cFour = colonne(s.headers, ['code fournisseur'], false);
    var liste = [];
    s.rows.forEach(function (r) {
      var q = nombre(r[cReste]), d = Cadencage.dateDe(r[cDate]), code = codeTexte(r[cCode]);
      if (!(q > 0) || !d || !code) return;
      liste.push({ code: code, plat: cPoint ? txt(r[cPoint]) : '', date: d, qte: q, fournisseur: cFour ? txt(r[cFour]) : '' });
    });
    return { commandes: liste, nbLignes: s.rows.length };
  }

  function semainesEntre(debut, fin) {
    var res = [], d = new Date(debut.getTime());
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    for (var i = 0; i < HORIZON_MAX; i++) {
      var e = Cadencage.semaineDe(d).etiquette;
      res.push(e);
      if (e >= fin) break;
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return res;
  }

  function reglageNombre(cle, defaut) {
    var n = Number(txt(Params.reglages()[cle]).replace(',', '.'));
    return isFinite(n) && txt(Params.reglages()[cle]) !== '' ? n : defaut;
  }

  function projeter(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var idCampagne = txt(acteur.campagne['ID campagne']);
    var st = chargerStocks(idCampagne);
    if (!st) throw new AppError('STOCK_SANS_SOURCE', 'Aucune source de stocks active : déclarez dans SOURCES une ligne de nature STOCKS (ID du fichier, onglet) avec Actif import = OUI.');
    if (!st.date) throw new AppError('STOCK_VIDE', 'Le fichier de stocks ne contient aucun relevé daté.');
    var co = chargerCommandes(idCampagne);
    var dem = Cadencage.demandeHebdo(acteur);
    var debut = Cadencage.semaineDe(st.date).etiquette;

    // Dernière semaine utile : fin de la demande ou dernière réception.
    var fin = debut;
    Object.keys(dem.parArticle).forEach(function (c) { Object.keys(dem.parArticle[c]).forEach(function (e) { if (e > fin) fin = e; }); });
    if (co) co.commandes.forEach(function (x) { var e = Cadencage.semaineDe(x.date).etiquette; if (e > fin) fin = e; });
    var semaines = semainesEntre(st.date, fin);
    var indice = {}; semaines.forEach(function (e, i) { indice[e] = i; });
    var indexSemaine = function (d) { var e = Cadencage.semaineDe(d).etiquette; return e < debut ? 0 : (indice[e] === undefined ? semaines.length - 1 : indice[e]); };

    var receptions = {}; // code -> tableau par semaine
    var fournisseurs = {};
    if (co) co.commandes.forEach(function (x) {
      var t = receptions[x.code] = receptions[x.code] || semaines.map(function () { return 0; });
      t[indexSemaine(x.date)] += x.qte;
      if (x.fournisseur && !fournisseurs[x.code]) fournisseurs[x.code] = x.fournisseur;
    });

    var minis = {}, lots = {};
    Params.table('PARAMETRES_STOCK').forEach(function (r) {
      if (!yes(r.Actif) || !txt(r['Code produit'])) return;
      minis[txt(r['Code produit'])] = (minis[txt(r['Code produit'])] || 0) + nombre(r['Stock mini']);
      if (nombre(r['Lot reappro']) > 0) lots[txt(r['Code produit'])] = nombre(r['Lot reappro']);
    });
    var delaiDe = function (code) {
      var rows = Params.table('CONTRAINTES_APPRO');
      var r = rows.filter(function (x) { return txt(x['Code produit']) === code; })[0] || rows.filter(function (x) { return !txt(x['Code produit']); })[0];
      return r ? { delai: Number(r['Lead time semaines']) || 0, fournisseur: txt(r['Code fournisseur']) } : { delai: 0, fournisseur: '' };
    };

    var cMax = reglageNombre('COUVERTURE_MAX_MOIS', 3);
    var libelles = {};
    try { Previsions.chargerCourante(acteur).articles.forEach(function (a) { if (a.libelle) libelles[a.code] = a.libelle; }); } catch (e) { /* codes seuls */ }

    var codes = {};
    Object.keys(st.parArticle).forEach(function (c) { codes[c] = true; });
    Object.keys(dem.parArticle).forEach(function (c) { codes[c] = true; });
    var plateformes = {};
    var articles = Object.keys(codes).sort().map(function (code) {
      var parPlat = st.parArticle[code] || {};
      var stock0 = Object.keys(parPlat).reduce(function (s, p) { return s + parPlat[p]; }, 0);
      Object.keys(parPlat).forEach(function (p) { var x = plateformes[p] = plateformes[p] || { plateforme: p, stock: 0, articles: 0 }; x.stock += parPlat[p]; x.articles++; });
      var d = dem.parArticle[code] || {};
      var rec = receptions[code] || semaines.map(function () { return 0; });
      var serie = [], stock = stock0, mini = minis[code] || 0, demandeTotale = 0, recTotale = 0;
      var premiereRupture = -1, pire = Infinity;
      semaines.forEach(function (e, i) {
        var q = d[e] || 0;
        stock = stock + rec[i] - q; demandeTotale += q; recTotale += rec[i];
        serie.push(arr(stock));
        if (stock < mini && premiereRupture < 0) premiereRupture = i;
        if (stock < pire) pire = stock;
      });
      var nbSemDemande = Object.keys(d).length;
      var hebdoMoyenne = nbSemDemande ? demandeTotale / nbSemDemande : 0;
      var mensuelle = hebdoMoyenne * 4.33;
      var fin0 = serie[serie.length - 1];
      var alerte = 'AUCUNE';
      if (premiereRupture >= 0) alerte = 'RUPTURE';
      else if (mensuelle > 0 && fin0 > cMax * mensuelle) alerte = 'SURSTOCK';
      var manque = premiereRupture >= 0 ? arr(Math.max(0, mini - pire)) : 0;
      return {
        code: code, libelle: libelles[code] || '', stock0: arr(stock0), mini: mini, demande: arr(demandeTotale), receptions: arr(recTotale), fin: fin0,
        couverture: hebdoMoyenne > 0 ? arr(stock0 / hebdoMoyenne) : null, alerte: alerte,
        semaineRupture: premiereRupture >= 0 ? semaines[premiereRupture] : '', manque: manque, serie: serie
      };
    });

    // Besoins de réapprovisionnement : quantité manquante, arrondie au lot, à commander avant la semaine du besoin moins le délai.
    var besoins = articles.filter(function (a) { return a.alerte === 'RUPTURE' && a.manque > 0; }).map(function (a) {
      var lot = lots[a.code] || 0, q = lot > 0 ? Math.ceil(a.manque / lot) * lot : a.manque;
      var idx = indice[a.semaineRupture], dl = delaiDe(a.code);
      var cmd = idx - dl.delai < 0 ? semaines[0] : semaines[idx - dl.delai];
      return { code: a.code, libelle: a.libelle, semaineBesoin: a.semaineRupture, manque: a.manque, lot: lot, aCommander: arr(q), delai: dl.delai, semaineCommande: cmd, enRetard: idx - dl.delai < 0, fournisseur: dl.fournisseur || fournisseurs[a.code] || '' };
    }).sort(function (a, b) { return a.semaineCommande < b.semaineCommande ? -1 : a.semaineCommande > b.semaineCommande ? 1 : (b.manque - a.manque); });

    var ruptureParSemaine = semaines.map(function (e, i) { return articles.filter(function (a) { return a.mini !== undefined && a.serie[i] < a.mini; }).length; });
    return {
      dateStock: st.date.toISOString().slice(0, 10), debut: debut, semaines: semaines,
      commandesConnectees: !!co, demandeConnectee: Object.keys(dem.parArticle).length > 0, anneePrevue: dem.annee,
      kpis: { articles: articles.length, ruptures: articles.filter(function (a) { return a.alerte === 'RUPTURE'; }).length, surstocks: articles.filter(function (a) { return a.alerte === 'SURSTOCK'; }).length, besoins: besoins.length },
      ruptureParSemaine: ruptureParSemaine,
      plateformes: Object.keys(plateformes).sort().map(function (k) { plateformes[k].stock = arr(plateformes[k].stock); return plateformes[k]; }),
      articles: articles, besoins: besoins
    };
  }

  // Alertes pour le tableau de bord. Une source illisible donne une alerte, jamais une erreur.
  function alertes(acteur) {
    var res = [];
    var p;
    try { p = projeter(acteur); } catch (e) {
      if (e && e.code === 'STOCK_SANS_SOURCE') return res;
      return [{ niveau: 'ERREUR', titre: 'Stocks illisibles', detail: e && e.message ? e.message : 'Lecture impossible.' }];
    }
    var ruptures = p.articles.filter(function (a) { return a.alerte === 'RUPTURE'; }).sort(function (a, b) { return a.semaineRupture < b.semaineRupture ? -1 : (b.manque - a.manque); });
    ruptures.slice(0, 3).forEach(function (a) { res.push({ niveau: 'ERREUR', titre: 'Rupture prévue', detail: (a.libelle || a.code) + ' : stock sous le minimum dès la semaine ' + a.semaineRupture + ' (manque ' + Math.round(a.manque) + ').' }); });
    if (ruptures.length > 3) res.push({ niveau: 'ERREUR', titre: 'Autres ruptures', detail: (ruptures.length - 3) + ' autre(s) article(s) en rupture prévue.' });
    var sur = p.articles.filter(function (a) { return a.alerte === 'SURSTOCK'; });
    sur.slice(0, 2).forEach(function (a) { res.push({ niveau: 'ATTENTION', titre: 'Surstock prévu', detail: (a.libelle || a.code) + ' : stock de fin ' + Math.round(a.fin) + ' pour une demande mensuelle plus faible.' }); });
    if (sur.length > 2) res.push({ niveau: 'ATTENTION', titre: 'Autres surstocks', detail: (sur.length - 2) + ' autre(s) article(s) en surstock prévu.' });
    return res;
  }

  return { projeter: projeter, alertes: alertes, chargerStocks: chargerStocks, chargerCommandes: chargerCommandes };
})();
