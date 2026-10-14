// Charge le code Apps Script dans un contexte Node avec un double en mémoire de Google Sheets.
// Les classeurs de test sont construits à partir des en-têtes de modeles/ (donc de la structure réelle).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..');
const FICHIERS_CODE = ['Structure.gs', 'Config.gs', 'Cache.gs', 'Store.gs', 'Params.gs', 'Auth.gs', 'Journal.gs', 'Versions.gs', 'Histo.gs', 'Ajustements.gs', 'Cadencage.gs', 'PrevTC.gs', 'Stocks.gs', 'Publication.gs', 'Previsions.gs', 'Dashboard.gs', 'Sources.gs', 'Controles.gs', 'Setup.gs', 'Code.gs'];

function enTetes(dossier, tab) {
  const ligne = fs.readFileSync(path.join(RACINE, 'modeles', dossier, tab + '.csv'), 'utf8').split('\n')[0].replace(/\r$/, '');
  // Les en-têtes ne contiennent ni virgule ni guillemet.
  return ligne.split(',');
}

function creerFeuille(headers) {
  const data = [headers.slice()];
  const formats = [];
  return {
    _data: data,
    _formats: formats,
    getLastColumn() { return data[0].length; },
    getLastRow() { return data.length; },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = data[r - 1 + i] || [];
            const o = [];
            for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(o);
          }
          return out;
        },
        setValues(v) {
          for (let i = 0; i < nr; i++) {
            while (data.length < r + i) data.push([]);
            for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j];
          }
        },
        setValue(v) { this.setValues([[v]]); },
        clearContent() { data.splice(r - 1, nr); },
        setNumberFormat(f) { formats.push({ r, c, nr, nc, f }); }
      };
    }
  };
}

function creerClasseur(dossier, groupe) {
  const feuilles = {};
  Object.keys(groupe).forEach((tab) => { feuilles[tab] = creerFeuille(groupe[tab]); });
  return { getSheetByName: (n) => feuilles[n] || null, _feuilles: feuilles };
}

function creerEnv() {
  const props = {};
  const cache = {};
  const env = { utilisateur: '', proprietaire: 'admin@eureden.com', classeurs: {}, ouvertures: {}, verrouAttente: 0 };
  const sandbox = {
    console: { log() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Date, Error,
    Session: { getActiveUser: () => ({ getEmail: () => env.utilisateur }), getEffectiveUser: () => ({ getEmail: () => env.proprietaire }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { env.verrouAttente++; }, releaseLock() { env.verrouAttente--; } }) },
    Utilities: { formatDate: () => new Date().toISOString().slice(0, 19) },
    SpreadsheetApp: { openById: (id) => { if (!env.classeurs[id]) throw new Error('Classeur inconnu ' + id); env.ouvertures[id] = (env.ouvertures[id] || 0) + 1; return env.classeurs[id]; } },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in cache) o[k] = cache[k]; }); return o; },
      put: (k, v) => { if (Buffer.byteLength(String(v)) > 100 * 1024) throw new Error('Argument too large'); cache[k] = String(v); },
      putAll: (o) => { Object.keys(o).forEach((k) => { if (Buffer.byteLength(String(o[k])) > 100 * 1024) throw new Error('Argument too large'); cache[k] = String(o[k]); }); },
      remove: (k) => { delete cache[k]; }
    }) },
    HtmlService: {}
  };
  const ctx = vm.createContext(sandbox);
  FICHIERS_CODE.forEach((f) => vm.runInContext(fs.readFileSync(path.join(RACINE, 'code', f), 'utf8'), ctx, { filename: f }));
  const S = vm.runInContext('SOP_STRUCTURE', ctx);

  env.ctx = ctx;
  // Les objets sont recopiés pour sortir du contexte vm (sinon deepStrictEqual compare des prototypes différents).
  env.run = (expr) => { const v = vm.runInContext(expr, ctx); return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; };
  env.props = props;
  env.cache = cache;
  env.nouvelleExecution = () => env.run('Store.reset()');
  env.classeurs.PARAM_FICHIER_TEST_00001 = creerClasseur('PARAMETRES_SOP', S.PARAMETRES_SOP);
  env.classeurs.SORTIE1 = creerClasseur('SORTIE_SOP', S.SORTIE_SOP);
  // Les en-têtes des modèles CSV doivent correspondre à la structure du code.
  Object.keys(S.PARAMETRES_SOP).forEach((t) => {
    const attendu = enTetes('PARAMETRES_SOP', t).join('|');
    if (attendu !== S.PARAMETRES_SOP[t].join('|')) throw new Error('CSV et Structure.gs divergent : ' + t);
  });
  Object.keys(S.SORTIE_SOP).forEach((t) => {
    const attendu = enTetes('SORTIE_SOP', t).join('|');
    if (attendu !== S.SORTIE_SOP[t].join('|')) throw new Error('CSV et Structure.gs divergent : ' + t);
  });

  env.feuille = (id, tab) => env.classeurs[id]._feuilles[tab];
  env.semer = (id, tab, objets) => {
    const f = env.feuille(id, tab);
    const h = f._data[0];
    objets.forEach((o) => f._data.push(h.map((c) => (o[c] === undefined ? '' : o[c]))));
  };
  env.lignes = (id, tab) => {
    const f = env.feuille(id, tab);
    const h = f._data[0];
    return f._data.slice(1).map((r) => { const o = {}; h.forEach((c, i) => { o[c] = r[i] === undefined ? '' : r[i]; }); return o; });
  };
  // Classeur externe de test : { onglet: [entetes, ligne, ligne...] }.
  env.ajouterClasseur = (id, onglets) => {
    const feuilles = {};
    Object.keys(onglets).forEach((n) => {
      const f = creerFeuille(onglets[n][0]);
      onglets[n].slice(1).forEach((r) => f._data.push(r));
      feuilles[n] = f;
    });
    env.classeurs[id] = { getSheetByName: (n) => feuilles[n] || null, _feuilles: feuilles };
  };
  env.moi = (email) => { env.utilisateur = email; };
  return env;
}

