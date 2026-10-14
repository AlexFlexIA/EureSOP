// Tests du socle. Lancer : node tests/run.js
'use strict';
const assert = require('assert');
const { creerEnv, creerEnvStandard } = require('./harness');
const { ENT_HISTO, FICHIER_EUR, FICHIER_ONA, envHisto, envPrev } = require('./jeux');

const tests = [];
const test = (nom, fn) => tests.push({ nom, fn });

function erreur(env, expr) {
  try { env.run(expr); } catch (e) { return e.code || ('JS:' + e.message); }
  return null;
}

// ---------- Identité et accès ----------
test('identité absente : IDENTITE_INDISPONIBLE', () => {
  const env = creerEnvStandard(); env.moi('');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'IDENTITE_INDISPONIBLE');
});
test('domaine non autorisé : DOMAINE_REFUSE', () => {
  const env = creerEnvStandard(); env.moi('guillaume@gmail.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'DOMAINE_REFUSE');
});
test('domaine qui finit pareil mais n\'est pas le bon : refusé', () => {
  const env = creerEnvStandard(); env.moi('x@faux-eureden.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'DOMAINE_REFUSE');
});
test('adresse inconnue : ACCES_REFUSE', () => {
  const env = creerEnvStandard(); env.moi('inconnu@eureden.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'ACCES_REFUSE');
});
test('accès inactif : ACCES_REFUSE', () => {
  const env = creerEnvStandard(); env.moi('inactif@eureden.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'ACCES_REFUSE');
});
test('l\'adresse est lue sans tenir compte de la casse', () => {
  const env = creerEnvStandard(); env.moi('Guillaume@Eureden.com');
  assert.strictEqual(env.run('Auth.resolve().email'), 'guillaume@eureden.com');
});
test('TC sans code technicien : ligne ignorée', () => {
  const env = creerEnvStandard(); env.moi('tc.sans.code@eureden.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'ACCES_REFUSE');
});
test('TC avec code : accès accordé, capacités limitées', () => {
  const env = creerEnvStandard(); env.moi('tc.ok@eureden.com');
  assert.strictEqual(env.run('Auth.resolve().caps.consultation'), true);
  assert.strictEqual(env.run('Auth.resolve().caps.validation'), false);
});
test('administrateur initial sans ligne ACCES', () => {
  const env = creerEnvStandard(); env.props.SOP_ADMINS = 'nouveau@eureden.com'; env.moi('nouveau@eureden.com');
  assert.strictEqual(env.run('Auth.resolve().caps.configuration'), true);
});
test('administrateur initial hors domaine : refusé quand même', () => {
  const env = creerEnvStandard(); env.props.SOP_ADMINS = 'a@gmail.com'; env.moi('a@gmail.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'DOMAINE_REFUSE');
});
test('capacité refusée : TC ne valide pas', () => {
  const env = creerEnvStandard(); env.moi('tc.ok@eureden.com');
  assert.strictEqual(erreur(env, "Auth.requireCap(Auth.resolve(), 'validation')"), 'CAPACITE_REFUSEE');
});
test('SUPPLY avec * : accès valide', () => {
  const env = creerEnvStandard(); env.moi('supply@eureden.com');
  assert.strictEqual(env.run('Auth.resolve().roles.length'), 1);
});

// ---------- Périmètre ----------
test('périmètre RT : son territoire oui, un autre non', () => {
  const env = creerEnvStandard(); env.moi('rt.argoat@eureden.com');
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'correctionPrevision', {territoire: 'argoat centre bretagne'})"), true);
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'correctionPrevision', {territoire: 'IROISE'})"), false);
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'correctionPrevision', {})"), false);
});
test('périmètre : rôle global voit tout', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'correctionPrevision', {territoire: 'IROISE'})"), true);
});
test('périmètre : la capacité doit être portée par le rôle', () => {
  const env = creerEnvStandard(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'correctionPrevision', {marche: 'ENGRAIS'})"), false);
  assert.strictEqual(env.run("Auth.inScope(Auth.resolve(), 'validationGamme', {marche: 'ENGRAIS'})"), true);
});

// ---------- Campagne ----------
test('aucune campagne sélectionnée : CAMPAGNE_INVALIDE', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][12] = 'NON';
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'CAMPAGNE_INVALIDE');
});
test('deux campagnes sélectionnées : CAMPAGNE_INVALIDE', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'CAMPAGNES', [{ 'ID campagne': 'X', Statut: 'OUVERTE', Selectionnee: 'OUI' }]);
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'CAMPAGNE_INVALIDE');
});
test('paramètres non configurés : PARAM_NON_CONFIGURE', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com'); delete env.props.SOP_PARAM_ID;
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'PARAM_NON_CONFIGURE');
});
test('campagne gelée : écriture refusée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op1')"), 'CAMPAGNE_FERMEE');
});
test('campagne en préparation : seule la configuration écrit', () => {
  const env = creerEnvStandard();
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'PREPARATION';
  env.moi('guillaume@eureden.com');
  assert.strictEqual(erreur(env, "Auth.requireWritable(Auth.resolve())"), 'CAMPAGNE_FERMEE');
  env.moi('admin@eureden.com');
  assert.strictEqual(erreur(env, "Auth.requireWritable(Auth.resolve())"), null);
});

// ---------- Versions ----------
const creer = (env, type, extra) => env.run(`Versions.create(Auth.resolve(), ${JSON.stringify(Object.assign({ type, libelle: 'Test' }, extra || {}))}, 'op-${Math.random()}')`);

