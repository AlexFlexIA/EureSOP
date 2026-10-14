// Mise en service, à lancer depuis l'éditeur Apps Script par le compte Eureden qui déploie.
//
// Ces fonctions n'ont pas de _ final : Apps Script masque dans la liste « Exécuter » les fonctions dont le nom en porte un.
// Elles restent appelables par google.script.run depuis la page, donc chacune vérifie d'abord que l'appelant est le
// compte qui déploie. Un autre utilisateur de l'organisation est refusé.

function exigerProprietaire_() {
  var actif = txt(Session.getActiveUser().getEmail()).toLowerCase();
  var proprietaire = txt(Session.getEffectiveUser().getEmail()).toLowerCase();
  if (!actif || actif !== proprietaire) {
    throw new Error('Fonction réservée au compte qui déploie l\'application.');
  }
}

function definirParametres_(id) {
  exigerProprietaire_();
  if (!txt(id) || txt(id).indexOf('COLLER_ICI') === 0) throw new Error('Renseignez l\'ID du fichier PARAMETRES_SOP dans Setup.gs avant de lancer cette fonction.');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(txt(id))) throw new Error('Ce n\'est pas un ID de fichier Google Sheets : copiez la partie de l\'URL entre /d/ et /edit.');
  PropertiesService.getScriptProperties().setProperty(SOP.PROP_PARAM_ID, txt(id));
  console.log('Fichier de paramètres enregistré : ' + txt(id));
}

function ajouterAdministrateur_() {
  exigerProprietaire_();
  var email = txt(Session.getActiveUser().getEmail()).toLowerCase();
  var props = PropertiesService.getScriptProperties();
  var liste = txt(props.getProperty(SOP.PROP_ADMINS)).split(',').map(txt).filter(Boolean);
  if (liste.indexOf(email) < 0) liste.push(email);
  props.setProperty(SOP.PROP_ADMINS, liste.join(','));
  console.log('Administrateurs initiaux : ' + liste.join(', '));
  return liste;
}

// Étape 1 : coller l'ID du fichier PARAMETRES_SOP (la partie de l'URL entre /d/ et /edit), puis lancer cette fonction.
function configurerParametres() {
  var ID_PARAMETRES = 'COLLER_ICI_L_ID_DU_FICHIER_PARAMETRES_SOP';
  definirParametres_(ID_PARAMETRES);
}

// Étape 2 : enregistre le compte courant comme administrateur initial. Ne crée aucune autre adresse.
function installerDepuisEditeur() {
  ajouterAdministrateur_();
}

// Étape 3 : lance les contrôles de mise en service et les affiche dans le journal d'exécution.
function verifierInstallation() {
  exigerProprietaire_();
  var resultats;
  try {
    resultats = Controles.run(Auth.resolve());
  } catch (e) {
    if (e && e.code) {
      console.log('[' + e.code + '] ' + e.message);
      throw new Error(e.message);
    }
    throw e;
  }
  resultats.forEach(function (r) { console.log('[' + r.niveau + '] ' + r.sujet + ' : ' + r.detail); });
  return resultats.length;
}
