// Constantes, erreurs typées et petits utilitaires communs.

var SOP = {
  VERSION: '0.1.0',
  PROP_PARAM_ID: 'SOP_PARAM_ID',
  PROP_ADMINS: 'SOP_ADMINS',
  FUSEAU: 'Europe/Paris',
  FICHIERS: { PARAM: 'PARAMETRES_SOP', SORTIE: 'SORTIE_SOP' },
  ROLES: ['ADMIN', 'PREV', 'RM', 'AM', 'RT', 'CD', 'RBP', 'TC', 'SUPPLY'],
  VERSION_TYPES: ['PREV_TC', 'STATISTIQUE', 'ARBITREE', 'VALIDEE'],
  // Capacité nécessaire pour créer une version de chaque type. Corriger sa propre prévision (TC, RT) ne suffit pas à créer une version.
  TYPE_CAP: { PREV_TC: 'configuration', STATISTIQUE: 'arbitrage', ARBITREE: 'arbitrage', VALIDEE: 'validation' },
  // Colonne de PROFILS pour chaque capacité.
  CAPS: {
    consultation: 'Consultation',
    correctionPrevision: 'Correction prevision',
    arbitrage: 'Arbitrage',
    validation: 'Validation',
    correctionHistorique: 'Correction historique',
    validationGamme: 'Validation gamme',
    voirBudget: 'Voir budget',
    configuration: 'Configuration'
  },
  // Colonnes de ACCES qui restreignent le périmètre, et clé correspondante dans la cible d'un contrôle.
  PERIMETRE: {
    codeTc: 'Code technicien',
    entite: 'Entite',
    calendrier: 'Calendrier',
    departement: 'Departement TC',
    territoire: 'Territoire TC',
    bassin: 'Bassin TC',
    marche: 'Marche',
    plateforme: 'Plateforme'
  }
};

function AppError(code, message) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.stack = (new Error(message)).stack;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function norm(v) { return txt(v).toUpperCase(); }
function yes(v) { return norm(v) === 'OUI'; }
function pad3(n) { return ('000' + n).slice(-3); }
function maintenant() { return Utilities.formatDate(new Date(), SOP.FUSEAU, "yyyy-MM-dd'T'HH:mm:ss"); }

// Exécute fn sous verrou de script. Les écritures sont sérialisées comme dans EurePrev.
function sousVerrou(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new AppError('VERROU_OCCUPE', 'Une autre sauvegarde est en cours. Réessayez dans quelques secondes.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Version du contrat des onglets PUBLICATION_* lus par les autres applications. À incrémenter si une colonne change.
SOP.CONTRAT_VERSION = '1.0';