test('première version : V001 courante', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  const r = creer(env, 'STATISTIQUE');
  assert.strictEqual(r.resultat.idVersion, 'V001');
  const l = env.lignes('SORTIE1', 'VERSIONS');
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].Statut, 'COURANTE');
  assert.strictEqual(l[0].Scenario, 'BASE');
  assert.strictEqual(l[0]['Cree par'], 'guillaume@eureden.com');
});
test('seconde version du même scénario : V002, V001 archivée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  creer(env, 'STATISTIQUE'); const r = creer(env, 'ARBITREE');
  assert.strictEqual(r.resultat.idVersion, 'V002');
  const l = env.lignes('SORTIE1', 'VERSIONS');
  assert.strictEqual(l[0].Statut, 'ARCHIVEE');
  assert.strictEqual(l[1].Statut, 'COURANTE');
});
test('un autre scénario garde sa version courante', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  creer(env, 'STATISTIQUE'); creer(env, 'STATISTIQUE', { scenario: 'arret_minarix' });
  const l = env.lignes('SORTIE1', 'VERSIONS');
  assert.deepStrictEqual(l.map((x) => x.Statut), ['COURANTE', 'COURANTE']);
  assert.strictEqual(l[1].Scenario, 'ARRET_MINARIX');
});
test('PREV ne peut pas créer une version validée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'VALIDEE', libelle: 'x'}, 'o')"), 'CAPACITE_REFUSEE');
});
test('ADMIN crée une version validée : verrouillée', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  creer(env, 'VALIDEE');
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS')[0].Verrouillee, 'OUI');
});
test('TC ne peut créer aucune version', () => {
  const env = creerEnvStandard(); env.moi('tc.ok@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'o')"), 'CAPACITE_REFUSEE');
});
test('type invalide et libellé vide', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'AUTRE', libelle: 'x'}, 'o')"), 'VERSION_TYPE_INVALIDE');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: '  '}, 'o')"), 'LIBELLE_OBLIGATOIRE');
});
test('opération rejouée : une seule ligne, résultat identique', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  const a = env.run("Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op-fixe')");
  const b = env.run("Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op-fixe')");
  assert.strictEqual(a.rejoue, false);
  assert.strictEqual(b.rejoue, true);
  assert.strictEqual(b.resultat.idVersion, 'V001');
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 1);
  assert.strictEqual(env.lignes('SORTIE1', 'OPERATIONS').length, 1);
});
test('opération sans identifiant refusée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, '')"), 'OPERATION_SANS_ID');
});
test('identifiant d\'opération d\'un autre utilisateur refusé', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.run("Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op-partage')");
  env.moi('admin@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op-partage')"), 'OPERATION_CONFLIT');
});
test('le journal garde l\'auteur réel et les anciennes valeurs', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  creer(env, 'STATISTIQUE'); creer(env, 'STATISTIQUE');
  const j = env.lignes('SORTIE1', 'JOURNAL');
  assert.deepStrictEqual(j.map((x) => x.Action), ['VERSION_CREEE', 'VERSION_ARCHIVEE', 'VERSION_CREEE']);
  assert.ok(j.every((x) => x.Auteur === 'guillaume@eureden.com'));
  assert.strictEqual(j[1]['Ancienne valeur'], 'COURANTE');
  assert.strictEqual(j[1]['Nouvelle valeur'], 'ARCHIVEE');
});
test('verrouillage : validation requise, une seule fois', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  creer(env, 'STATISTIQUE');
  assert.strictEqual(erreur(env, "Versions.verrouiller(Auth.resolve(), 'V001', 'v1')"), 'CAPACITE_REFUSEE');
  env.moi('admin@eureden.com');
  env.run("Versions.verrouiller(Auth.resolve(), 'V001', 'v2')");
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS')[0].Verrouillee, 'OUI');
  assert.strictEqual(erreur(env, "Versions.verrouiller(Auth.resolve(), 'V001', 'v3')"), 'VERSION_DEJA_VERROUILLEE');
  assert.strictEqual(erreur(env, "Versions.verrouiller(Auth.resolve(), 'V099', 'v4')"), 'VERSION_INCONNUE');
});
test('la liste ne montre que la campagne sélectionnée, triée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.semer('SORTIE1', 'VERSIONS', [{ 'ID version': 'V009', 'ID campagne': 'AUTRE', Numero: 9, Type: 'ARBITREE', Statut: 'COURANTE', Verrouillee: 'NON' }]);
  creer(env, 'STATISTIQUE'); creer(env, 'ARBITREE');
  const l = env.run('Versions.list(Auth.resolve())');
  assert.deepStrictEqual(l.map((v) => v.id), ['V001', 'V002']);
});
test('les colonnes texte sont écrites au format texte', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  creer(env, 'STATISTIQUE');
  const f = env.feuille('SORTIE1', 'VERSIONS');
  const colId = f._data[0].indexOf('ID version') + 1;
  const colNum = f._data[0].indexOf('Numero') + 1;
  assert.ok(f._formats.some((x) => x.c === colId && x.f === '@'));
  assert.ok(!f._formats.some((x) => x.c === colNum));
});
test('le verrou est toujours relâché, même en cas d\'erreur', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.run("Store.updateRow = function () { throw new Error('boom'); }");
  creer(env, 'STATISTIQUE'); // première version : pas d'archivage, pas d'erreur
  assert.strictEqual(env.verrouAttente, 0);
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'STATISTIQUE', libelle: 'x'}, 'op-err')"), 'JS:boom');
  assert.strictEqual(env.verrouAttente, 0);
});

// ---------- Store ----------
test('colonne inconnue refusée à l\'écriture', () => {
  const env = creerEnvStandard();
  assert.strictEqual(erreur(env, "Store.append('SORTIE1', 'VERSIONS', [{ 'Colonne fantome': 1 }])"), 'COLONNE_INCONNUE');
});
test('onglet absent : ONGLET_ABSENT', () => {
  const env = creerEnvStandard();
  assert.strictEqual(erreur(env, "Store.read('SORTIE1', 'NEXISTE_PAS')"), 'ONGLET_ABSENT');
});
test('les codes numériques lus par Sheets sont comparés comme du texte', () => {
  const env = creerEnvStandard();
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', [{ 'ID campagne': 'SOP_2027_PAC2', 'Email Google': 'n@eureden.com', Role: 'TC', 'Code technicien': 199405, Actif: 'OUI' }]);
  env.moi('n@eureden.com');
  assert.strictEqual(env.run('Auth.resolve().roles[0].perimetre.codeTc'), '199405');
});

// ---------- Contrôles ----------
test('contrôles : structure conforme, avertit sur les accès à corriger', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  const r = env.run('Controles.run(Auth.resolve())');
  assert.ok(!r.some((x) => x.niveau === 'ERREUR'), JSON.stringify(r));
  assert.ok(r.some((x) => x.niveau === 'ATTENTION' && /ligne ignorée/i.test(x.detail)));
});
test('contrôles : en-tête modifié signalé', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.feuille('SORTIE1', 'VERSIONS')._data[0][0] = 'Identifiant';
  const r = env.run('Controles.run(Auth.resolve())');
  const e = r.filter((x) => x.niveau === 'ERREUR');
  assert.strictEqual(e.length, 1);
  assert.match(e[0].detail, /ID version/);
});
test('contrôles : rappelle la version du modèle quand la structure diffère', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.feuille('SORTIE1', 'VERSIONS')._data[0][0] = 'Identifiant';
  const r = env.run('Controles.run(Auth.resolve())');
  const v = env.run('SOP_STRUCTURE_VERSION');
  assert.ok(r.some((x) => x.sujet === 'Modèle' && x.detail.indexOf('version ' + v) >= 0));
});
test('contrôles : pas de rappel quand la structure est conforme', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  assert.ok(!env.run('Controles.run(Auth.resolve())').some((x) => x.sujet === 'Modèle'));
});
test('contrôles : onglet absent signalé', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  delete env.classeurs.PARAM_FICHIER_TEST_00001._feuilles.CAPACITES;
  const r = env.run('Controles.run(Auth.resolve())');
  assert.ok(r.some((x) => x.niveau === 'ERREUR' && /CAPACITES/.test(x.sujet) && /absent/.test(x.detail)));
});
test('contrôles : réservés à la configuration', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(erreur(env, 'Controles.run(Auth.resolve())'), 'CAPACITE_REFUSEE');
});

// ---------- Mise en service ----------
test('les fonctions de mise en service n\'ont pas de _ final (sinon invisibles dans l\'éditeur)', () => {
  const env = creerEnvStandard();
  ['configurerParametres', 'installerDepuisEditeur', 'verifierInstallation'].forEach((nom) => assert.strictEqual(env.run('typeof ' + nom), 'function', nom));
});
test('installation : le déployeur devient administrateur initial', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.run('installerDepuisEditeur()');
  assert.strictEqual(env.props.SOP_ADMINS, 'admin@eureden.com');
  env.run('installerDepuisEditeur()');
  assert.strictEqual(env.props.SOP_ADMINS, 'admin@eureden.com');
});
test('installation : un autre utilisateur de l\'organisation est refusé', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(erreur(env, 'installerDepuisEditeur()'), 'JS:Fonction réservée au compte qui déploie l\'application.');
  assert.ok(!env.props.SOP_ADMINS);
  assert.strictEqual(erreur(env, "definirParametres_('AUTRE_ID')"), 'JS:Fonction réservée au compte qui déploie l\'application.');
  assert.strictEqual(env.props.SOP_PARAM_ID, 'PARAM_FICHIER_TEST_00001');
});
test('installation : adresse illisible refusée', () => {
  const env = creerEnvStandard(); env.moi('');
  assert.ok(/réservée/.test(erreur(env, 'installerDepuisEditeur()')));
});
test('configuration : enregistre l\'ID, refuse le texte d\'exemple', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.run("definirParametres_('NOUVEL_ID_FICHIER_PARAMETRES_0001')");
  assert.strictEqual(env.props.SOP_PARAM_ID, 'NOUVEL_ID_FICHIER_PARAMETRES_0001');
  assert.ok(/pas un ID/.test(erreur(env, "definirParametres_('trop-court')")));
  assert.ok(/Renseignez/.test(erreur(env, 'configurerParametres()')));
});
test('vérification : le déployeur voit les contrôles, pas les autres', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  assert.ok(env.run('verifierInstallation()') >= 1);
  env.moi('guillaume@eureden.com');
  assert.ok(/réservée/.test(erreur(env, 'verifierInstallation()')));
});

