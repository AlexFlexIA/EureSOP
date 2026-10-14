// Mise en service, à lancer depuis l'éditeur Apps Script par le compte Eureden qui déploie.

// Étape 1 : coller l'ID du fichier PARAMETRES_SOP (la partie de l'URL entre /d/ et /edit), puis lancer cette fonction.
function configurerParametres_() {
  var ID_PARAMETRES = 'COLLER_ICI_L_ID_DU_FICHIER_PARAMETRES_SOP';
  if (ID_PARAMETRES.indexOf('COLLER_ICI') === 0) throw new Error('Renseignez ID_PARAMETRES dans Setup.gs avant de lancer cette fonction.');
  PropertiesService.getScriptProperties().setProperty(SOP.PROP_PARAM_ID, ID_PARAMETRES);
  console.log('Fichier de paramètres enregistré : ' + ID_PARAMETRES);
}

// Étape 2 : enregistre le compte courant comme administrateur initial. Ne crée aucune autre adresse.
function installerDepuisEditeur_() {
  var email = txt(Session.getActiveUser().getEmail()).toLowerCase();
  if (!email) throw new Error('Adresse introuvable : lancez la fonction avec votre compte Eureden.');
  var props = PropertiesService.getScriptProperties();
  var liste = txt(props.getProperty(SOP.PROP_ADMINS)).split(',').map(txt).filter(Boolean);
  if (liste.indexOf(email) < 0) liste.push(email);
  props.setProperty(SOP.PROP_ADMINS, liste.join(','));
  console.log('Administrateurs initiaux : ' + liste.join(', '));
}