// Jeu de données de base : une campagne ouverte, les profils par défaut, quelques accès.
function creerEnvStandard() {
  const env = creerEnv();
  env.props.SOP_PARAM_ID = 'PARAM_FICHIER_TEST_00001';
  env.semer('PARAM_FICHIER_TEST_00001', 'REGLAGES', [{ Cle: 'DOMAINES', Valeur: 'eureden.com' }]);
  env.semer('PARAM_FICHIER_TEST_00001', 'CAMPAGNES', [{ 'ID campagne': 'SOP_2027_PAC2', Libelle: 'PAC 2 2027', Type: 'PAC2', Statut: 'OUVERTE', 'ID sortie': 'SORTIE1', Selectionnee: 'OUI' }]);
  const non = 'NON', oui = 'OUI';
  const profil = (Role, c, cp, ar, va, ch, vg, vb, co, perim) => ({ Role, Consultation: c, 'Correction prevision': cp, Arbitrage: ar, Validation: va, 'Correction historique': ch, 'Validation gamme': vg, 'Voir budget': vb, Configuration: co, 'Perimetre obligatoire': perim });
  env.semer('PARAM_FICHIER_TEST_00001', 'PROFILS', [
    profil('ADMIN', oui, oui, oui, oui, oui, oui, oui, oui, 'GLOBAL'),
    profil('PREV', oui, oui, oui, non, oui, non, oui, non, 'GLOBAL'),
    profil('RM', oui, non, non, non, non, oui, non, non, 'Marche'),
    profil('RT', oui, oui, non, non, non, non, non, non, 'Territoire'),
    profil('TC', oui, oui, non, non, non, non, non, non, 'Code TC'),
    profil('SUPPLY', oui, non, non, non, non, non, non, non, 'GLOBAL ou périmètre explicite')
  ]);
  const acces = (email, Role, extra) => Object.assign({ 'ID campagne': 'SOP_2027_PAC2', 'Email Google': email, Role, Actif: 'OUI' }, extra || {});
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', [
    acces('admin@eureden.com', 'ADMIN', { Global: 'OUI' }),
    acces('guillaume@eureden.com', 'PREV', { Global: 'OUI' }),
    acces('rt.argoat@eureden.com', 'RT', { 'Territoire TC': 'ARGOAT CENTRE BRETAGNE' }),
    acces('tc.sans.code@eureden.com', 'TC', {}),
    acces('tc.ok@eureden.com', 'TC', { 'Code technicien': '199405', Entite: 'Coop EUREDEN', Calendrier: 'N' }),
    acces('supply@eureden.com', 'SUPPLY', { Entite: '*' }),
    acces('inactif@eureden.com', 'PREV', { Global: 'OUI', Actif: 'NON' }),
    acces('rm.engrais@eureden.com', 'RM', { Marche: 'ENGRAIS' })
  ]);
  return env;
}

module.exports = { creerEnv, creerEnvStandard };