test('ID de paramètres : le texte d\'exemple est refusé avec un message clair', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.props.SOP_PARAM_ID = 'COLLER_ICI_L_ID_DU_FICHIER_PARAMETRES_SOP';
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'PARAM_ID_INVALIDE');
  env.props.SOP_PARAM_ID = 'trop-court';
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'PARAM_ID_INVALIDE');
});
test('classeur introuvable ou non partagé : CLASSEUR_INACCESSIBLE', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  env.props.SOP_PARAM_ID = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'CLASSEUR_INACCESSIBLE');
});

// ---------- Points d'entrée ----------
test('apiDemarrage : réponse structurée', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  const r = env.run('apiDemarrage()');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.campagne.id, 'SOP_2027_PAC2');
  assert.deepStrictEqual(r.data.roles, ['PREV']);
  assert.strictEqual(r.data.droits.arbitrage, true);
});
test('apiDemarrage : année de prévision de la campagne', () => {
  const sans = creerEnvStandard(); sans.moi('guillaume@eureden.com');
  assert.strictEqual(sans.run('apiDemarrage()').data.campagne.anneePrevision, 0);
  // Les lectures sont mémorisées pendant une exécution : un autre environnement simule une nouvelle exécution.
  const avec = creerEnvStandard(); avec.moi('guillaume@eureden.com');
  avec.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2027;
  assert.strictEqual(avec.run('apiDemarrage()').data.campagne.anneePrevision, 2027);
});
test('apiDemarrage : erreur métier renvoyée sans trace', () => {
  const env = creerEnvStandard(); env.moi('inconnu@eureden.com');
  const r = env.run('apiDemarrage()');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ACCES_REFUSE');
  assert.ok(!('stack' in r));
});
test('apiCreerVersion : une erreur technique devient ERREUR_INTERNE', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.run("Versions.create = function () { throw new Error('secret technique'); }");
  const r = env.run("apiCreerVersion({type: 'STATISTIQUE', libelle: 'x'}, 'op')");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ERREUR_INTERNE');
  assert.ok(!/secret/.test(r.message));
});

// ---------- Historique PAC ----------
test('historique : totaux par entité et année, accents et nombres en texte', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  const r = env.run('apiHistorique()');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data.annees, ['2024', '2025']);
  const t = (e, a) => r.data.totaux.filter((x) => x.entite === e && x.annee === a)[0];
  assert.strictEqual(t('Coop EUREDEN', '2024').lignes, 2);
  assert.strictEqual(t('Coop EUREDEN', '2024').qte, 14420 + 1000.5);
  assert.strictEqual(t('Coop EUREDEN', '2024').montant, 12000 + 2000.25);
  assert.strictEqual(t('Coop EUREDEN', '2024').tc, 2);
  assert.strictEqual(t('NEGOCE ONA', '2025').qte, 50);
});
test('historique : article regroupé par code texte, trié sur la dernière année', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  const r = env.run('apiHistorique()').data;
  assert.strictEqual(r.nbArticles, 2);
  assert.strictEqual(r.articles[0].code, '1109939');
  assert.strictEqual(r.articles[0].parAnnee['2025'].mt, 15800);
  assert.strictEqual(r.articles[0].parAnnee['2024'].tc, 2);
});
test('historique : ligne sans code produit ignorée avec avertissement', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  const r = env.run('apiHistorique()').data;
  assert.ok(r.avertissements.some((a) => /sans code produit/.test(a)));
});
test('historique : colonne manquante nommée', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  env.feuille(FICHIER_ONA, 'Données 2025')._data[0][7] = 'Autre chose';
  const r = env.run('apiHistorique()');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'HISTO_COLONNES');
  assert.ok(/Total mt ht vtes/.test(r.message));
});
test('historique : onglet absent', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  delete env.classeurs[FICHIER_EUR]._feuilles['Données 2024'];
  assert.strictEqual(env.run('apiHistorique()').code, 'ONGLET_ABSENT');
});
test('historique : aucune source active', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(env.run('apiHistorique()').code, 'HISTO_SANS_SOURCE');
});
test('historique : source inactive ou d\'une autre campagne ignorée', () => {
  const env = envHisto([{ 'ID source': 'X', Nature: 'HISTO_PAC', 'ID fichier': 'INCONNU', 'Actif import': 'NON', Annees: '2025' },
    { 'ID source': 'Y', Nature: 'HISTO_PAC', 'ID fichier': 'INCONNU', 'Actif import': 'OUI', 'ID campagne': 'AUTRE', Annees: '2025' }]);
  env.moi('guillaume@eureden.com');
  assert.strictEqual(env.run('apiHistorique()').ok, true);
});
test('historique : année invalide refusée', () => {
  const env = envHisto(); env.moi('guillaume@eureden.com');
  env.lignes('PARAM_FICHIER_TEST_00001', 'SOURCES');
  env.feuille('PARAM_FICHIER_TEST_00001', 'SOURCES')._data[1][15] = '2024,abc';
  assert.strictEqual(env.run('apiHistorique()').code, 'HISTO_ANNEES');
});
test('historique : fichier Excel inaccessible, message de conversion', () => {
  const env = envHisto([{ 'ID source': 'XL', Nature: 'HISTO_PAC', 'ID fichier': 'FICHIER_EXCEL_INCONNU_0001', Onglet: 'Données {ANNEE}', 'Actif import': 'OUI', Annees: '2025', Format: 'XLSX', Entite: 'Z' }]);
  env.moi('guillaume@eureden.com');
  const r = env.run('apiHistorique()');
  assert.strictEqual(r.code, 'HISTO_XLSX');
  assert.ok(/Google Sheets/.test(r.message));
});
test('historique : un TC ne voit que ses lignes', () => {
  const env = envHisto(); env.moi('tc.ok@eureden.com');
  const r = env.run('apiHistorique()').data;
  const t = r.totaux.filter((x) => x.entite === 'Coop EUREDEN' && x.annee === '2024')[0];
  assert.strictEqual(t.lignes, 1);
  assert.strictEqual(t.qte, 1000.5);
  assert.strictEqual(r.totaux.filter((x) => x.entite === 'NEGOCE ONA')[0].lignes, 0);
});
test('historique : un périmètre territoire ou marché ne donne accès à rien', () => {
  const env = envHisto(); env.moi('rt.argoat@eureden.com');
  const r = env.run('apiHistorique()').data;
  assert.strictEqual(r.totaux.reduce((s, x) => s + x.lignes, 0), 0);
  assert.strictEqual(r.nbArticles, 0);
});
test('historique : ID de fichier collé dans ID campagne, le message le dit', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'HISTO_EUREDEN', Nature: 'HISTO_PAC', 'Actif import': 'OUI', 'ID campagne': '1wYujNdVXVStg4EYVIl2S13qAlCUII93OoRmJPLZ3D0', Annees: '2025' }]);
  const r = env.run('apiHistorique()');
  assert.strictEqual(r.code, 'HISTO_SANS_SOURCE');
  assert.ok(/colonne ID fichier/.test(r.message));
  assert.ok(/HISTO_EUREDEN/.test(r.message));
});
test('historique : contrôles de mise en service listent chaque onglet', () => {
  const env = envHisto(); env.moi('admin@eureden.com');
  const c = env.run('Controles.run(Auth.resolve())').filter((x) => /^Historique /.test(x.sujet));
  assert.strictEqual(c.length, 3);
  assert.ok(c.every((x) => x.niveau === 'OK'));
});
test('historique : contrôles signalent un onglet qui ne s\'ouvre pas', () => {
  const env = envHisto(); env.moi('admin@eureden.com');
  delete env.classeurs[FICHIER_ONA]._feuilles['Données 2025'];
  const c = env.run('Controles.run(Auth.resolve())').filter((x) => x.sujet === 'Historique HISTO_ONA');
  assert.strictEqual(c[0].niveau, 'ERREUR');
});

