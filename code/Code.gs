// Point d'entrée de la web app et fonctions appelées par le navigateur (google.script.run).
// Chaque fonction api* renvoie { ok: true, data } ou { ok: false, code, message }.

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.version = SOP.VERSION;
  return t.evaluate()
    .setTitle('Eureden S&OP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

function reponse_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    if (err && err.code) return { ok: false, code: err.code, message: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, code: 'ERREUR_INTERNE', message: 'Erreur interne. Réessayez, puis contactez l\'administrateur.' };
  }
}

function apiDemarrage() {
  return reponse_(function () {
    var a = Auth.resolve();
    return {
      version: SOP.VERSION,
      utilisateur: a.email,
      campagne: {
        id: txt(a.campagne['ID campagne']),
        libelle: txt(a.campagne.Libelle),
        type: txt(a.campagne.Type),
        anneePrevision: Number(a.campagne['Annee prevision']) || 0,
        statut: norm(a.campagne.Statut)
      },
      roles: a.roles.map(function (r) { return r.role; }),
      droits: a.caps
    };
  });
}

function apiVersions() {
  return reponse_(function () { return Versions.list(Auth.resolve()); });
}

function apiCreerVersion(entree, idOperation) {
  return reponse_(function () { return Versions.create(Auth.resolve(), entree, idOperation); });
}

function apiVerrouillerVersion(idVersion, idOperation) {
  return reponse_(function () { return Versions.verrouiller(Auth.resolve(), idVersion, idOperation); });
}

function apiControles() {
  return reponse_(function () { return Controles.run(Auth.resolve()); });
}

function apiHistorique() {
  return reponse_(function () { return Histo.synthese(Auth.resolve()); });
}

function apiPrevision() {
  return reponse_(function () { return Previsions.courante(Auth.resolve()); });
}

function apiCalculerStatistique(entree, idOperation) {
  return reponse_(function () { return Previsions.calculer(Auth.resolve(), entree || {}, idOperation); });
}

function apiEssaiPonderation() {
  return reponse_(function () { return Previsions.essai(Auth.resolve()); });
}
