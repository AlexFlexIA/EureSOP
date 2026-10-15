// Historique des ventes d'un PAC, lu directement dans les fichiers déclarés dans SOURCES (Nature = HISTO_PAC).
//
// Un fichier par entité, un onglet par année (modèle d'onglet avec {ANNEE}, ex. « Données {ANNEE} »).
// Chaque onglet donne, par article et par TC, les ventes de la période du PAC : quantité, hectares, montant HT.
// L'application ne recoupe aucune période : elle prend ce que contient l'onglet.

var Histo = (function () {
  var MAX_ARTICLES = 400;

  // Colonnes attendues, reconnues par leur début une fois les accents et la casse retirés.
  var COLONNES = [
    { cle: 'code', debut: 'code produit', nom: 'Code produit long Triskalia' },
    { cle: 'libelle', debut: 'libelle produit', nom: 'Libellé produit de la coop origine' },
    { cle: 'codeTc', debut: 'code technicien', nom: 'Code technicien Appro/DTD' },
    { cle: 'nomTc', debut: 'nom du technicien', nom: 'Nom du technicien Appro/DTD', facultative: true },
    { cle: 'qte', debut: 'total qtes', nom: 'Total qtés vtes' },
    { cle: 'ha', debut: 'total ha', nom: 'Total Ha vtes' },
    { cle: 'mt', debut: 'total mt ht', nom: 'Total mt ht vtes' }
  ];

  function canon(v) {
    return txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }

  // Un nombre peut arriver en texte avec virgule décimale et espaces. Vide ou illisible : 0.
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    if (!t) return 0;
    var n = Number(t);
    return isFinite(n) ? n : 0;
  }

  function codeTexte(v) {
    if (typeof v === 'number') return String(Math.round(v));
    return txt(v);
  }

  function sources(idCampagne) {
    return Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === 'HISTO_PAC' && yes(r['Actif import']) &&
        (!txt(r['ID campagne']) || txt(r['ID campagne']) === txt(idCampagne));
    });
  }

  // Sources actives écartées parce que leur colonne « ID campagne » ne correspond pas à la campagne affichée.
  function ecartees(idCampagne) {
    return Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === 'HISTO_PAC' && yes(r['Actif import']) && txt(r['ID campagne']) && txt(r['ID campagne']) !== txt(idCampagne);
    });
  }

  function messageSansSource(idCampagne) {
    var base = 'Aucune source d\'historique active pour la campagne ' + idCampagne + '.';
    var autres = ecartees(idCampagne);
    if (!autres.length) return base + ' Dans SOURCES, déclarez une ligne de nature HISTO_PAC avec l\'ID du fichier et Actif import = OUI.';
    var detail = autres.map(function (r) {
      var v = txt(r['ID campagne']);
      var ressembleId = /^[A-Za-z0-9_-]{25,}$/.test(v) && !/^[A-Z]+[A-Z0-9]*_\d{4}/.test(v);
      return txt(r['ID source']) + ' (ID campagne = « ' + v.slice(0, 20) + (v.length > 20 ? '…' : '') + ' »' + (ressembleId ? ', cela ressemble à un ID de fichier : à coller dans la colonne ID fichier' : '') + ')';
    }).join(' ; ');
    return base + ' Sources écartées : ' + detail + '. La colonne ID campagne doit rester vide, ou contenir ' + idCampagne + '.';
  }

  function annees(src) {
    var liste = txt(src.Annees).split(/[,;\s]+/).filter(Boolean);
    var vues = {};
    liste.forEach(function (a) {
      if (!/^\d{4}$/.test(a)) throw new AppError('HISTO_ANNEES', 'Source ' + txt(src['ID source']) + ' : « ' + a + ' » n\'est pas une année (colonne Annees, ex. 2024,2025,2026).');
      vues[a] = true;
    });
    var out = Object.keys(vues).sort();
    if (!out.length) throw new AppError('HISTO_ANNEES', 'Source ' + txt(src['ID source']) + ' : aucune année dans la colonne Annees.');
    return out;
  }

  function lireOnglet(src, annee) {
    var id = txt(src['ID fichier']);
    var modele = txt(src.Onglet) || 'Données {ANNEE}';
    var onglet = modele.indexOf('{ANNEE}') >= 0 ? modele.replace('{ANNEE}', annee) : modele;
    if (!id) throw new AppError('HISTO_ID_ABSENT', 'Source ' + txt(src['ID source']) + ' : ID fichier vide.');
    var donnees;
    try {
      donnees = Store.read(id, onglet);
    } catch (e) {
      if (e && e.code === 'CLASSEUR_INACCESSIBLE' && norm(src.Format) === 'XLSX') {
        throw new AppError('HISTO_XLSX', 'Source ' + txt(src['ID source']) + ' : ce fichier est un Excel. Ouvrez-le dans Google Drive, faites Fichier > Enregistrer en tant que feuille Google Sheets, puis déclarez le nouvel ID avec Format = SHEETS.');
      }
      throw e;
    }
    var position = {};
    var manque = [];
    COLONNES.forEach(function (c) {
      var trouvee = donnees.headers.filter(function (h) { return h && canon(h).indexOf(c.debut) === 0; })[0];
      if (trouvee) position[c.cle] = trouvee;
      else if (!c.facultative) manque.push(c.nom);
    });
    if (manque.length) {
      throw new AppError('HISTO_COLONNES', 'Onglet ' + onglet + ' (source ' + txt(src['ID source']) + ') : colonnes manquantes : ' + manque.join(', ') + '.');
    }
    return { onglet: onglet, position: position, lignes: donnees.rows };
  }

  // Droits de lecture : global ou conditions évaluables (le calendrier d'un accès n'est pas une condition de lecture).
  // Renvoie autorise(entite, codeTc, codeProduit). Chaque condition d'un accès doit être évaluable :
  //  - entité, code TC : directement ;
  //  - département, territoire, bassin, plateforme : par le référentiel des TC (code TC obligatoire) ;
  //  - marché : par le catalogue des produits (code produit obligatoire).
  // Une condition qu'on ne peut pas évaluer avec les informations passées refuse la ligne (jamais d'ouverture par défaut).
  function filtreAcces(actor) {
    var regles = [];
    actor.roles.forEach(function (r) {
      var profil = actor.profils[r.role];
      if (!profil || !profil.consultation) return;
      if (r.perimetre.global) { regles.push({ tout: true }); return; }
      var p = r.perimetre;
      var conds = ['codeTc', 'entite', 'departement', 'territoire', 'bassin', 'plateforme', 'marche'].filter(function (k) { return !!p[k]; });
      if (!conds.length) return;
      regles.push({ p: p, conds: conds });
    });
    var tc = null, cat = null;
    var infosTC = function () { return tc || (tc = Referentiel.charger(actor)); };
    var catalogue = function () { return cat || (cat = Catalogue.lire(actor)); };
    return function (entite, codeTc, codeProduit) {
      return regles.some(function (g) {
        if (g.tout) return true;
        return g.conds.every(function (k) {
          if (k === 'entite') return g.p.entite === norm(entite);
          if (k === 'codeTc') return !!txt(codeTc) && g.p.codeTc === norm(codeTc);
          if (k === 'marche') {
            if (!txt(codeProduit)) return false;
            var c = catalogue()[txt(codeProduit)];
            return !!c && norm(c.marche) === g.p.marche;
          }
          if (!txt(codeTc)) return false;
          var info = infosTC()[txt(codeTc)];
          return !!info && norm(info[k]) === g.p[k];
        });
      });
    };
  }

  // Corrections actives de CORRECTIONS_HISTO (SORTIE). La dernière ligne active gagne pour un même article et une même année.
  // La période se saisit au niveau du PAC : l'année est celle de « Semaine debut » (AAAA-Sss).
  function lireCorrections(actor) {
    var idSortie;
    try { idSortie = Versions.contexte(actor).idSortie; } catch (e) { if (e && e.code === 'SORTIE_NON_CONFIGUREE') return []; throw e; }
    var vues = {};
    Store.read(idSortie, 'CORRECTIONS_HISTO').rows.forEach(function (r) {
      if (norm(r.Statut) !== 'ACTIVE') return;
      var annee = txt(r['Semaine debut']).slice(0, 4);
      var corrigee = Number(r['Qte corrigee']);
      if (!/^\d{4}$/.test(annee) || !txt(r['Code produit']) || !txt(r.Entite) || !isFinite(corrigee) || txt(r['Qte corrigee']) === '') return;
      vues[norm(r.Entite) + '|' + txt(r['Code produit']) + '|' + annee] = {
        id: txt(r['ID correction']), code: txt(r['Code produit']), entite: txt(r.Entite), annee: annee, corrigee: corrigee, type: norm(r.Type)
      };
    });
    return Object.keys(vues).map(function (k) { return vues[k]; });
  }

  // Lecture et agrégation des onglets (partie lourde, sans les corrections). Résultat sérialisable, donc mis en cache.
  function collecter(liste, autorise) {
    var toutesAnnees = {};
    var totaux = {};
    var articles = {};
    var tcVus = {};
    var infos = [];
    var avertissements = [];

    liste.forEach(function (src) {
      var entite = txt(src.Entite) || txt(src['ID source']);
      var info = { source: txt(src['ID source']), entite: entite, pac: txt(src.PAC), annees: [], lignes: 0 };
      annees(src).forEach(function (annee) {
        var o = lireOnglet(src, annee);
        toutesAnnees[annee] = true;
        info.annees.push(annee);
        var tk = entite + '|' + annee;
        var t = totaux[tk] = totaux[tk] || { entite: entite, annee: annee, lignes: 0, qte: 0, ha: 0, montant: 0 };
        var articlesAnnee = {};
        var sansCode = 0;
        o.lignes.forEach(function (l) {
          var code = codeTexte(l[o.position.code]);
          if (!code) { sansCode++; return; }
          var codeTc = codeTexte(l[o.position.codeTc]);
          if (!autorise(entite, codeTc, code)) return;
          var qte = nombre(l[o.position.qte]), ha = nombre(l[o.position.ha]), mt = nombre(l[o.position.mt]);
          t.lignes++; t.qte += qte; t.ha += ha; t.montant += mt;
          info.lignes++;
          tcVus[entite + '|' + annee + '|' + codeTc] = true;
          articlesAnnee[code] = true;
          var ak = entite + '|' + code;
          var a = articles[ak] = articles[ak] || { code: code, libelle: '', entite: entite, parAnnee: {} };
          if (!a.libelle) a.libelle = txt(l[o.position.libelle]);
          var pa = a.parAnnee[annee] = a.parAnnee[annee] || { qte: 0, ha: 0, mt: 0, tc: 0 };
          pa.qte += qte; pa.ha += ha; pa.mt += mt; pa.tc++;
        });
        t.articles = Object.keys(articlesAnnee).length;
        if (sansCode) avertissements.push(o.onglet + ' (' + entite + ') : ' + sansCode + ' ligne(s) sans code produit ignorée(s).');
      });
      infos.push(info);
    });

    var an = Object.keys(toutesAnnees).sort();
    var derniere = an[an.length - 1];
    var totauxListe = Object.keys(totaux).map(function (k) {
      var t = totaux[k];
      t.tc = Object.keys(tcVus).filter(function (c) { return c.indexOf(t.entite + '|' + t.annee + '|') === 0; }).length;
      return t;
    }).sort(function (a, b) { return a.entite < b.entite ? -1 : a.entite > b.entite ? 1 : (a.annee < b.annee ? -1 : 1); });
    return { toutesAnnees: toutesAnnees, totaux: totaux, articles: articles, infos: infos, avertissements: avertissements, an: an, derniere: derniere, totauxListe: totauxListe };
  }

  // toutVoir : ignore le périmètre (réservé aux calculs faits par un rôle au périmètre global).
  // brut : n'applique pas les corrections de l'historique (pour mesurer ce qu'une correction change).
  function agreger(actor, toutVoir, brut) {
    Auth.requireCap(actor, 'consultation');
    var campagne = txt(actor.campagne['ID campagne']);
    var liste = sources(campagne);
    if (!liste.length) {
      throw new AppError('HISTO_SANS_SOURCE', messageSansSource(campagne));
    }
    var base;
    // Un rôle au périmètre global voit toutes les lignes : même résultat que toutVoir, donc cache partagé.
    var global = toutVoir || Auth.inScope(actor, 'consultation', {});
    if (global) {
      var cle = Cache.cle('histo', campagne + '|' + liste.map(function (r) { return [txt(r['ID source']), txt(r['ID fichier']), txt(r.Onglet), txt(r.Annees), txt(r.Entite)].join('~'); }).join('|'));
      base = Cache.lire(cle);
      if (!base) { base = collecter(liste, function () { return true; }); Cache.ecrire(cle, base); }
    } else {
      base = collecter(liste, filtreAcces(actor));
    }
    var toutesAnnees = base.toutesAnnees, totaux = base.totaux, articles = base.articles, infos = base.infos, avertissements = base.avertissements;
    var an = base.an, derniere = base.derniere, totauxListe = base.totauxListe;

    // Corrections de l'historique : elles remplacent la quantité d'un article pour une année. Elles ne s'appliquent que si
    // l'acteur voit toutes les lignes (global) : un TC ne voit qu'une partie des ventes d'un article.
    var nbCorrections = 0;
    if (!brut && global) {
      var index = {};
      Object.keys(articles).forEach(function (k) { index[norm(k)] = k; });
      lireCorrections(actor).forEach(function (cr) {
        if (!toutesAnnees[cr.annee]) return;
        var ak = index[norm(cr.entite + '|' + cr.code)];
        var a = ak ? articles[ak] : null;
        if (!a) {
          ak = cr.entite + '|' + cr.code;
          a = articles[ak] = { code: cr.code, libelle: '', entite: cr.entite, parAnnee: {} };
          index[norm(ak)] = ak;
        }
        var p = a.parAnnee[cr.annee] || (a.parAnnee[cr.annee] = { qte: 0, ha: 0, mt: 0, tc: 0 });
        var facteur = p.qte > 0 ? cr.corrigee / p.qte : 1;
        var t = totauxListe.filter(function (x) { return norm(x.entite) === norm(cr.entite) && x.annee === cr.annee; })[0];
        if (t) t.deltaQte = (t.deltaQte || 0) + (cr.corrigee - p.qte);
        p.brute = { qte: p.qte, ha: p.ha, mt: p.mt };
        p.qte = cr.corrigee; p.ha = p.ha * facteur; p.mt = p.mt * facteur;
        p.corrige = { id: cr.id, type: cr.type };
        nbCorrections++;
      });
    }

    var tous = Object.keys(articles).map(function (k) { return articles[k]; });
    var valeur = function (a) { var p = a.parAnnee[derniere]; return p ? p.mt : 0; };
    tous.sort(function (a, b) { return valeur(b) - valeur(a) || (a.code < b.code ? -1 : 1); });
    return { annees: an, sources: infos, totaux: totauxListe, articles: tous, avertissements: avertissements, nbCorrections: nbCorrections };
  }

  function synthese(actor) {
    var d = agreger(actor, false);
    return {
      annees: d.annees,
      sources: d.sources,
      totaux: d.totaux,
      articles: d.articles.slice(0, MAX_ARTICLES),
      nbArticles: d.articles.length,
      tronque: d.articles.length > MAX_ARTICLES,
      nbCorrections: d.nbCorrections,
      avertissements: d.avertissements
    };
  }

  // Contrôle de mise en service : chaque source active doit s'ouvrir avec ses onglets et ses colonnes.
  function verifier(campagne) {
    var res = [];
    var liste;
    try { liste = sources(campagne); } catch (e) { return [{ niveau: 'ERREUR', sujet: 'Historique PAC', detail: e.message }]; }
    if (!liste.length) return [{ niveau: 'ATTENTION', sujet: 'Historique PAC', detail: messageSansSource(campagne) }];
    liste.forEach(function (src) {
      var nom = txt(src['ID source']);
      try {
        annees(src).forEach(function (a) {
          var o = lireOnglet(src, a);
          res.push({ niveau: 'OK', sujet: 'Historique ' + nom, detail: o.onglet + ' : ' + o.lignes.length + ' ligne(s), colonnes reconnues.' });
        });
      } catch (e) {
        res.push({ niveau: 'ERREUR', sujet: 'Historique ' + nom, detail: e.message });
      }
    });
    return res;
  }

  return { sources: sources, filtre: filtreAcces, agreger: agreger, synthese: synthese, verifier: verifier, _nombre: nombre };
})();