// ---------- Prévision statistique ----------
const statistique = (env, parAnnee, annees, poids) => env.run('Previsions.statistique(' + JSON.stringify(parAnnee) + ',' + JSON.stringify(annees) + ',' + JSON.stringify(poids) + ')');

test('statistique : moyenne pondérée sur trois années', () => {
  const env = creerEnvStandard();
  const v = statistique(env, { 2024: { qte: 100 }, 2025: { qte: 200 }, 2026: { qte: 300 } }, ['2024', '2025', '2026'], [50, 30, 20]);
  assert.strictEqual(v, (300 * 50 + 200 * 30 + 100 * 20) / 100);
});
test('statistique : article né l\'année dernière = sa quantité', () => {
  const env = creerEnvStandard();
  assert.strictEqual(statistique(env, { 2026: { qte: 80 } }, ['2024', '2025', '2026'], [50, 30, 20]), 80);
});
test('statistique : année sans vente entre deux ventes compte pour 0', () => {
  const env = creerEnvStandard();
  const v = statistique(env, { 2024: { qte: 100 }, 2026: { qte: 100 } }, ['2024', '2025', '2026'], [50, 30, 20]);
  assert.strictEqual(v, (100 * 50 + 0 * 30 + 100 * 20) / 100);
});
test('statistique : article sans vente la dernière année non reconduit', () => {
  const env = creerEnvStandard();
  assert.strictEqual(statistique(env, { 2024: { qte: 100 }, 2025: { qte: 100 } }, ['2024', '2025', '2026'], [50, 30, 20]), 0);
});
test('statistique : plus d\'années que de poids, les plus anciennes sont ignorées', () => {
  const env = creerEnvStandard();
  const v = statistique(env, { 2023: { qte: 1000 }, 2024: { qte: 100 }, 2025: { qte: 100 } }, ['2023', '2024', '2025'], [60, 40]);
  assert.strictEqual(v, 100);
});
test('pondération invalide refusée', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'REGLAGES')._data[2][1] = '50/abc';
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'op1')").code, 'PONDERATION_INVALIDE');
});
test('calcul statistique : version, prévision, photo et journal écrits', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r = env.run("apiCalculerStatistique({}, 'op1')");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.idVersion, 'V001');
  assert.strictEqual(r.data.resultat.lignes, 2);
  const prev = env.lignes('SORTIE1', 'PREVISION');
  assert.strictEqual(prev.length, 2);
  const dap = prev.filter((x) => x['Code produit'] === '1109939')[0];
  assert.strictEqual(dap.Statut, 'STATISTIQUE');
  assert.strictEqual(dap.Plateforme, '*');
  assert.strictEqual(dap['Qte historique corrigee N-1'], 900 + 16000);
  assert.strictEqual(dap["Qte statistique"], 16345.188);
  assert.strictEqual(env.lignes('SORTIE1', 'INSTANTANES').length, 2);
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS')[0].Type, 'STATISTIQUE');
  assert.ok(env.lignes('SORTIE1', 'JOURNAL').some((j) => j.Action === 'PREVISION_STATISTIQUE'));
});
test('calcul statistique : rejouer la même opération n\'écrit rien de plus', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  const r = env.run("apiCalculerStatistique({}, 'op1')");
  assert.strictEqual(r.data.rejoue, true);
  assert.strictEqual(env.lignes('SORTIE1', 'PREVISION').length, 2);
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 1);
});
test('calcul statistique : un recalcul remplace PREVISION et archive la version précédente', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  env.run("apiCalculerStatistique({}, 'op2')");
  assert.strictEqual(env.lignes('SORTIE1', 'PREVISION').length, 2);
  const v = env.lignes('SORTIE1', 'VERSIONS');
  assert.strictEqual(v.length, 2);
  assert.strictEqual(v[0].Statut, 'ARCHIVEE');
  assert.strictEqual(v[1].Statut, 'COURANTE');
  assert.strictEqual(env.lignes('SORTIE1', 'INSTANTANES').length, 4);
});
test('calcul statistique : refusé sans capacité d\'arbitrage', () => {
  const env = envPrev(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'op1')").code, 'CAPACITE_REFUSEE');
  assert.strictEqual(env.lignes('SORTIE1', 'PREVISION').length, 0);
});
test('calcul statistique : refusé quand la campagne est gelée', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'op1')").code, 'CAMPAGNE_FERMEE');
});
test('calcul statistique : refusé si la version courante est verrouillée', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  env.run("apiVerrouillerVersion('V001', 'op2')");
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'op3')").code, 'VERSION_VERROUILLEE');
});
test('calcul statistique : refusé si des quantités validées existent', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  const f = env.feuille('SORTIE1', 'PREVISION');
  f._data[1][f._data[0].indexOf('Qte validee')] = 123;
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'op2')").code, 'PREVISION_VALIDEE');
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 1);
});
test('précision : réglage vide = 3 décimales, réglage 0 = entiers', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  assert.strictEqual(env.run('Previsions.calculer.length') >= 0, true);
  env.semer('PARAM_FICHIER_TEST_00001', 'REGLAGES', [{ Cle: 'PRECISION_QTE', Valeur: '0' }]);
  env.run("apiCalculerStatistique({}, 'op1')");
  assert.strictEqual(env.lignes('SORTIE1', 'PREVISION').filter((x) => x['Code produit'] === '1109939')[0]['Qte statistique'], 16345);
});
test('essai de pondération : erreur et biais calculés sur la dernière année', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r = env.run('apiEssaiPonderation()');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.anneeTestee, '2025');
  assert.deepStrictEqual(r.data.anneesBase, ['2024']);
  // Une seule année avant : prévision 2025 = ventes 2024. Eureden 15420,5 contre 16900 ; ONA 0 contre 50.
  const reel = 16900 + 50;
  const attendu = (Math.abs(15420.5 - 16900) + 50) / reel;
  assert.ok(Math.abs(r.data.resultats[0].erreur - attendu) < 1e-9);
  assert.ok(Math.abs(r.data.resultats[0].biais - (15420.5 / reel - 1)) < 1e-9);
  assert.strictEqual(r.data.resultats[0].actuelle, true);
});
test('essai de pondération : trois années, la pondération actuelle figure parmi les candidates', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.ajouterClasseur(FICHIER_EUR, {
    'Données 2024': [ENT_HISTO, ['a', 1, 'A', 1, 'T', 100, 1, 1]],
    'Données 2025': [ENT_HISTO, ['a', 1, 'A', 1, 'T', 200, 1, 1]],
    'Données 2026': [ENT_HISTO, ['a', 1, 'A', 1, 'T', 300, 1, 1]]
  });
  env.feuille('PARAM_FICHIER_TEST_00001', 'SOURCES')._data[1][15] = '2024,2025,2026';
  const r = env.run('apiEssaiPonderation()').data;
  assert.strictEqual(r.anneeTestee, '2026');
  const act = r.resultats.filter((x) => x.actuelle);
  assert.strictEqual(act.length, 1);
  assert.deepStrictEqual(act[0].ponderation, [50, 30]);
  // 100/0 : prévision 200 pour un réel de 300 (ONA : 50 en 2025, rien en 2026 donc non reconduit).
  const cent = r.resultats.filter((x) => x.ponderation.join('/') === '100/0')[0];
  assert.ok(cent.erreur > 0 && cent.biais < 0);
});
test('essai de pondération : une seule année refusé', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'SOURCES')._data[1][15] = '2025';
  env.feuille('PARAM_FICHIER_TEST_00001', 'SOURCES')._data[2][15] = '2025';
  assert.strictEqual(env.run('apiEssaiPonderation()').code, 'ESSAI_IMPOSSIBLE');
});
test('essai de pondération : refusé hors périmètre global', () => {
  const env = envPrev(); env.moi('tc.ok@eureden.com');
  assert.strictEqual(env.run('apiEssaiPonderation()').code, 'CAPACITE_REFUSEE');
});
test('prévision courante : libellés joints, totaux par entité', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  const r = env.run('apiPrevision()');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.version.id, 'V001');
  assert.strictEqual(r.data.articles[0].libelle, 'D.A.P. 35K');
  assert.strictEqual(r.data.totaux.length, 2);
});
test('prévision courante : vide avant tout calcul', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r = env.run('apiPrevision()');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.version, null);
});
test('prévision courante : un TC n\'en voit rien', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op1')");
  env.moi('tc.ok@eureden.com');
  assert.strictEqual(env.run('apiPrevision()').data.articles.length, 0);
});

