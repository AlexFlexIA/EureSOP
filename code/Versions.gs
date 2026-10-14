// Versions de la campagne : liste, création, verrouillage.
// Une version est un jeu complet de prévisions. Une seule version est COURANTE par scénario.

var Versions = (function () {
  function contexte(acteur) {
    var idCampagne = txt(acteur.campagne['ID campagne']);
    return { idCampagne: idCampagne, idSortie: Params.idSortie(acteur.campagne) };
  }

  function lignesCampagne(ctx) {
    return Store.read(ctx.idSortie, 'VERSIONS').rows.filter(function (r) { return txt(r['ID campagne']) === ctx.idCampagne; });
  }

  function vue(r) {
    return {
      id: txt(r['ID version']),
      numero: Number(r.Numero),
      type: norm(r.Type),
      scenario: txt(r.Scenario),
      libelle: txt(r.Libelle),
      statut: norm(r.Statut),
      dateReunion: txt(r['Date reunion S&OP']),
      creePar: txt(r['Cree par']),
      creeLe: txt(r['Cree le']),
      verrouillee: yes(r.Verrouillee),
      commentaire: txt(r.Commentaire)
    };
  }

  function list(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = contexte(acteur);
    return lignesCampagne(ctx).map(vue).sort(function (a, b) { return a.numero - b.numero; });
  }

  // Crée la version : archive la courante du même scénario, ajoute la ligne, journalise.
  // Sans contrôle de droits, sans verrou, sans reçu : l'appelant s'en charge.
  function creerInterne(acteur, ctx, v, idOperation) {
    var lignes = lignesCampagne(ctx);
    var numero = lignes.reduce(function (m, r) { return Math.max(m, Number(r.Numero) || 0); }, 0) + 1;
    var id = 'V' + pad3(numero);
    lignes.filter(function (r) { return norm(r.Scenario) === v.scenario && norm(r.Statut) === 'COURANTE'; }).forEach(function (r) {
      Store.updateRow(ctx.idSortie, 'VERSIONS', r._row, { 'Statut': 'ARCHIVEE' });
      Journal.log(ctx.idSortie, acteur, 'VERSION_ARCHIVEE', txt(r['ID version']), 'COURANTE', 'ARCHIVEE', 'Remplacée par ' + id, idOperation);
    });
    Store.append(ctx.idSortie, 'VERSIONS', [{
      'ID version': id,
      'ID campagne': ctx.idCampagne,
      'Numero': numero,
      'Type': v.type,
      'Scenario': v.scenario,
      'Libelle': v.libelle,
      'Statut': 'COURANTE',
      'Date reunion S&OP': txt(v.dateReunion),
      'Version coefficients': '',
      'Cree par': acteur.email,
      'Cree le': maintenant(),
      'Verrouillee': v.type === 'VALIDEE' ? 'OUI' : 'NON',
      'Commentaire': txt(v.commentaire)
    }]);
    Journal.log(ctx.idSortie, acteur, 'VERSION_CREEE', id, '', v.type + ' / ' + v.scenario, v.libelle, idOperation);
    return { idVersion: id, numero: numero };
  }

  function create(acteur, entree, idOperation) {
    Auth.requireCap(acteur, 'consultation');
    var type = norm(entree && entree.type);
    if (SOP.VERSION_TYPES.indexOf(type) < 0) throw new AppError('VERSION_TYPE_INVALIDE', 'Type de version inconnu : ' + txt(entree && entree.type));
    Auth.requireCap(acteur, SOP.TYPE_CAP[type]);
    Auth.requireWritable(acteur);
    var libelle = txt(entree.libelle);
    if (!libelle) throw new AppError('LIBELLE_OBLIGATOIRE', 'Le libellé de la version est obligatoire.');
    var scenario = norm(entree.scenario) || 'BASE';
    var ctx = contexte(acteur);

    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        return creerInterne(acteur, ctx, { type: type, scenario: scenario, libelle: libelle, dateReunion: entree.dateReunion, commentaire: entree.commentaire }, idOperation);
      });
    });
  }

  function courante(ctx) {
    return lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
  }

  // Validation par le comité : crée une version VALIDEE (verrouillée), fige la quantité retenue dans « Qte validee »
  // de PREVISION et garde la photo dans INSTANTANES. Seule une version arbitrée peut être validée.
  function valider(acteur, entree, idOperation) {
    entree = entree || {};
    Auth.requireCap(acteur, SOP.TYPE_CAP.VALIDEE);
    if (!Auth.inScope(acteur, SOP.TYPE_CAP.VALIDEE, {})) throw new AppError('CAPACITE_REFUSEE', 'La validation porte sur tous les articles : elle demande un périmètre global.');
    Auth.requireWritable(acteur);
    var ctx = contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var cour = courante(ctx);
        if (!cour) throw new AppError('VERSION_INCONNUE', 'Aucune version courante à valider.');
        if (yes(cour.Verrouillee)) throw new AppError('VERSION_DEJA_VERROUILLEE', 'La version ' + txt(cour['ID version']) + ' est déjà verrouillée.');
        if (norm(cour.Type) !== 'ARBITREE') throw new AppError('VERSION_NON_ARBITREE', 'Seule une version arbitrée peut être validée : enregistrez d\'abord la reprévision du comité.');
        var lues = Store.read(ctx.idSortie, 'PREVISION').rows;
        if (!lues.length) throw new AppError('PREVISION_VIDE', 'La prévision est vide.');
        var version = creerInterne(acteur, ctx, { type: 'VALIDEE', scenario: 'BASE', libelle: txt(entree.libelle) || ('Validée : ' + txt(cour.Libelle)), dateReunion: entree.dateReunion || txt(cour['Date reunion S&OP']), commentaire: entree.commentaire }, idOperation);
        var maintenantTxt = maintenant();
        var lignes = [], photos = [], total = 0;
        lues.forEach(function (r) {
          var o = {};
          Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; });
          var retenue = txt(r['Qte arbitree']) !== '' ? Number(r['Qte arbitree']) : Number(r['Qte statistique']) || 0;
          o['Qte validee'] = retenue;
          o['Statut'] = 'VALIDEE';
          o['Version'] = version.idVersion;
          o['Modifie par'] = acteur.email;
          o['Modifie le'] = maintenantTxt;
          lignes.push(o);
          photos.push({ 'ID version': version.idVersion, 'ID ligne': txt(r['ID ligne']), 'Qte retenue': retenue });
          total += retenue;
        });
        Store.viderDonnees(ctx.idSortie, 'PREVISION');
        Store.append(ctx.idSortie, 'PREVISION', lignes);
        Store.append(ctx.idSortie, 'INSTANTANES', photos);
        Journal.log(ctx.idSortie, acteur, 'VERSION_VALIDEE', version.idVersion, txt(cour['ID version']), lignes.length + ' ligne(s)', txt(entree.commentaire), idOperation);
        var publie = null;
        if (typeof Publication !== 'undefined') publie = Publication.publier(acteur, ctx, version, lignes, idOperation);
        return { idVersion: version.idVersion, lignes: lignes.length, total: total, publication: publie };
      });
    });
  }

  // Écarts entre deux versions à partir des photos de INSTANTANES (quantité retenue par article et entité).
  function comparer(acteur, idA, idB) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = contexte(acteur);
    var versions = lignesCampagne(ctx);
    var trouver = function (id) {
      var v = versions.filter(function (r) { return txt(r['ID version']) === txt(id); })[0];
      if (!v) throw new AppError('VERSION_INCONNUE', 'Version ' + txt(id) + ' introuvable.');
      return vue(v);
    };
    var a = trouver(idA), b = trouver(idB);
    var autorise = Histo.filtre(acteur);
    var photos = { }; photos[a.id] = {}; photos[b.id] = {};
    Store.read(ctx.idSortie, 'INSTANTANES').rows.forEach(function (r) {
      var v = txt(r['ID version']);
      if (photos[v]) photos[v][txt(r['ID ligne'])] = Number(r['Qte retenue']) || 0;
    });
    var cles = {};
    Object.keys(photos[a.id]).forEach(function (k) { cles[k] = true; });
    Object.keys(photos[b.id]).forEach(function (k) { cles[k] = true; });
    var libelles = {};
    try { Histo.agreger(acteur, false).articles.forEach(function (x) { libelles[x.entite + '|' + x.code] = x.libelle; }); } catch (e) { /* codes seuls */ }
    var arr = function (x) { return Math.round(x * 1000) / 1000; };
    var tot = { a: 0, b: 0 }, lignes = [], modifiees = 0;
    Object.keys(cles).forEach(function (k) {
      var id; try { id = JSON.parse(k); } catch (e) { return; }
      var entite = id[1], code = id[2];
      if (!autorise(entite, '')) return;
      var va = photos[a.id][k] || 0, vb = photos[b.id][k] || 0;
      tot.a += va; tot.b += vb;
      if (arr(vb - va) !== 0) modifiees++;
      lignes.push({ entite: entite, code: code, libelle: libelles[entite + '|' + code] || '', a: va, b: vb, delta: arr(vb - va) });
    });
    lignes.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta) || (x.code < y.code ? -1 : 1); });
    return { a: a, b: b, totaux: { a: arr(tot.a), b: arr(tot.b), delta: arr(tot.b - tot.a) }, nbLignes: lignes.length, nbModifiees: modifiees, lignes: lignes.filter(function (l) { return l.delta !== 0; }).slice(0, 300) };
  }

  // Fige une version : elle ne pourra plus être modifiée. Réservé à la capacité de validation.
  function verrouiller(acteur, idVersion, idOperation) {
    Auth.requireCap(acteur, 'validation');
    Auth.requireWritable(acteur);
    var ctx = contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var r = lignesCampagne(ctx).filter(function (x) { return txt(x['ID version']) === txt(idVersion); })[0];
        if (!r) throw new AppError('VERSION_INCONNUE', 'Version ' + txt(idVersion) + ' introuvable.');
        if (yes(r.Verrouillee)) throw new AppError('VERSION_DEJA_VERROUILLEE', 'La version ' + txt(idVersion) + ' est déjà verrouillée.');
        Store.updateRow(ctx.idSortie, 'VERSIONS', r._row, { 'Verrouillee': 'OUI' });
        Journal.log(ctx.idSortie, acteur, 'VERSION_VERROUILLEE', txt(idVersion), 'NON', 'OUI', '', idOperation);
        return { idVersion: txt(idVersion) };
      });
    });
  }

  return { list: list, create: create, verrouiller: verrouiller, valider: valider, comparer: comparer, contexte: contexte, lignesCampagne: lignesCampagne, creerInterne: creerInterne };
})();
