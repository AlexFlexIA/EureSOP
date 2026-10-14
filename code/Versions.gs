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

  return { list: list, create: create, verrouiller: verrouiller, contexte: contexte, lignesCampagne: lignesCampagne, creerInterne: creerInterne };
})();