// ---------- Corrections, événements, arrêts, substitutions ----------
const DAP = '1109939', ONA_ART = '2200001';
const ajout = (env, o, op) => env.run('apiAjouterAjustement(' + JSON.stringify(o) + ", '" + op + "')");
const prevLigne = (env, code, entite) => env.lignes('SORTIE1', 'PREVISION').filter((x) => x['Code produit'] === code && (!entite || x.Entite === entite))[0];
const STAT_DAP = 16345.188;

test('correction : enregistrée avec l\'entité exacte, effet seulement après arbitrage', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  const r = ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'coop eureden', quantite: -1000, motif: 'Perte d\'un client' }, 'c1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.id, 'COR0001');
  const l = env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE')[0];
  assert.strictEqual(l.Entite, 'Coop EUREDEN');
  assert.strictEqual(l.Quantite, -1000);
  assert.strictEqual(l.Statut, 'ACTIF');
  assert.strictEqual(prevLigne(env, DAP)['Qte correction'], '');
});
test('correction : motif, impact, semaines et entité contrôlés', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const code = (o) => ajout(env, Object.assign({ nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: 10, motif: 'm' }, o), 'x' + Math.random()).code;
  assert.strictEqual(code({ motif: '' }), 'MOTIF_OBLIGATOIRE');
  assert.strictEqual(code({ pourcent: 5 }), 'IMPACT_INVALIDE');
  assert.strictEqual(code({ quantite: '' }), 'IMPACT_INVALIDE');
  assert.strictEqual(code({ quantite: 0 }), 'IMPACT_INVALIDE');
  assert.strictEqual(code({ quantite: '', pourcent: -150 }), 'IMPACT_INVALIDE');
  assert.strictEqual(code({ semaineDebut: '2027-6' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ semaineDebut: '2027-S10', semaineFin: '2027-S02' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ entite: 'Inconnue' }), 'ENTITE_INCONNUE');
  assert.strictEqual(code({ code: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').length, 0);
});
test('correction : article absent de la prévision signalé en avertissement', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  const r = ajout(env, { nature: 'CORRECTION', code: '9999999', entite: 'Coop EUREDEN', quantite: 5, motif: 'Nouveau' }, 'c1');
  assert.ok(/n'est pas dans la prévision/.test(r.data.resultat.avertissement));
});
test('arbitrage : correction en quantité et événement en pourcentage', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1000, motif: 'Perte client' }, 'c1');
  ajout(env, { nature: 'EVENEMENT', type: 'PROMO', code: ONA_ART, entite: 'NEGOCE ONA', pourcent: 10 }, 'e1');
  const r = env.run("apiArbitrer({}, 'a1')");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.idVersion, 'V002');
  assert.strictEqual(r.data.resultat.corrections, 1);
  assert.strictEqual(r.data.resultat.evenements, 1);
  const d = prevLigne(env, DAP), o = prevLigne(env, ONA_ART);
  assert.strictEqual(d.Statut, 'ARBITREE');
  assert.strictEqual(d['Qte correction'], -1000);
  assert.strictEqual(d['Qte arbitree'], STAT_DAP - 1000);
  assert.strictEqual(o['Qte evenements'], 5);
  assert.strictEqual(o['Qte arbitree'], 55);
  const v = env.lignes('SORTIE1', 'VERSIONS');
  assert.strictEqual(v[0].Statut, 'ARCHIVEE');
  assert.strictEqual(v[1].Type, 'ARBITREE');
});
test('substitution : le report passe de l\'ancien vers un nouvel article sans historique', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r0 = ajout(env, { nature: 'SUBSTITUTION', ancien: DAP, nouveau: '3300003', entite: 'Coop EUREDEN', taux: 50, motif: 'REMPLACEMENT' }, 's1');
  assert.strictEqual(r0.ok, true);
  assert.strictEqual(r0.data.resultat.id, 'SUB_001');
  assert.strictEqual(env.lignes('PARAM_FICHIER_TEST_00001', 'SUBSTITUTIONS')[0]['Renseigne par'], 'guillaume@eureden.com');
  env.run("apiArbitrer({}, 'a1')");
  const ancien = prevLigne(env, DAP), nouveau = prevLigne(env, '3300003');
  assert.strictEqual(ancien['Qte substitution'], -8172.594);
  assert.strictEqual(ancien['Qte arbitree'], STAT_DAP - 8172.594);
  assert.strictEqual(nouveau['Qte historique corrigee N-1'], 0);
  assert.strictEqual(nouveau['Qte substitution'], 8172.594);
  assert.strictEqual(nouveau['Qte arbitree'], 8172.594);
});
test('arrêt de produit : l\'article tombe à zéro sans report', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'ARRET', ancien: ONA_ART, entite: 'NEGOCE ONA', commentaire: 'Arrêt Minarix' }, 's1');
  const l = env.lignes('PARAM_FICHIER_TEST_00001', 'SUBSTITUTIONS')[0];
  assert.strictEqual(l['Code nouveau'], '');
  assert.strictEqual(l.Motif, 'ARRET');
  assert.strictEqual(l['Taux de report'], 100);
  env.run("apiArbitrer({}, 'a1')");
  const o = prevLigne(env, ONA_ART);
  assert.strictEqual(o['Qte substitution'], -50);
  assert.strictEqual(o['Qte arbitree'], 0);
});
test('substitution : entité vide = toutes les entités qui ont l\'article', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'ARRET', ancien: ONA_ART }, 's1');
  env.run("apiArbitrer({}, 'a1')");
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte arbitree'], 0);
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP);
});
test('substitution : ancien et nouveau identiques, taux et dates invalides refusés', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const code = (o) => ajout(env, Object.assign({ nature: 'SUBSTITUTION', ancien: DAP, nouveau: '3300003' }, o), 'x' + Math.random()).code;
  assert.strictEqual(code({ nouveau: DAP }), 'SUBSTITUTION_INVALIDE');
  assert.strictEqual(code({ nouveau: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(code({ taux: 0 }), 'TAUX_INVALIDE');
  assert.strictEqual(code({ taux: 120 }), 'TAUX_INVALIDE');
  assert.strictEqual(code({ dateEffet: '01/01/2027' }), 'DATE_INVALIDE');
  assert.strictEqual(code({ motif: 'N IMPORTE QUOI' }), 'TYPE_INVALIDE');
  assert.strictEqual(env.lignes('PARAM_FICHIER_TEST_00001', 'SUBSTITUTIONS').length, 0);
});
test('substitution : une fin avant l\'année de prévision, ou un début après, ne s\'applique pas', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2027;
  ajout(env, { nature: 'ARRET', ancien: ONA_ART, dateFin: '2025-12-31' }, 's1');
  ajout(env, { nature: 'ARRET', ancien: DAP, dateEffet: '2028-01-01' }, 's2');
  env.run("apiArbitrer({}, 'a1')");
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte arbitree'], 50);
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP);
});
test('substitution : pas de chaînage, chaque report part de la statistique', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'SUBSTITUTION', ancien: DAP, nouveau: 'B', entite: 'Coop EUREDEN' }, 's1');
  ajout(env, { nature: 'SUBSTITUTION', ancien: 'B', nouveau: 'C', entite: 'Coop EUREDEN' }, 's2');
  const r = env.run("apiArbitrer({}, 'a1')").data.resultat;
  assert.strictEqual(prevLigne(env, 'C'), undefined);
  assert.strictEqual(prevLigne(env, 'B')['Qte arbitree'], STAT_DAP);
  assert.ok(r.avertissements.some((a) => /n'a pas de prévision statistique/.test(a)));
});
test('arbitrage : quantité négative ramenée à 0 avec avertissement', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: ONA_ART, entite: 'NEGOCE ONA', quantite: -99999, motif: 'Test' }, 'c1');
  const r = env.run("apiArbitrer({}, 'a1')").data.resultat;
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte arbitree'], 0);
  assert.ok(r.avertissements.some((a) => /sous zéro/.test(a)));
});
test('annulation : la saisie n\'a plus d\'effet et ne peut être annulée deux fois', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1000, motif: 'm' }, 'c1');
  ajout(env, { nature: 'EVENEMENT', type: 'POLCO', code: DAP, entite: 'Coop EUREDEN', quantite: 200 }, 'e1');
  ajout(env, { nature: 'ARRET', ancien: ONA_ART }, 's1');
  assert.strictEqual(env.run("apiAnnulerAjustement('CORRECTION', 'COR0001', 'n1')").ok, true);
  assert.strictEqual(env.run("apiAnnulerAjustement('EVENEMENT', 'EVT0001', 'n2')").ok, true);
  assert.strictEqual(env.run("apiAnnulerAjustement('SUBSTITUTION', 'SUB_001', 'n3')").ok, true);
  assert.strictEqual(env.run("apiAnnulerAjustement('CORRECTION', 'COR0001', 'n4')").code, 'DEJA_ANNULE');
  assert.strictEqual(env.run("apiAnnulerAjustement('CORRECTION', 'COR9999', 'n5')").code, 'AJUSTEMENT_INCONNU');
  env.run("apiArbitrer({}, 'a1')");
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP + 0);
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte arbitree'], 50);
  const l = env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE')[0];
  assert.strictEqual(l.Statut, 'ANNULE');
  assert.strictEqual(l['Annule par'], 'guillaume@eureden.com');
  assert.strictEqual(env.lignes('SORTIE1', 'EVENEMENTS_COMMERCE')[0].Actif, 'NON');
});
test('ajustements : liste des saisies actives seulement', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1, motif: 'a' }, 'c1');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -2, motif: 'b' }, 'c2');
  ajout(env, { nature: 'ARRET', ancien: ONA_ART }, 's1');
  env.run("apiAnnulerAjustement('CORRECTION', 'COR0001', 'n1')");
  const r = env.run('apiAjustements()').data;
  assert.strictEqual(r.corrections.length, 1);
  assert.strictEqual(r.corrections[0].id, 'COR0002');
  assert.strictEqual(r.substitutions[0].nature, 'ARRET');
  assert.deepStrictEqual(r.entites, ['Coop EUREDEN', 'NEGOCE ONA']);
});
test('ajustements : rejouer la même opération n\'ajoute rien', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1, motif: 'a' }, 'c1');
  const r = ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1, motif: 'a' }, 'c1');
  assert.strictEqual(r.data.rejoue, true);
  assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').length, 1);
});
test('ajustements : droits par rôle et périmètre', () => {
  const env = envPrev();
  env.moi('rm.engrais@eureden.com');
  assert.strictEqual(ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: 1, motif: 'm' }, 'r1').code, 'CAPACITE_REFUSEE');
  assert.strictEqual(ajout(env, { nature: 'ARRET', ancien: DAP }, 'r2').code, 'CAPACITE_REFUSEE');
  env.moi('tc.ok@eureden.com');
  assert.strictEqual(ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: 1, motif: 'm' }, 'r3').code, 'CAPACITE_REFUSEE');
  assert.strictEqual(env.run("apiArbitrer({}, 'r4')").code, 'CAPACITE_REFUSEE');
  assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').length, 0);
});
test('ajustements : refusés quand la campagne est gelée', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(ajout(env, { nature: 'ARRET', ancien: DAP }, 's1').code, 'CAMPAGNE_FERMEE');
});
test('recalcul statistique après arbitrage : colonnes d\'effet vidées, saisies conservées', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1000, motif: 'm' }, 'c1');
  env.run("apiArbitrer({}, 'a1')");
  env.run("apiCalculerStatistique({}, 's1')");
  const d = prevLigne(env, DAP);
  assert.strictEqual(d.Statut, 'STATISTIQUE');
  assert.strictEqual(d['Qte correction'], '');
  assert.strictEqual(d['Qte arbitree'], '');
  assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE')[0].Statut, 'ACTIF');
});
test('prévision courante : colonnes détaillées et quantité retenue', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -1000, motif: 'm' }, 'c1');
  env.run("apiArbitrer({}, 'a1')");
  const r = env.run('apiPrevision()').data;
  const d = r.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(d.correction, -1000);
  assert.strictEqual(d.retenue, STAT_DAP - 1000);
  assert.strictEqual(r.version.type, 'ARBITREE');
  const eur = r.totaux.filter((t) => t.entite === 'Coop EUREDEN')[0];
  assert.strictEqual(eur.retenue, STAT_DAP - 1000);
});

