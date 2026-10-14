// Point d'entrée de la web app et fonctions appelées par le navigateur (google.script.run).
// Le navigateur appelle api(nom, arguments, idCampagne) : la campagne choisie par l'utilisateur voyage avec chaque appel et
// le serveur recalcule l'identité, les rôles et le périmètre pour cette campagne. Chaque réponse est { ok: true, data }
// ou { ok: false, code, message }.

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

// Appels autorisés depuis le navigateur. Chaque fonction reçoit l'acteur résolu pour la campagne et la liste d'arguments.
var API_ = {
  demarrage: function (a) {
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
      baseTc: norm(Params.reglages().BASE_ARBITRAGE) === 'TC',
      seuilEcart: (function () { try { return Dashboard.seuil(); } catch (e) { return 15; } })(),
      entites: (function () { try { return Histo.sources(txt(a.campagne['ID campagne'])).map(function (r) { return txt(r.Entite); }).filter(Boolean); } catch (e) { return []; } })(),
      campagnes: a.campagnes.map(function (c) { return { id: txt(c['ID campagne']), libelle: txt(c.Libelle) || txt(c['ID campagne']), type: norm(c.Type), statut: norm(c.Statut) }; }),
      roles: a.roles.map(function (r) { return r.role; }),
      droits: a.caps
    };
  },
  versions: function (a) { return Versions.list(a); },
  creerVersion: function (a, args) { return Versions.create(a, args[0], args[1]); },
  verrouillerVersion: function (a, args) { return Versions.verrouiller(a, args[0], args[1]); },
  validerVersion: function (a, args) { return Versions.valider(a, args[0], args[1]); },
  comparerVersions: function (a, args) { return Versions.comparer(a, args[0], args[1]); },
  cadencage: function (a) { return Cadencage.synthese(a); },
  sauverCoefficients: function (a, args) { return Cadencage.sauvegarder(a, args[0], args[1]); },
  supprimerCoefficients: function (a, args) { return Cadencage.supprimer(a, args[0], args[1], args[2]); },
  validerCoefficients: function (a, args) { return Cadencage.valider(a, args[0], args[1], args[2]); },
  republier: function (a, args) { return Publication.republier(a, args[0]); },
  stocks: function (a) { return Stocks.projeter(a); },
  actualiser: function (a) { Auth.requireCap(a, 'consultation'); return Cache.actualiser(); },
  fiabiliteReelle: function (a) { return Previsions.fiabiliteReelle(a); },
  journal: function (a, args) { return Journal.lire(a, args[0]); },
  controles: function (a) { return Controles.run(a); },
  sources: function (a) { return Sources.etat(a); },
  tableauDeBord: function (a) { return Dashboard.synthese(a); },
  historique: function (a) { return Histo.synthese(a); },
  prevision: function (a) { return Previsions.courante(a); },
  calculerStatistique: function (a, args) { return Previsions.calculer(a, args[0] || {}, args[1]); },
  arbitrer: function (a, args) { return Previsions.arbitrer(a, args[0] || {}, args[1]); },
  reprevision: function (a, args) { return Previsions.reprevision(a, args[0] || {}, args[1]); },
  exportPrevision: function (a) { var d = Previsions.chargerCourante(a); return { version: d.version, anneeReference: d.anneeReference, articles: d.articles }; },
  essaiPonderation: function (a) { return Previsions.essai(a); },
  ajustements: function (a) { return Ajustements.lister(a); },
  ajouterAjustement: function (a, args) { return Ajustements.creer(a, args[0], args[1]); },
  annulerAjustement: function (a, args) { return Ajustements.annuler(a, args[0], args[1], args[2]); }
};

function api(nom, args, idCampagne) {
  return reponse_(function () {
    var f = Object.prototype.hasOwnProperty.call(API_, nom) ? API_[nom] : null;
    if (!f) throw new AppError('API_INCONNUE', 'Appel inconnu : ' + txt(nom).slice(0, 40) + '.');
    return f(Auth.resolve(idCampagne), Array.isArray(args) ? args : []);
  });
}

// Fonctions historiques, conservées pour les tests et les appels directs.
function apiDemarrage(idCampagne) { return api('demarrage', [], idCampagne); }
function apiVersions() { return api('versions', []); }
function apiCreerVersion(entree, idOperation) { return api('creerVersion', [entree, idOperation]); }
function apiVerrouillerVersion(idVersion, idOperation) { return api('verrouillerVersion', [idVersion, idOperation]); }
function apiControles() { return api('controles', []); }
function apiHistorique() { return api('historique', []); }
function apiPrevision() { return api('prevision', []); }
function apiCalculerStatistique(entree, idOperation) { return api('calculerStatistique', [entree, idOperation]); }
function apiArbitrer(entree, idOperation) { return api('arbitrer', [entree, idOperation]); }
function apiEssaiPonderation() { return api('essaiPonderation', []); }
function apiAjustements() { return api('ajustements', []); }
function apiAjouterAjustement(entree, idOperation) { return api('ajouterAjustement', [entree, idOperation]); }
function apiAnnulerAjustement(nature, id, idOperation) { return api('annulerAjustement', [nature, id, idOperation]); }