// ---------- Campagnes, reprévision, tableau de bord, sources ----------
const appel = (env, nom, args, camp) => env.run('api(' + JSON.stringify(nom) + ',' + JSON.stringify(args || []) + ',' + JSON.stringify(camp || '') + ')');

test('api : appel inconnu refusé, appel sans tableau d\'arguments toléré', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  assert.strictEqual(appel(env, 'nimporte').code, 'API_INCONNUE');
  assert.strictEqual(appel(env, 'constructor').code, 'API_INCONNUE');
  assert.strictEqual(env.run("api('demarrage', null, '')").ok, true);
});
test('campagnes : liste des campagnes accessibles et changement de campagne', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'CAMPAGNES', [{ 'ID campagne': 'PAC1_2027', Libelle: 'PAC 1 2027', Type: 'PAC1', 'Annee prevision': 2027, Statut: 'OUVERTE', 'ID sortie': 'SORTIE1', Selectionnee: 'NON' }]);
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', [{ 'ID campagne': 'PAC1_2027', 'Email Google': 'guillaume@eureden.com', Role: 'PREV', Global: 'OUI', Actif: 'OUI' }]);
  const d = appel(env, 'demarrage').data;
  assert.strictEqual(d.campagne.id, 'SOP_2027_PAC2');
  assert.deepStrictEqual(d.campagnes.map((c) => c.id), ['SOP_2027_PAC2', 'PAC1_2027']);
  const e = appel(env, 'demarrage', [], 'PAC1_2027').data;
  assert.strictEqual(e.campagne.id, 'PAC1_2027');
  assert.strictEqual(e.campagne.anneePrevision, 2027);
});
test('campagnes : campagne inconnue, ou sans accès, refusées', () => {
  const env = creerEnvStandard(); env.moi('guillaume@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'CAMPAGNES', [{ 'ID campagne': 'PAC3_2027', Libelle: 'PAC 3', Type: 'PAC3', Statut: 'OUVERTE', Selectionnee: 'NON' }]);
  assert.strictEqual(appel(env, 'demarrage', [], 'INEXISTANTE').code, 'CAMPAGNE_INCONNUE');
  assert.strictEqual(appel(env, 'demarrage', [], 'PAC3_2027').code, 'ACCES_REFUSE');
  assert.deepStrictEqual(appel(env, 'demarrage').data.campagnes.map((c) => c.id), ['SOP_2027_PAC2']);
});
test('campagnes : sans accès à la campagne par défaut, bascule sur la première accessible', () => {
  const env = creerEnvStandard(); env.moi('autre.prev@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'CAMPAGNES', [{ 'ID campagne': 'PAC1_2027', Libelle: 'PAC 1', Type: 'PAC1', Statut: 'OUVERTE', Selectionnee: 'NON' }]);
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', [{ 'ID campagne': 'PAC1_2027', 'Email Google': 'autre.prev@eureden.com', Role: 'PREV', Global: 'OUI', Actif: 'OUI' }]);
  assert.strictEqual(appel(env, 'demarrage').data.campagne.id, 'PAC1_2027');
});
test('reprévision : corrections du tableau + version arbitrée en une opération', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  const r = appel(env, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }, { entite: 'NEGOCE ONA', code: ONA_ART, pourcent: 10 }], motif: 'Politique commerciale', commentaire: 'Comité du 12/10' }, 'rp1']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.idVersion, 'V002');
  assert.strictEqual(r.data.resultat.corrigees, 2);
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP - 1000);
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte arbitree'], 55);
  const cors = env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE');
  assert.strictEqual(cors.length, 2);
  assert.ok(/Politique commerciale – Comité du 12\/10/.test(cors[0].Motif));
});
test('reprévision : une nouvelle valeur remplace la correction précédente, une valeur vide la supprime', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  appel(env, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], motif: 'm' }, 'rp1']);
  appel(env, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: -300 }], motif: 'm' }, 'rp2']);
  assert.strictEqual(prevLigne(env, DAP)['Qte correction'], -300);
  let c = env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE');
  assert.deepStrictEqual(c.map((x) => x.Statut), ['ANNULE', 'ACTIF']);
  appel(env, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: '' }], motif: '' }, 'rp3']);
  c = env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE');
  assert.deepStrictEqual(c.map((x) => x.Statut), ['ANNULE', 'ANNULE']);
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP);
});
test('reprévision : motif, doublon, impact et entité contrôlés avant toute écriture', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const code = (corr, motif) => appel(env, 'reprevision', [{ corrections: corr, motif: motif === undefined ? 'm' : motif }, 'x' + Math.random()]).code;
  assert.strictEqual(code([{ entite: 'Coop EUREDEN', code: DAP, quantite: 5 }], ''), 'MOTIF_OBLIGATOIRE');
  assert.strictEqual(code([{ entite: 'Coop EUREDEN', code: DAP, quantite: 5 }, { entite: 'coop eureden', code: DAP, quantite: 6 }]), 'DOUBLON');
  assert.strictEqual(code([{ entite: 'Coop EUREDEN', code: DAP, quantite: 5, pourcent: 5 }]), 'IMPACT_INVALIDE');
  assert.strictEqual(code([{ entite: 'Inconnue', code: DAP, quantite: 5 }]), 'ENTITE_INCONNUE');
  assert.strictEqual(code([{ entite: 'Coop EUREDEN', code: '', quantite: 5 }]), 'CODE_OBLIGATOIRE');
  assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').length, 0);
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 0);
});
test('reprévision : droits, campagne gelée et opération rejouée', () => {
  const env = envPrev(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(appel(env, 'reprevision', [{ corrections: [] }, 'a']).code, 'CAPACITE_REFUSEE');
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  appel(env2, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: 5 }], motif: 'm' }, 'rp1']);
  const r = appel(env2, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: 5 }], motif: 'm' }, 'rp1']);
  assert.strictEqual(r.data.rejoue, true);
  assert.strictEqual(env2.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').length, 1);
  const env3 = envPrev(); env3.moi('guillaume@eureden.com');
  env3.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(appel(env3, 'reprevision', [{ corrections: [] }, 'g']).code, 'CAMPAGNE_FERMEE');
});
test('prévision courante : totaux en hectares et en valeur, coefficients par article', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = env.run('apiPrevision()').data;
  assert.strictEqual(d.anneeReference, '2025');
  const eur = d.totaux.filter((t) => t.entite === 'Coop EUREDEN')[0];
  assert.strictEqual(eur.ha.n1, 169);
  assert.strictEqual(eur.eur.n1, 15800);
  const a = d.articles.filter((x) => x.code === DAP)[0];
  assert.ok(Math.abs(a.rh - 169 / 16900) < 1e-9);
  assert.ok(Math.abs(a.re - 15800 / 16900) < 1e-9);
  assert.ok(Math.abs(eur.eur.retenue - STAT_DAP * 15800 / 16900) < 0.01);
});
test('tableau de bord : sans prévision, alerte et échéances', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const d = appel(env, 'tableauDeBord').data;
  assert.strictEqual(d.version, null);
  assert.ok(d.alertes.some((a) => a.titre === 'Aucune prévision'));
  assert.ok(d.alertes.some((a) => /Budget/.test(a.detail) && a.titre === 'Source non connectée'));
  assert.strictEqual(d.echeances.filter((e) => e.courante).length, 1);
});
test('tableau de bord : écarts, saisies non appliquées, articles non reconduits', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', quantite: -9000, motif: 'm' }, 'c1');
  let d = appel(env, 'tableauDeBord').data;
  assert.ok(d.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  env.run("apiArbitrer({}, 'a1')");
  d = appel(env, 'tableauDeBord').data;
  assert.ok(!d.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  assert.ok(d.alertes.some((a) => /^Écart vs 2025 > 15 %$/.test(a.titre) && /D\.A\.P\./.test(a.detail)));
  assert.strictEqual(d.version.type, 'ARBITREE');
});
test('tableau de bord : un arrêt ajouté après la version, ou une annulation, est signalé comme non appliqué', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  appel(env, 'reprevision', [{ corrections: [{ entite: 'Coop EUREDEN', code: DAP, quantite: -5 }], motif: 'm' }, 'rp1']);
  assert.ok(!appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  ajout(env, { nature: 'ARRET', ancien: ONA_ART }, 's1');
  assert.ok(appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  appel(env, 'reprevision', [{ corrections: [] }, 'rp2']);
  assert.ok(!appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  env.run("apiAnnulerAjustement('SUBSTITUTION', 'SUB_001', 'n1')");
  assert.ok(appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
});
test('tableau de bord : une source budget déclarée n\'apparaît plus comme manquante', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'BUD', Nature: 'BUDGET', 'ID fichier': 'FICHIER_BUDGET_00000000001', 'Actif import': 'OUI' }]);
  const d = appel(env, 'tableauDeBord').data;
  assert.ok(!d.alertes.some((a) => a.titre === 'Source non connectée' && /Budget/.test(a.detail)));
});
test('sources : état de chaque fichier déclaré, liens réservés à la configuration', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [
    { 'ID source': 'SANS_ID', Nature: 'BUDGET', 'Actif import': 'OUI' },
    { 'ID source': 'INACTIVE', Nature: 'STOCKS', 'ID fichier': 'FICHIER_STOCKS_0000000001', 'Actif import': 'NON' },
    { 'ID source': 'CASSEE', Nature: 'STOCKS', 'ID fichier': 'FICHIER_INCONNU_0000000001', Onglet: 'X', 'Actif import': 'OUI' }
  ]);
  const r = appel(env, 'sources').data;
  const par = (id) => r.sources.filter((x) => x.id === id)[0];
  assert.strictEqual(par('HISTO_EUREDEN').etat, 'OK');
  assert.strictEqual(par('HISTO_EUREDEN').lignes, 5);
  assert.ok(/docs.google.com\/spreadsheets\/d\/FICHIER_HISTO_EUREDEN_0001/.test(par('HISTO_EUREDEN').lien));
  assert.strictEqual(par('SANS_ID').etat, 'A_CONNECTER');
  assert.strictEqual(par('INACTIVE').etat, 'INACTIF');
  assert.strictEqual(par('CASSEE').etat, 'ERREUR');
  assert.strictEqual(r.fichiers.length, 2);
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  const s2 = appel(env2, 'sources').data;
  assert.strictEqual(s2.fichiers.length, 0);
  assert.ok(s2.sources.every((x) => !x.lien));
});

// ---------- Corrections de l'historique ----------
const corrH = (env, o, op) => ajout(env, Object.assign({ nature: 'HISTORIQUE', entite: 'Coop EUREDEN', code: DAP, annee: '2025', type: 'RUPTURE', corrigee: 20000, motif: 'Rupture de 3 semaines' }, o), op || ('h' + Math.random()));

test('historique corrigé : enregistrement avec le brut relevé côté serveur', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r = corrH(env, {}, 'h1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.id, 'HIS0001');
  assert.strictEqual(r.data.resultat.brute, 16900);
  const l = env.lignes('SORTIE1', 'CORRECTIONS_HISTO')[0];
  assert.strictEqual(l['Qte brute'], 16900);
  assert.strictEqual(l['Qte corrigee'], 20000);
  assert.strictEqual(l['Semaine debut'], '2025-S01');
  assert.strictEqual(l.Statut, 'ACTIVE');
  assert.strictEqual(l['Methode estimation'], 'MANUELLE');
});
test('historique corrigé : l\'écran Historique applique la correction et garde le brut', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  corrH(env, {}, 'h1');
  const d = env.run('apiHistorique()').data;
  const a = d.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.parAnnee['2025'].qte, 20000);
  assert.strictEqual(a.parAnnee['2025'].brute.qte, 16900);
  assert.strictEqual(a.parAnnee['2025'].corrige.type, 'RUPTURE');
  assert.ok(Math.abs(a.parAnnee['2025'].ha - 169 * 20000 / 16900) < 1e-9);
  assert.strictEqual(d.nbCorrections, 1);
  const t = d.totaux.filter((x) => x.entite === 'Coop EUREDEN' && x.annee === '2025')[0];
  assert.strictEqual(t.deltaQte, 3100);
});
test('historique corrigé : la statistique et le réalisé de référence partent de l\'historique corrigé', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  corrH(env, {}, 'h1');
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = prevLigne(env, DAP);
  assert.strictEqual(d['Qte historique corrigee N-1'], 20000);
  assert.strictEqual(d['Qte statistique'], 18282.688);
});
test('historique corrigé : une nouvelle correction remplace la précédente, l\'annulation rend le brut', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  corrH(env, { corrigee: 20000 }, 'h1');
  corrH(env, { corrigee: 18000 }, 'h2');
  assert.deepStrictEqual(env.lignes('SORTIE1', 'CORRECTIONS_HISTO').map((x) => x.Statut), ['ANNULEE', 'ACTIVE']);
  assert.strictEqual(env.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0].parAnnee['2025'].qte, 18000);
  assert.strictEqual(env.run("apiAnnulerAjustement('HISTORIQUE', 'HIS0002', 'n1')").ok, true);
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  corrH(env2, {}, 'h1');
  env2.run("apiAnnulerAjustement('HISTORIQUE', 'HIS0001', 'n1')");
  assert.strictEqual(env2.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0].parAnnee['2025'].qte, 16900);
  assert.strictEqual(env2.run("apiAnnulerAjustement('HISTORIQUE', 'HIS0001', 'n2')").code, 'DEJA_ANNULE');
});
test('historique corrigé : article sans vente cette année, créé par la correction', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const r = corrH(env, { code: '9999999', corrigee: 100 }, 'h1');
  assert.ok(/faute de frappe/.test(r.data.resultat.avertissement));
  env.run("apiCalculerStatistique({}, 'op0')");
  assert.strictEqual(prevLigne(env, '9999999', 'Coop EUREDEN')['Qte historique corrigee N-1'], 100);
});
test('historique corrigé : contrôles du type, de l\'année, de la quantité, du motif et de l\'entité', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const code = (o) => corrH(env, o).code;
  assert.strictEqual(code({ type: 'N IMPORTE QUOI' }), 'TYPE_INVALIDE');
  assert.strictEqual(code({ annee: '25' }), 'ANNEE_INVALIDE');
  assert.strictEqual(code({ annee: '2031' }), 'ANNEE_INCONNUE');
  assert.strictEqual(code({ corrigee: -5 }), 'QUANTITE_INVALIDE');
  assert.strictEqual(code({ corrigee: '' }), 'QUANTITE_INVALIDE');
  assert.strictEqual(code({ motif: '' }), 'MOTIF_OBLIGATOIRE');
  assert.strictEqual(code({ entite: 'Inconnue' }), 'ENTITE_INCONNUE');
  assert.strictEqual(code({ code: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(env.lignes('SORTIE1', 'CORRECTIONS_HISTO').length, 0);
});
test('historique corrigé : droits, et un TC voit toujours le brut', () => {
  const env = envPrev(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(corrH(env, {}, 'r1').code, 'CAPACITE_REFUSEE');
  env.moi('guillaume@eureden.com');
  corrH(env, {}, 'h1');
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  corrH(env2, {}, 'h1');
  env2.moi('tc.ok@eureden.com');
  const a = env2.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.parAnnee['2025'].qte, 900);
  assert.strictEqual(a.parAnnee['2025'].brute, undefined);
});
test('historique corrigé : l\'alerte de saisies non appliquées inclut les corrections d\'historique', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  corrH(env, {}, 'h1');
  assert.ok(appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  appel(env, 'reprevision', [{ corrections: [] }, 'rp1']);
  assert.ok(!appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Saisies non appliquées'));
  assert.strictEqual(prevLigne(env, DAP)['Qte historique corrigee N-1'], 20000);
});
test('historique corrigé : la liste des saisies expose les corrections d\'historique actives', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  corrH(env, {}, 'h1');
  const l = env.run('apiAjustements()').data.historique;
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].brute, 16900);
  assert.strictEqual(l[0].annee, '2025');
});

let echecs = 0;
tests.forEach(({ nom, fn }) => {
  try { fn(); console.log('  ok   ' + nom); } catch (e) { echecs++; console.log('  ECHEC ' + nom + '\n        ' + (e.message || e).split('\n')[0]); }
});
console.log('\n' + (tests.length - echecs) + ' / ' + tests.length + ' tests réussis');
process.exit(echecs ? 1 : 0);
