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
test('une version validée ne se crée pas directement, même par ADMIN', () => {
  const env = creerEnvStandard(); env.moi('admin@eureden.com');
  assert.strictEqual(erreur(env, "Versions.create(Auth.resolve(), {type: 'VALIDEE', libelle: 'x'}, 'o')"), 'VALIDATION_PAR_ECRAN');
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
  assert.ok(r.avertissements.some((a) => /n'a pas de prévision de départ/.test(a)));
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

// ---------- Validation, comparaison, fiabilité réelle, journal ----------
const reprev = (env, corr, op) => appel(env, 'reprevision', [{ corrections: corr, motif: 'm' }, op]);

test('validation : version VALIDEE verrouillée, quantités validées et photo écrites', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], 'rp1');
  const r = appel(env, 'validerVersion', [{ commentaire: 'Comité du 12/10' }, 'v1']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.idVersion, 'V002');
  const v = env.lignes('SORTIE1', 'VERSIONS');
  assert.deepStrictEqual(v.map((x) => x.Type + ':' + x.Statut), ['ARBITREE:ARCHIVEE', 'VALIDEE:COURANTE']);
  assert.strictEqual(v[1].Verrouillee, 'OUI');
  const d = prevLigne(env, DAP);
  assert.strictEqual(d.Statut, 'VALIDEE');
  assert.strictEqual(d['Qte validee'], STAT_DAP - 1000);
  assert.strictEqual(d.Version, 'V002');
  assert.strictEqual(d['Qte correction'], -1000);
  assert.strictEqual(typeof d['Code produit'], 'string');
  assert.strictEqual(env.lignes('SORTIE1', 'INSTANTANES').filter((x) => x['ID version'] === 'V002').length, 2);
  assert.ok(env.lignes('SORTIE1', 'JOURNAL').some((j) => j.Action === 'VERSION_VALIDEE' && j['Ancienne valeur'] === 'V001'));
});
test('validation : refusée pour une version statistique, déjà validée, sans droit', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  assert.strictEqual(appel(env, 'validerVersion', [{}, 'v1']).code, 'VERSION_NON_ARBITREE');
  reprev(env, [], 'rp1');
  assert.strictEqual(appel(env, 'validerVersion', [{}, 'v2']).ok, true);
  assert.strictEqual(appel(env, 'validerVersion', [{}, 'v3']).code, 'VERSION_DEJA_VERROUILLEE');
  env.moi('guillaume@eureden.com');
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  reprev(env2, [], 'rp1');
  assert.strictEqual(appel(env2, 'validerVersion', [{}, 'v1']).code, 'CAPACITE_REFUSEE');
});
test('validation : sans version, refusée ; après validation plus de recalcul ni de reprévision', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  assert.strictEqual(appel(env, 'validerVersion', [{}, 'v0']).code, 'VERSION_INCONNUE');
  reprev(env, [], 'rp1');
  appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(env.run("apiCalculerStatistique({}, 'x1')").code, 'VERSION_VERROUILLEE');
  assert.strictEqual(reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: 5 }], 'x2').code, 'VERSION_VERROUILLEE');
});
test('validation : opération rejouée sans doublon', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  reprev(env, [], 'rp1');
  appel(env, 'validerVersion', [{}, 'v1']);
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.data.rejoue, true);
  assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 2);
});
test('comparaison de versions : écarts par article et totaux', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], 'rp1');
  const r = appel(env, 'comparerVersions', ['V001', 'V002']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.totaux.delta, -1000);
  assert.strictEqual(r.data.nbModifiees, 1);
  assert.strictEqual(r.data.lignes[0].code, DAP);
  assert.strictEqual(r.data.lignes[0].delta, -1000);
  assert.strictEqual(r.data.lignes[0].libelle, 'D.A.P. 35K');
  assert.strictEqual(appel(env, 'comparerVersions', ['V001', 'V009']).code, 'VERSION_INCONNUE');
});
test('journal : lu par la configuration et l\'arbitrage, plus récent d\'abord, refusé aux autres', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1 }], 'rp1');
  const j = appel(env, 'journal', [50]).data;
  assert.ok(j.length >= 4);
  assert.ok(j[0].le >= j[j.length - 1].le);
  assert.ok(j.some((x) => x.action === 'PREVISION_ARBITREE'));
  const env2 = envPrev(); env2.moi('tc.ok@eureden.com');
  assert.strictEqual(appel(env2, 'journal', [50]).code, 'CAPACITE_REFUSEE');
});
test('fiabilité réelle : indisponible sans année de prévision ou sans ventes de cette année', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const a = appel(env, 'fiabiliteReelle').data;
  assert.strictEqual(a.disponible, false);
  assert.ok(/année de prévision/.test(a.raison));
  const env2 = envPrev(); env2.moi('guillaume@eureden.com');
  env2.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2027;
  env2.run("apiCalculerStatistique({}, 'op0')");
  const b = appel(env2, 'fiabiliteReelle').data;
  assert.strictEqual(b.disponible, false);
  assert.ok(/2027/.test(b.raison));
});
test('fiabilité réelle : erreur et biais calculés contre les ventes brutes de l\'année prévue', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2025;
  env.run("apiCalculerStatistique({}, 'op0')");
  const r = appel(env, 'fiabiliteReelle').data;
  assert.strictEqual(r.disponible, true);
  assert.strictEqual(r.annee, '2025');
  const attendu = Math.abs(16345.188 - 16900) / 16950;
  assert.ok(Math.abs(r.global.erreur - attendu) < 1e-6);
  assert.ok(Math.abs(r.global.biais - ((16345.188 + 50) / 16950 - 1)) < 1e-6);
  assert.strictEqual(r.parEntite.length, 2);
});

// ---------- Cadençage et publication ----------
const envCad = () => { const env = envPrev(); env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2027; return env; };
const sauverCoef = (env, o, op) => appel(env, 'sauverCoefficients', [Object.assign({ niveau: 'GLOBAL', coefficients: { 5: 25, 6: 25, 7: 25, 8: 25 } }, o), op || ('k' + Math.random())]);
const coefLignes = (env) => env.lignes('PARAM_FICHIER_TEST_00001', 'COEFFICIENTS');

test('calendrier ISO : semaines par année et rattachement au mois du jeudi', () => {
  const env = creerEnvStandard();
  assert.strictEqual(env.run('Cadencage.nbSemaines(2026)'), 53);
  assert.strictEqual(env.run('Cadencage.nbSemaines(2027)'), 52);
  assert.strictEqual(env.run('Cadencage.nbSemaines(2020)'), 53);
  assert.strictEqual(env.run('Cadencage.mois(2027, 5)'), '2027-02');
  assert.strictEqual(env.run('Cadencage.mois(2027, 9)'), '2027-03');
  assert.strictEqual(env.run('Cadencage.mois(2027, 13)'), '2027-04');
  assert.strictEqual(env.run('Cadencage.mois(2026, 1)'), '2026-01');
  assert.strictEqual(env.run('Cadencage.mois(2025, 1)'), '2025-01');
  assert.strictEqual(env.run('Cadencage.mois(2026, 53)'), '2026-12');
  assert.strictEqual(env.run('Cadencage.etiquette(2027, 5)'), '2027-S05');
});
test('répartition : parts exactes, arrondis repris sur la première des plus grosses semaines', () => {
  const env = creerEnvStandard();
  const r = env.run('Cadencage.repartir(100, { semaines: { 5: 1, 6: 1, 7: 1 } })');
  assert.deepStrictEqual(r.map((x) => x.qte), [33.334, 33.333, 33.333]);
  assert.strictEqual(Math.round(r.reduce((s, x) => s + x.qte, 0) * 1000) / 1000, 100);
  const q = env.run('Cadencage.repartir(1000, { semaines: { 5: 10, 6: 30, 7: 60 } })');
  assert.deepStrictEqual(q.map((x) => x.qte), [100, 300, 600]);
});
test('coefficients : enregistrement, version, remplacement des lignes du même jeu', () => {
  const env = envCad(); env.moi('guillaume@eureden.com');
  const r = sauverCoef(env, {}, 'k1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.version, 1);
  let l = coefLignes(env);
  assert.strictEqual(l.length, 4);
  assert.ok(l.every((x) => x['ID campagne'] === 'SOP_2027_PAC2' && x.Niveau === 'GLOBAL' && x['Cle niveau'] === '*' && x.Validation === 'A_VALIDER' && x.Origine === 'MANUEL'));
  const r2 = sauverCoef(env, { coefficients: { 6: 50, 7: 50 } }, 'k2');
  assert.strictEqual(r2.data.resultat.version, 2);
  l = coefLignes(env);
  assert.deepStrictEqual(l.map((x) => x.Semaine), [6, 7]);
  assert.ok(env.lignes('SORTIE1', 'JOURNAL').some((j) => j.Action === 'COEFFICIENTS_MODIFIES'));
});
test('coefficients : un autre jeu et les autres campagnes ne sont pas touchés', () => {
  const env = envCad(); env.moi('guillaume@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'COEFFICIENTS', [{ 'ID campagne': 'AUTRE', Niveau: 'GLOBAL', 'Cle niveau': '*', Semaine: 10, Coefficient: 100, Validation: 'VALIDE' }]);
  sauverCoef(env, {}, 'k1');
  sauverCoef(env, { niveau: 'ARTICLE', cle: DAP, coefficients: { 8: 100 } }, 'k2');
  sauverCoef(env, { coefficients: { 9: 100 } }, 'k3');
  const l = coefLignes(env);
  assert.strictEqual(l.filter((x) => x['ID campagne'] === 'AUTRE').length, 1);
  assert.strictEqual(l.filter((x) => x.Niveau === 'ARTICLE').length, 1);
  assert.deepStrictEqual(l.filter((x) => x.Niveau === 'GLOBAL' && x['ID campagne'] === 'SOP_2027_PAC2').map((x) => x.Semaine), [9]);
});
test('coefficients : somme, semaine, valeur, niveau, code et année contrôlés', () => {
  const env = envCad(); env.moi('guillaume@eureden.com');
  const code = (o) => sauverCoef(env, o).code;
  assert.strictEqual(code({ coefficients: { 5: 50, 6: 40 } }), 'SOMME_INVALIDE');
  assert.strictEqual(code({ coefficients: { 5: 50, 53: 50 } }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ coefficients: { 5: 150, 6: -50 } }), 'COEFFICIENT_INVALIDE');
  assert.strictEqual(code({ coefficients: { x: 100 } }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ coefficients: {} }), 'COEFFICIENT_INVALIDE');
  assert.strictEqual(code({ niveau: 'FAMILLE' }), 'NIVEAU_INVALIDE');
  assert.strictEqual(code({ niveau: 'MARCHE' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(code({ niveau: 'ARTICLE', cle: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(coefLignes(env).length, 0);
  const sans = envPrev(); sans.moi('guillaume@eureden.com');
  assert.strictEqual(sauverCoef(sans).code, 'ANNEE_PREVISION_ABSENTE');
  const ok = envCad(); ok.moi('guillaume@eureden.com');
  assert.strictEqual(sauverCoef(ok, { coefficients: { 5: '33,33', 6: '33,33', 7: '33,34' } }).ok, true);
});
test('coefficients : droits, campagne gelée, opération rejouée, suppression et validation', () => {
  const env = envCad(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(sauverCoef(env).code, 'CAPACITE_REFUSEE');
  const env2 = envCad(); env2.moi('guillaume@eureden.com');
  sauverCoef(env2, {}, 'k1');
  assert.strictEqual(sauverCoef(env2, {}, 'k1').data.rejoue, true);
  assert.strictEqual(coefLignes(env2).length, 4);
  sauverCoef(env2, { niveau: 'ARTICLE', cle: DAP, coefficients: { 8: 100 } }, 'k2');
  assert.strictEqual(appel(env2, 'supprimerCoefficients', ['GLOBAL', '*', 's0']).code, 'NIVEAU_INVALIDE');
  assert.strictEqual(appel(env2, 'supprimerCoefficients', ['ARTICLE', '0000000', 's1']).code, 'CADENCAGE_INCONNU');
  assert.strictEqual(appel(env2, 'supprimerCoefficients', ['ARTICLE', DAP, 's2']).ok, true);
  assert.strictEqual(coefLignes(env2).filter((x) => x.Niveau === 'ARTICLE').length, 0);
  assert.strictEqual(appel(env2, 'validerCoefficients', ['GLOBAL', '*', 'v1']).code, 'CAPACITE_REFUSEE');
  const env3 = envCad(); env3.moi('admin@eureden.com');
  sauverCoef(env3, {}, 'k1');
  assert.strictEqual(appel(env3, 'validerCoefficients', ['GLOBAL', '*', 'v1']).ok, true);
  assert.ok(coefLignes(env3).every((x) => x.Validation === 'VALIDE' && x['Valide par'] === 'admin@eureden.com'));
  const env4 = envCad(); env4.moi('guillaume@eureden.com');
  env4.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(sauverCoef(env4).code, 'CAMPAGNE_FERMEE');
});
test('cadençage : répartition de la quantité retenue par semaine et par mois', () => {
  const env = envCad(); env.moi('guillaume@eureden.com');
  reprev(env, [], 'rp1');
  sauverCoef(env, { coefficients: { 5: 10, 9: 30, 13: 60 } }, 'k1');
  const d = appel(env, 'cadencage').data;
  assert.strictEqual(d.annee, 2027);
  assert.deepStrictEqual(d.semaines.map((x) => x.etiquette), ['2027-S05', '2027-S09', '2027-S13']);
  assert.deepStrictEqual(d.mois.map((x) => x.mois), ['2027-02', '2027-03', '2027-04']);
  const total = d.semaines.reduce((s, x) => s + x.parEntite['Coop EUREDEN'].q, 0);
  assert.ok(Math.abs(total - STAT_DAP) < 1e-6);
  assert.ok(Math.abs(d.mois[2].parEntite['Coop EUREDEN'].q - STAT_DAP * 0.6) < 1e-6);
  assert.strictEqual(d.nonCadences, 0);
  assert.strictEqual(d.jeux.length, 1);
});
test('cadençage : le jeu d\'un article prime sur le global, les articles sans jeu sont comptés', () => {
  const env = envCad(); env.moi('guillaume@eureden.com');
  reprev(env, [], 'rp1');
  sauverCoef(env, { niveau: 'ARTICLE', cle: DAP, coefficients: { 5: 100 } }, 'k1');
  let d = appel(env, 'cadencage').data;
  assert.strictEqual(d.nonCadences, 1);
  assert.deepStrictEqual(d.semaines.map((x) => x.etiquette), ['2027-S05']);
  sauverCoef(env, { coefficients: { 9: 100 } }, 'k2');
  d = appel(env, 'cadencage').data;
  assert.strictEqual(d.nonCadences, 0);
  assert.deepStrictEqual(d.semaines.map((x) => x.etiquette), ['2027-S05', '2027-S09']);
  assert.ok(Math.abs(d.semaines[0].parEntite['Coop EUREDEN'].q - STAT_DAP) < 1e-6);
  assert.ok(Math.abs(d.semaines[1].parEntite['NEGOCE ONA'].q - 50) < 1e-6);
});
test('cadençage : sans année ou sans jeu, réponse vide', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const d = appel(env, 'cadencage').data;
  assert.deepStrictEqual(d.semaines, []);
  assert.strictEqual(d.annee, 0);
});
test('publication : la validation écrit les onglets mensuel et hebdomadaire et le contrat', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  sauverCoef(env, { coefficients: { 5: 10, 9: 30, 13: 60 } }, 'k1');
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], 'rp1');
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.data.resultat.publication.ecrit, true);
  const h = env.lignes('SORTIE1', 'PUBLICATION_HEBDO'), m = env.lignes('SORTIE1', 'PUBLICATION_MENSUELLE');
  assert.strictEqual(h.length, 6);
  assert.strictEqual(m.length, 6);
  const dapH = h.filter((x) => x['Code produit'] === DAP);
  assert.deepStrictEqual(dapH.map((x) => x.Semaine), ['2027-S05', '2027-S09', '2027-S13']);
  assert.ok(Math.abs(dapH.reduce((s, x) => s + x['Quantite demande'], 0) - (STAT_DAP - 1000)) < 1e-9);
  assert.ok(dapH.every((x) => x['ID version'] === 'V002' && x['Version contrat'] === '1.0' && x['ID campagne'] === 'SOP_2027_PAC2' && x.Scenario === 'BASE' && x['Quantite reelle'] === x['Quantite demande']));
  const dapM = m.filter((x) => x['Code produit'] === DAP);
  assert.deepStrictEqual(dapM.map((x) => x.Mois), ['2027-02', '2027-03', '2027-04']);
  assert.ok(Math.abs(dapM[2]['Quantite demande'] - (STAT_DAP - 1000) * 0.6) < 0.002);
  const contrat = env.lignes('SORTIE1', 'CONTRAT');
  assert.ok(contrat.length > 20);
  assert.ok(contrat.every((x) => x['Version contrat'] === '1.0'));
  assert.ok(contrat.some((x) => x.Onglet === 'PUBLICATION_MENSUELLE' && x.Colonne === 'Mois' && x.Description === 'AAAA-MM'));
  assert.ok(env.lignes('SORTIE1', 'JOURNAL').some((j) => j.Action === 'PUBLICATION_ECRITE'));
});
test('publication : sans cadençage la validation réussit mais rien n\'est publié, puis republication', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  reprev(env, [], 'rp1');
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.publication.ecrit, false);
  assert.ok(/Aucun cadençage/.test(r.data.resultat.publication.raison));
  assert.strictEqual(env.lignes('SORTIE1', 'PUBLICATION_HEBDO').length, 0);
  sauverCoef(env, { coefficients: { 5: 50, 6: 50 } }, 'k1');
  const p = appel(env, 'republier', ['p1']);
  assert.strictEqual(p.data.resultat.ecrit, true);
  assert.strictEqual(env.lignes('SORTIE1', 'PUBLICATION_HEBDO').length, 4);
  appel(env, 'republier', ['p2']);
  assert.strictEqual(env.lignes('SORTIE1', 'PUBLICATION_HEBDO').length, 4);
  assert.strictEqual(env.lignes('SORTIE1', 'PUBLICATION_MENSUELLE').length, 2);
});
test('publication : republier demande une version validée et le droit de validation', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  assert.strictEqual(appel(env, 'republier', ['p0']).code, 'VERSION_NON_VALIDEE');
  reprev(env, [], 'rp1');
  assert.strictEqual(appel(env, 'republier', ['p1']).code, 'VERSION_NON_VALIDEE');
  const env2 = envCad(); env2.moi('guillaume@eureden.com');
  assert.strictEqual(appel(env2, 'republier', ['p2']).code, 'CAPACITE_REFUSEE');
});

// ---------- Stocks et approvisionnements ----------
const F_STOCK = 'FICHIER_STOCKS_0000000001', F_CMD = 'FICHIER_COMMANDES_00000001';
function envStock(opts) {
  opts = opts || {};
  const env = envCad(); env.moi('admin@eureden.com');
  env.ajouterClasseur(F_STOCK, { Stocks: [['Date stock', 'Plateforme', 'Code produit', 'Entite', 'Stock'],
    ['2026-12-28', 'GLOMEL', DAP, 'Coop EUREDEN', 9999],
    ['2027-01-04', 'GLOMEL', DAP, 'Coop EUREDEN', 5000],
    ['04/01/2027', 'GRUEL', DAP, 'Coop EUREDEN', 3000],
    ['2027-01-04', 'GLOMEL', ONA_ART, 'NEGOCE ONA', opts.stockOna === undefined ? 100 : opts.stockOna]] });
  env.ajouterClasseur(F_CMD, { Commandes: [['N commande', 'Code fournisseur', 'Code produit', 'Code point', 'Date limite livraison', 'Quantite reste a livrer'],
    ['C1', 'F1', DAP, 'GLOMEL', '2027-02-08', 4000],
    ['C2', 'F1', DAP, 'GLOMEL', '2027-02-09', 0],
    ['C3', 'F2', DAP, 'GLOMEL', '2026-11-01', opts.retard || 0]] });
  const base = { 'Actif import': 'OUI' };
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [Object.assign({ 'ID source': 'STK', Nature: 'STOCKS', 'ID fichier': F_STOCK, Onglet: 'Stocks' }, base)].concat(
    opts.sansCommandes ? [] : [Object.assign({ 'ID source': 'CMD', Nature: 'COMMANDES_FOURN', 'ID fichier': F_CMD, Onglet: 'Commandes' }, base)]));
  if (opts.contraintes) env.semer('PARAM_FICHIER_TEST_00001', 'CONTRAINTES_APPRO', opts.contraintes);
  if (opts.parametres) env.semer('PARAM_FICHIER_TEST_00001', 'PARAMETRES_STOCK', opts.parametres);
  reprev(env, [], 'rp1');
  sauverCoef(env, { coefficients: { 5: 25, 6: 25, 7: 25, 8: 25 } }, 'k1');
  return env;
}
const proj = (env) => appel(env, 'stocks');
const art = (d, code) => d.articles.filter((a) => a.code === code)[0];

test('dates : lecture des formats et semaine ISO', () => {
  const env = creerEnvStandard();
  assert.strictEqual(env.run("Cadencage.semaineDe(Cadencage.dateDe('2027-02-08')).etiquette"), '2027-S06');
  assert.strictEqual(env.run("Cadencage.semaineDe(Cadencage.dateDe('08/02/2027')).etiquette"), '2027-S06');
  assert.strictEqual(env.run("Cadencage.semaineDe(Cadencage.dateDe('2027-01-03')).etiquette"), '2026-S53');
  assert.strictEqual(env.run("Cadencage.semaineDe(Cadencage.dateDe('2027-01-04')).etiquette"), '2027-S01');
  assert.strictEqual(env.run("Cadencage.semaineDe(Cadencage.dateDe('2026-12-31')).etiquette"), '2026-S53');
  assert.strictEqual(env.run("Cadencage.dateDe('n importe quoi')"), null);
});
test('stocks : rupture prévue, semaine, manque et besoin de réapprovisionnement', () => {
  const env = envStock();
  const d = proj(env).data;
  assert.strictEqual(d.dateStock, '2027-01-04');
  assert.strictEqual(d.debut, '2027-S01');
  assert.strictEqual(d.kpis.ruptures, 1);
  const a = art(d, DAP);
  assert.strictEqual(a.stock0, 8000);
  assert.strictEqual(a.alerte, 'RUPTURE');
  assert.strictEqual(a.semaineRupture, '2027-S07');
  assert.ok(Math.abs(a.manque - 4345.188) < 0.01);
  assert.strictEqual(a.receptions, 4000);
  assert.strictEqual(d.semaines[d.semaines.indexOf('2027-S05')], '2027-S05');
  assert.ok(Math.abs(a.serie[d.semaines.indexOf('2027-S06')] - 3827.406) < 0.01);
  assert.strictEqual(d.besoins.length, 1);
  assert.strictEqual(d.besoins[0].code, DAP);
  assert.strictEqual(d.besoins[0].semaineBesoin, '2027-S07');
  assert.strictEqual(d.besoins[0].fournisseur, 'F1');
});
test('stocks : seul le dernier relevé compte, plateformes additionnées par article', () => {
  const d = proj(envStock()).data;
  assert.strictEqual(art(d, DAP).stock0, 8000);
  const glomel = d.plateformes.filter((p) => p.plateforme === 'GLOMEL')[0];
  assert.strictEqual(glomel.stock, 5100);
  assert.strictEqual(glomel.articles, 2);
  assert.strictEqual(d.plateformes.filter((p) => p.plateforme === 'GRUEL')[0].stock, 3000);
});
test('stocks : une commande en retard est reçue dès la première semaine, une commande soldée est ignorée', () => {
  const d = proj(envStock({ retard: 500 })).data;
  const a = art(d, DAP);
  assert.strictEqual(a.receptions, 4500);
  assert.strictEqual(a.serie[0], 8500);
});
test('stocks : article sans rupture ni surstock, couverture en semaines', () => {
  const a = art(proj(envStock()).data, ONA_ART);
  assert.strictEqual(a.alerte, 'AUCUNE');
  assert.strictEqual(a.fin, 50);
  assert.ok(Math.abs(a.couverture - 8) < 0.01);
});
test('stocks : surstock quand le stock de fin dépasse la couverture maximale', () => {
  const d = proj(envStock({ stockOna: 10000 })).data;
  assert.strictEqual(art(d, ONA_ART).alerte, 'SURSTOCK');
  assert.strictEqual(d.kpis.surstocks, 1);
});
test('stocks : stock mini, lot de réappro et délai fournisseur', () => {
  const env = envStock({
    parametres: [{ Plateforme: 'GLOMEL', 'Code produit': DAP, 'Stock mini': 500, 'Lot reappro': 1000, Actif: 'OUI' }],
    contraintes: [{ 'Code fournisseur': 'F9', 'Code produit': DAP, 'Lead time semaines': 2 }]
  });
  const d = proj(env).data;
  const a = art(d, DAP);
  assert.strictEqual(a.mini, 500);
  assert.strictEqual(a.semaineRupture, '2027-S07');
  const b = d.besoins[0];
  assert.ok(Math.abs(b.manque - (500 + 4345.188)) < 0.01);
  assert.strictEqual(b.aCommander, 5000);
  assert.strictEqual(b.delai, 2);
  assert.strictEqual(b.semaineCommande, '2027-S05');
  assert.strictEqual(b.fournisseur, 'F9');
  assert.strictEqual(b.enRetard, false);
});
test('stocks : un délai plus long que le temps disponible est signalé en retard', () => {
  const env = envStock({ contraintes: [{ 'Code fournisseur': 'F9', 'Code produit': DAP, 'Lead time semaines': 12 }] });
  const b = proj(env).data.besoins[0];
  assert.strictEqual(b.enRetard, true);
  assert.strictEqual(b.semaineCommande, '2027-S01');
});
test('stocks : sans source, colonne manquante ou relevé vide', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  assert.strictEqual(proj(env).code, 'STOCK_SANS_SOURCE');
  const env2 = envStock();
  env2.classeurs[F_STOCK]._feuilles.Stocks._data[0][4] = 'Autre';
  assert.strictEqual(proj(env2).code, 'SOURCE_COLONNES');
  const env3 = envStock();
  env3.classeurs[F_STOCK]._feuilles.Stocks._data.length = 1;
  assert.strictEqual(proj(env3).code, 'STOCK_VIDE');
});
test('stocks : sans commandes fournisseurs ni cadençage la projection reste possible', () => {
  const env = envStock({ sansCommandes: true });
  let d = proj(env).data;
  assert.strictEqual(d.commandesConnectees, false);
  assert.strictEqual(art(d, DAP).receptions, 0);
  const env2 = envCad(); env2.moi('admin@eureden.com');
  env2.ajouterClasseur(F_STOCK, { Stocks: [['Date stock', 'Plateforme', 'Code produit', 'Stock'], ['2027-01-04', 'GLOMEL', DAP, 10]] });
  env2.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'STK', Nature: 'STOCKS', 'ID fichier': F_STOCK, Onglet: 'Stocks', 'Actif import': 'OUI' }]);
  d = proj(env2).data;
  assert.strictEqual(d.demandeConnectee, false);
  assert.strictEqual(art(d, DAP).alerte, 'AUCUNE');
});
test('stocks : le tableau de bord remonte les ruptures, et une source illisible devient une alerte', () => {
  const env = envStock();
  const al = appel(env, 'tableauDeBord').data.alertes;
  assert.ok(al.some((a) => a.titre === 'Rupture prévue' && /2027-S07/.test(a.detail)));
  const env2 = envStock();
  delete env2.classeurs[F_STOCK]._feuilles.Stocks;
  const al2 = appel(env2, 'tableauDeBord').data.alertes;
  assert.ok(al2.some((a) => a.titre === 'Stocks illisibles' && a.niveau === 'ERREUR'));
});
test('stocks : la validation publie les commandes proposées', () => {
  const env = envStock();
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.publication.appro.ecrit, true);
  const l = env.lignes('SORTIE1', 'PUBLICATION_APPRO');
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0]['Code produit'], DAP);
  assert.strictEqual(l[0]['Code fournisseur'], 'F1');
  assert.strictEqual(l[0].Statut, 'PROPOSEE');
  assert.strictEqual(l[0]['Semaine livraison'], '2027-S07');
  assert.ok(Math.abs(l[0].Quantite - 4345.188) < 0.01);
  assert.strictEqual(l[0]['Version contrat'], '1.0');
});
test('stocks : sans source de stocks la publication d\'approvisionnement reste vide et le dit', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  sauverCoef(env, { coefficients: { 5: 100 } }, 'k1');
  reprev(env, [], 'rp1');
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.data.resultat.publication.appro.ecrit, false);
  assert.strictEqual(env.lignes('SORTIE1', 'PUBLICATION_APPRO').length, 0);
});

// ---------- Cache de l'historique ----------
const ouv = (env, id) => env.ouvertures[id] || 0;

test('cache : la deuxième exécution ne relit pas les fichiers d\'historique', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const a = env.run('apiHistorique()').data;
  const n = ouv(env, FICHIER_EUR);
  assert.ok(n >= 1);
  env.nouvelleExecution();
  const b = env.run('apiHistorique()').data;
  assert.strictEqual(ouv(env, FICHIER_EUR), n);
  assert.deepStrictEqual(b.totaux, a.totaux);
  assert.deepStrictEqual(b.articles, a.articles);
});
test('cache : actualiser force la relecture', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run('apiHistorique()');
  env.nouvelleExecution();
  const n = ouv(env, FICHIER_EUR);
  assert.strictEqual(appel(env, 'actualiser').ok, true);
  env.nouvelleExecution();
  env.run('apiHistorique()');
  assert.ok(ouv(env, FICHIER_EUR) > n);
});
test('cache : un changement dans SOURCES change la clé', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run('apiHistorique()');
  const nb = Object.keys(env.cache).filter((k) => /:n$/.test(k)).length;
  env.nouvelleExecution();
  env.feuille('PARAM_FICHIER_TEST_00001', 'SOURCES')._data[1][15] = '2025';
  env.run('apiHistorique()');
  assert.strictEqual(Object.keys(env.cache).filter((k) => /:n$/.test(k)).length, nb + 1);
});
test('cache : gros historique découpé en entrées de moins de 100 Ko, résultat identique', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  const lignes = [ENT_HISTO];
  for (let i = 0; i < 3500; i++) lignes.push(['c' + i, 3000000 + i, 'ARTICLE DE TEST NUMERO ' + i, 100000 + (i % 50), 'TC ' + (i % 50), 10 + i, 1 + (i % 7), 100 + i]);
  env.ajouterClasseur(FICHIER_EUR, { 'Données 2024': lignes, 'Données 2025': lignes });
  const a = env.run('apiHistorique()').data;
  const entrees = Object.keys(env.cache).filter((k) => /:\d+$/.test(k));
  assert.ok(entrees.length > 1, 'plusieurs morceaux attendus : ' + entrees.length);
  assert.ok(entrees.every((k) => Buffer.byteLength(env.cache[k]) <= 100 * 1024));
  env.nouvelleExecution();
  const n = ouv(env, FICHIER_EUR);
  const b = env.run('apiHistorique()').data;
  assert.strictEqual(ouv(env, FICHIER_EUR), n);
  assert.deepStrictEqual(b.totaux, a.totaux);
  assert.strictEqual(b.nbArticles, a.nbArticles);
});
test('cache : un TC ne lit jamais le cache global et ne voit toujours que ses lignes', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  env.nouvelleExecution();
  env.moi('tc.ok@eureden.com');
  const a = env.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.parAnnee['2025'].qte, 900);
});
test('cache : indisponible ou plein, l\'application fonctionne quand même', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run("CacheService.getScriptCache = function () { throw new Error('cache indisponible'); }");
  const r = env.run('apiHistorique()');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.totaux.length, 3);
});
test('cache : les corrections de l\'historique s\'appliquent même sur des données en cache', () => {
  const env = envPrev(); env.moi('guillaume@eureden.com');
  env.run('apiHistorique()');
  env.nouvelleExecution();
  corrH(env, {}, 'h1');
  env.nouvelleExecution();
  const a = env.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.parAnnee['2025'].qte, 20000);
  env.nouvelleExecution();
  const b = env.run('apiHistorique()').data.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(b.parAnnee['2025'].qte, 20000);
  assert.strictEqual(b.parAnnee['2025'].brute.qte, 16900);
});
test('contrôles : année de prévision absente et source illisible signalées', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'CASSEE', Nature: 'STOCKS', 'ID fichier': 'FICHIER_INCONNU_0000000001', Onglet: 'X', 'Actif import': 'OUI' }]);
  const c = env.run('Controles.run(Auth.resolve())');
  assert.ok(c.some((x) => x.niveau === 'ATTENTION' && /Annee prevision/.test(x.detail)));
  assert.ok(c.some((x) => x.niveau === 'ERREUR' && x.sujet === 'Source CASSEE'));
  const env2 = envCad(); env2.moi('admin@eureden.com');
  assert.ok(!env2.run('Controles.run(Auth.resolve())').some((x) => /Annee prevision/.test(x.detail)));
});

// ---------- Saisie des TC (PREV_TC) ----------
const F_TC = 'FICHIER_EUREPREV_TC_0000001';
const ENT_TC = ['N° TC', 'Code technicien Appro/DTD', 'Code produit long Triskalia', '_Canal de distribution', 'Saisie pour prévisions Coop (Oui ou Non)', 'PREV 2027', 'PREV 2027 en QTE', 'PREV 2027 en SURFACE', 'Etat saisie', 'Libellé produit de la coop origine', 'Libellé groupe structure Triskalia', 'Libellé famille structure Triskalia', 'Segmentation technico économique', 'Libelle abrege unite cpte stock TK'];
function envTC(opts) {
  opts = opts || {};
  const env = envCad(); env.moi('admin@eureden.com');
  env.ajouterClasseur(F_TC, { DONNEES: [ENT_TC,
    [1, 102441, 1109939, 'Coop EUREDEN', 'OUI', '', 9000, '', 'SAISI', 'D.A.P. 35K', 'ENGRAIS', 'NUTRITION', 'PERF', 'U'],
    [2, 199405, 1109939, 'Coop EUREDEN', 'OUI', '', '8 000,5', '', 'SAISI', '', '', '', '', ''],
    [3, 111111, 1109939, 'Coop EUREDEN', 'OUI', '', '', '', 'NON_RENSEIGNE', '', '', '', '', ''],
    [4, 159304, 2200001, 'NEGOCE ONA', 'OUI', '', 0, '', 'SAISI', 'AUTRE ARTICLE', 'SEMENCES', 'GRAINES', 'REF', 'KG'],
    [5, 159305, 3300003, 'NEGOCE ONA', 'OUI', '', 70, '', 'SAISI', 'NOUVEAUTE', 'ENGRAIS', 'NUTRITION', 'PERF', 'KG'],
    [6, 159306, 4400004, 'NEGOCE ONA', 'NON', '', 5, '', 'SAISI', 'HORS SAISIE', 'ENGRAIS', 'NUTRITION', 'ACC', 'U']] });
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'TC', Nature: 'PREV_TC', 'ID fichier': F_TC, Onglet: 'DONNEES', 'Actif import': 'OUI' }]);
  if (opts.base) env.semer('PARAM_FICHIER_TEST_00001', 'REGLAGES', [{ Cle: 'BASE_ARBITRAGE', Valeur: opts.base }]);
  return env;
}

test('saisie des TC : lecture par article et entité, vide différent de zéro, lignes non saisissables incluses', () => {
  const env = envTC();
  const r = env.run('PrevTC.lire(Auth.resolve())');
  assert.strictEqual(r.colonne, 'PREV 2027 en QTE');
  assert.strictEqual(r.parArticle['COOP EUREDEN|1109939'].qte, 17000.5);
  assert.strictEqual(r.parArticle['COOP EUREDEN|1109939'].nbTC, 2);
  assert.strictEqual(r.parArticle['NEGOCE ONA|2200001'].qte, 0);
  assert.strictEqual(r.parArticle['NEGOCE ONA|3300003'].qte, 70);
  assert.deepStrictEqual(r.couverture, { lignes: 6, saisissables: 5, renseignees: 4, tc: 5, tcAyantSaisi: 4 });
});
test('saisie des TC : colonne de l\'année introuvable ou colonnes manquantes', () => {
  const env = envTC();
  env.classeurs[F_TC]._feuilles.DONNEES._data[0][6] = 'PREV 2026 en QTE';
  assert.strictEqual(env.run("(function(){ try { PrevTC.lire(Auth.resolve()); } catch (e) { return e.code; } })()"), 'SOURCE_COLONNES');
  const env2 = envTC();
  env2.classeurs[F_TC]._feuilles.DONNEES._data[0][1] = 'Autre';
  assert.strictEqual(env2.run("(function(){ try { PrevTC.lire(Auth.resolve()); } catch (e) { return e.code; } })()"), 'SOURCE_COLONNES');
});
test('saisie des TC : sans source déclarée, rien n\'est lu', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  assert.strictEqual(env.run('PrevTC.lire(Auth.resolve())'), null);
});
test('saisie des TC : Qte TC écrite dans PREVISION, articles saisis sans historique créés', () => {
  const env = envTC();
  env.run("apiCalculerStatistique({}, 'op0')");
  assert.strictEqual(prevLigne(env, DAP)['Qte TC'], 17000.5);
  assert.strictEqual(prevLigne(env, DAP)['Qte statistique'], STAT_DAP);
  const nouveau = prevLigne(env, '3300003');
  assert.strictEqual(nouveau['Qte TC'], 70);
  assert.strictEqual(nouveau['Qte statistique'], 0);
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte TC'], 0);
  assert.strictEqual(prevLigne(env, '4400004')['Qte TC'], 5);
});
test('saisie des TC : par défaut l\'arbitrage part de la statistique, avec BASE_ARBITRAGE = TC il part de la saisie', () => {
  const env = envTC();
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -500 }], 'rp1');
  assert.strictEqual(prevLigne(env, DAP)['Qte arbitree'], STAT_DAP - 500);
  const env2 = envTC({ base: 'TC' });
  const r = reprev(env2, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -500 }], 'rp1');
  assert.strictEqual(r.data.resultat.baseTc, true);
  assert.strictEqual(prevLigne(env2, DAP)['Qte arbitree'], 17000.5 - 500);
  assert.strictEqual(prevLigne(env2, '3300003')['Qte arbitree'], 70);
  assert.strictEqual(prevLigne(env2, ONA_ART)['Qte arbitree'], 0);
  assert.ok(/saisie des TC/.test(env2.lignes('SORTIE1', 'VERSIONS')[0].Libelle));
});
test('saisie des TC : un pourcentage et une substitution s\'appliquent à la quantité de départ', () => {
  const env = envTC({ base: 'TC' });
  ajout(env, { nature: 'CORRECTION', code: DAP, entite: 'Coop EUREDEN', pourcent: 10, motif: 'm' }, 'c1');
  ajout(env, { nature: 'SUBSTITUTION', ancien: '3300003', nouveau: '5500005', entite: 'NEGOCE ONA', taux: 50 }, 's1');
  env.run("apiArbitrer({}, 'a1')");
  assert.ok(Math.abs(prevLigne(env, DAP)['Qte correction'] - 1700.05) < 0.001);
  assert.strictEqual(prevLigne(env, '3300003')['Qte substitution'], -35);
  assert.strictEqual(prevLigne(env, '5500005')['Qte arbitree'], 35);
});
test('saisie des TC : une source illisible n\'empêche pas le calcul et le dit', () => {
  const env = envTC();
  env.classeurs[F_TC]._feuilles.DONNEES._data[0][6] = 'PREV 2026 en QTE';
  const r = env.run("apiCalculerStatistique({}, 'op0')");
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.resultat.avertissements.some((a) => /Prévisions des TC/.test(a)));
  assert.strictEqual(prevLigne(env, DAP)['Qte TC'], '');
});
test('saisie des TC : prévision courante avec saisie, départ et totaux', () => {
  const env = envTC();
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = env.run('apiPrevision()').data;
  const a = d.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.tc, 17000.5);
  assert.strictEqual(a.depart, STAT_DAP);
  const eur = d.totaux.filter((t) => t.entite === 'Coop EUREDEN')[0];
  assert.strictEqual(eur.tc, 17000.5);
  assert.strictEqual(eur.q.tc, 17000.5);
  const sans = envCad(); sans.moi('admin@eureden.com');
  sans.run("apiCalculerStatistique({}, 'op0')");
  assert.strictEqual(sans.run('apiPrevision()').data.articles[0].tc, null);
});
test('saisie des TC : le fichier EurePrev est mis en cache, et « actualiser » le relit', () => {
  const env = envTC();
  env.run('PrevTC.lire(Auth.resolve())');
  const n = ouv(env, F_TC);
  assert.ok(n >= 1);
  env.nouvelleExecution();
  env.run('PrevTC.lire(Auth.resolve())');
  assert.strictEqual(ouv(env, F_TC), n);
  appel(env, 'actualiser');
  env.nouvelleExecution();
  env.run('PrevTC.lire(Auth.resolve())');
  assert.ok(ouv(env, F_TC) > n);
});
test('saisie des TC : le tableau de bord signale les écarts avec la statistique et la saisie incomplète', () => {
  const env = envTC();
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = appel(env, 'tableauDeBord').data;
  assert.deepStrictEqual(d.tc.couverture, { lignes: 6, saisissables: 5, renseignees: 4, tc: 5, tcAyantSaisi: 4 });
  // D.A.P. : 17 001 contre 16 345, soit +4 %, sous le seuil de 15 % : pas d'alerte. L'autre article et l'article sans statistique en ont une.
  assert.ok(!d.alertes.some((a) => a.titre === 'Saisie TC vs statistique' && /D\.A\.P\./.test(a.detail)));
  assert.ok(d.alertes.some((a) => a.titre === 'Saisie TC vs statistique' && /AUTRE ARTICLE/.test(a.detail) && /TC 0 contre statistique 50 \(-100 %\)/.test(a.detail)));
  assert.ok(d.alertes.some((a) => a.titre === 'Saisie TC vs statistique' && /NOUVEAUTE/.test(a.detail) && /pas de statistique/.test(a.detail)));
  assert.ok(d.alertes.some((a) => a.titre === 'Saisie des TC incomplète' && /4 TC sur 5/.test(a.detail)));
  assert.ok(!d.alertes.some((a) => a.titre === 'Source non connectée' && /TC/.test(a.detail)));
});
test('saisie des TC : une source illisible donne une alerte et pas une erreur du tableau de bord', () => {
  const env = envTC();
  env.classeurs[F_TC]._feuilles.DONNEES._data[0][6] = 'PREV 2026 en QTE';
  const r = appel(env, 'tableauDeBord');
  assert.strictEqual(r.ok, true);
  assert.ok(r.data.alertes.some((a) => a.titre === 'Prévisions des TC illisibles' && a.niveau === 'ERREUR'));
});

// ---------- Budget ----------
const F_BUD = 'FICHIER_BUDGET_0000000001';
function envBud(opts) {
  opts = opts || {};
  const env = envCad(); env.moi('guillaume@eureden.com');
  env.ajouterClasseur(F_BUD, { Budget: [['Annee', 'Version budget', 'Mois', 'Code produit', 'Entite', 'Quantite', 'Valeur euro'],
    [2027, 'V1', '2027-02', DAP, 'Coop EUREDEN', 5000, 3000], [2027, 'V1', '2027-03', DAP, 'Coop EUREDEN', '8 000,5', 4800], [2027, 'V1', '2027-04', DAP, 'Coop EUREDEN', 2000, 1200],
    [2027, 'V1', '2027-02', ONA_ART, 'NEGOCE ONA', 40, 400], [2026, 'V1', '2026-02', DAP, 'Coop EUREDEN', 1, 1],
    [2027, 'V2', '2027-02', DAP, 'Coop EUREDEN', 9999, 9999]] });
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'BUD', Nature: 'BUDGET', 'ID fichier': F_BUD, Onglet: 'Budget', 'Actif import': 'OUI', Sensible: 'OUI' }]);
  if (opts.version) env.semer('PARAM_FICHIER_TEST_00001', 'REGLAGES', [{ Cle: 'BUDGET_VERSION', Valeur: opts.version }]);
  return env;
}
test('budget : totaux par mois et par entité, dernière version par défaut, autres années ignorées', () => {
  const r = appel(envBud(), 'budget').data;
  assert.strictEqual(r.disponible, true);
  assert.strictEqual(r.annee, 2027);
  assert.deepStrictEqual(r.versions, ['V1', 'V2']);
  assert.strictEqual(r.version, 'V2');
  assert.deepStrictEqual(r.mois.map((m) => m.mois), ['2027-02']);
  assert.strictEqual(r.mois[0].parEntite['Coop EUREDEN'].q, 9999);
});
test('budget : version choisie par le réglage BUDGET_VERSION', () => {
  const r = appel(envBud({ version: 'V1' }), 'budget').data;
  assert.strictEqual(r.version, 'V1');
  assert.deepStrictEqual(r.mois.map((m) => m.mois), ['2027-02', '2027-03', '2027-04']);
  assert.strictEqual(r.mois[1].parEntite['Coop EUREDEN'].q, 8000.5);
  assert.strictEqual(r.mois[1].parEntite['Coop EUREDEN'].eur, 4800);
  assert.strictEqual(r.mois[0].parEntite['NEGOCE ONA'].q, 40);
});
test('budget : sans droit, sans source, sans année, colonne manquante', () => {
  const env = envBud(); env.moi('rm.engrais@eureden.com');
  const a = appel(env, 'budget').data;
  assert.strictEqual(a.disponible, false);
  assert.ok(/ne permet pas de voir le budget/.test(a.raison));
  const env2 = envCad(); env2.moi('guillaume@eureden.com');
  assert.ok(/Aucune source de budget/.test(appel(env2, 'budget').data.raison));
  const env3 = envBud(); env3.moi('guillaume@eureden.com');
  const env4 = envPrev(); env4.moi('guillaume@eureden.com');
  env4.ajouterClasseur(F_BUD, { Budget: [['Annee', 'Mois', 'Entite', 'Quantite']] });
  env4.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'BUD', Nature: 'BUDGET', 'ID fichier': F_BUD, Onglet: 'Budget', 'Actif import': 'OUI' }]);
  assert.ok(/année de prévision/.test(appel(env4, 'budget').data.raison));
  const env5 = envBud(); env5.moi('guillaume@eureden.com');
  env5.classeurs[F_BUD]._feuilles.Budget._data[0][2] = 'Autre';
  assert.strictEqual(appel(env5, 'budget').code, 'SOURCE_COLONNES');
});
test('budget : le tableau de bord ne signale plus le budget comme manquant', () => {
  const env = envBud();
  assert.ok(!appel(env, 'tableauDeBord').data.alertes.some((a) => a.titre === 'Source non connectée' && /Budget/.test(a.detail)));
});

// ---------- Catalogue ----------
test('catalogue : lu dans la sortie EurePrev, première valeur non vide par code', () => {
  const env = envTC();
  const c = env.run('Catalogue.lire(Auth.resolve())');
  assert.deepStrictEqual(c[DAP], { libelle: 'D.A.P. 35K', marche: 'ENGRAIS', famille: 'NUTRITION', segment: 'PERF', unite: 'U' });
  assert.strictEqual(c[ONA_ART].unite, 'KG');
  assert.deepStrictEqual(env.run('Catalogue.marches(Catalogue.lire(Auth.resolve()))'), ['ENGRAIS', 'SEMENCES']);
});
test('catalogue : vide sans source, ou si la source est illisible', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  assert.deepStrictEqual(env.run('Catalogue.lire(Auth.resolve())'), {});
  const env2 = envTC();
  env2.classeurs[F_TC]._feuilles.DONNEES._data[0][6] = 'PREV 2026 en QTE';
  assert.deepStrictEqual(env2.run('Catalogue.lire(Auth.resolve())'), {});
});
test('catalogue : tonnes seulement pour les articles en KG', () => {
  const env = creerEnvStandard();
  assert.strictEqual(env.run("Catalogue.tonnes(2500, 'KG')"), 2.5);
  assert.strictEqual(env.run("Catalogue.tonnes(2500, 'kg')"), 2.5);
  assert.strictEqual(env.run("Catalogue.tonnes(2500, 'U')"), '');
  assert.strictEqual(env.run("Catalogue.tonnes(2500, '')"), '');
});
test('catalogue : marché, famille, unité et libellé sur la prévision courante, totaux par marché', () => {
  const env = envTC();
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = env.run('apiPrevision()').data;
  const a = d.articles.filter((x) => x.code === DAP)[0];
  assert.strictEqual(a.marche, 'ENGRAIS');
  assert.strictEqual(a.famille, 'NUTRITION');
  assert.strictEqual(a.unite, 'U');
  assert.deepStrictEqual(d.marches, ['ENGRAIS', 'SEMENCES']);
  const eng = d.totauxMarche.filter((t) => t.entite === 'Coop EUREDEN' && t.marche === 'ENGRAIS')[0];
  assert.strictEqual(eng.q.statistique, STAT_DAP);
  assert.strictEqual(eng.articles, 1);
  const onaEng = d.totauxMarche.filter((t) => t.entite === 'NEGOCE ONA' && t.marche === 'ENGRAIS')[0];
  assert.strictEqual(onaEng.articles, 2);
  assert.strictEqual(onaEng.q.tc, 75);
  assert.strictEqual(prevLigne(env, DAP)['Unite stock'], 'U');
  assert.strictEqual(prevLigne(env, ONA_ART)['Unite stock'], 'KG');
});
test('catalogue : sans catalogue les articles n\'ont pas de marché et un seul groupe vide', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = env.run('apiPrevision()').data;
  assert.deepStrictEqual(d.marches, []);
  assert.ok(d.articles.every((a) => a.marche === '' && a.unite === ''));
  assert.ok(d.totauxMarche.every((t) => t.marche === ''));
});
test('catalogue : le tableau de bord transmet les totaux par marché', () => {
  const env = envTC();
  env.run("apiCalculerStatistique({}, 'op0')");
  const d = appel(env, 'tableauDeBord').data;
  assert.ok(d.totauxMarche.some((t) => t.entite === 'Coop EUREDEN' && t.marche === 'ENGRAIS' && t.q.tc === 17000.5));
});
test('cadençage par marché : l\'article prime sur le marché, le marché sur le global', () => {
  const env = envTC(); env.moi('admin@eureden.com');
  reprev(env, [], 'rp1');
  sauverCoef(env, { coefficients: { 9: 100 } }, 'k1');
  sauverCoef(env, { niveau: 'MARCHE', cle: 'engrais', coefficients: { 5: 100 } }, 'k2');
  sauverCoef(env, { niveau: 'ARTICLE', cle: DAP, coefficients: { 13: 100 } }, 'k3');
  const d = appel(env, 'cadencage').data;
  assert.deepStrictEqual(d.marches, ['ENGRAIS', 'SEMENCES']);
  const semaines = (ent) => d.semaines.filter((s) => s.parEntite[ent]).map((s) => s.etiquette);
  assert.deepStrictEqual(semaines('Coop EUREDEN'), ['2027-S13']);
  // NEGOCE ONA : l'article de semences suit le global (S09), les articles d'engrais suivent leur marché (S05).
  assert.deepStrictEqual(semaines('NEGOCE ONA'), ['2027-S05', '2027-S09']);
  assert.strictEqual(d.jeux.filter((j) => j.niveau === 'MARCHE').length, 1);
});
test('cadençage par marché : enregistrement, suppression, marché obligatoire', () => {
  const env = envTC(); env.moi('admin@eureden.com');
  assert.strictEqual(sauverCoef(env, { niveau: 'MARCHE', cle: '' }).code, 'CODE_OBLIGATOIRE');
  assert.strictEqual(sauverCoef(env, { niveau: 'MARCHE', cle: 'Engrais' }, 'k1').ok, true);
  assert.strictEqual(sauverCoef(env, { niveau: 'MARCHE', cle: 'ENGRAIS', coefficients: { 6: 100 } }, 'k2').data.resultat.version, 2);
  assert.strictEqual(coefLignes(env).filter((x) => x.Niveau === 'MARCHE').length, 1);
  assert.strictEqual(appel(env, 'supprimerCoefficients', ['MARCHE', 'engrais', 's1']).ok, true);
  assert.strictEqual(coefLignes(env).length, 0);
});
test('publication : unité de stock du catalogue, tonnes pour les articles en KG', () => {
  const env = envTC(); env.moi('admin@eureden.com');
  sauverCoef(env, { coefficients: { 5: 50, 6: 50 } }, 'k1');
  reprev(env, [{ entite: 'NEGOCE ONA', code: '3300003', quantite: 1930 }], 'rp1');
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.data.resultat.publication.ecrit, true);
  const h = env.lignes('SORTIE1', 'PUBLICATION_HEBDO');
  const dap = h.filter((x) => x['Code produit'] === DAP);
  assert.ok(dap.every((x) => x['Unite stock'] === 'U' && x['Tonnes demande'] === ''));
  const kg = h.filter((x) => x['Code produit'] === '3300003');
  assert.strictEqual(kg.length, 2);
  assert.ok(kg.every((x) => x['Unite stock'] === 'KG' && x['Tonnes demande'] === x['Quantite demande'] / 1000));
  const m = env.lignes('SORTIE1', 'PUBLICATION_MENSUELLE').filter((x) => x['Code produit'] === '3300003');
  assert.strictEqual(m[0]['Quantite demande'], 1930);
  assert.strictEqual(m[0]['Tonnes reelle'], 1.93);
});

// ---------- Ruptures : demande et réel ----------
const declarer = (env, o, op) => appel(env, 'declarerRupture', [Object.assign({ entite: 'Coop EUREDEN', code: DAP, debut: '2027-S06', fin: '2027-S07', traitement: 'PERDUES', cause: 'APPRO_FOURNISSEUR' }, o), op || ('r' + Math.random())]);
const SEM = 4086.297; // 16345,188 réparti sur quatre semaines de 25 % (arrondi à 3 décimales par l'application)
function envRup(coefs) {
  const env = envCad(); env.moi('admin@eureden.com');
  sauverCoef(env, { coefficients: coefs || { 5: 25, 6: 25, 7: 25, 8: 25 } }, 'k1');
  return env;
}

test('ruptures : déclaration, liste, annulation', () => {
  const env = envRup();
  const r = declarer(env, { commentaire: 'Retard fournisseur' }, 'r1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.resultat.id, 'RUP0001');
  const l = env.lignes('SORTIE1', 'RUPTURES')[0];
  assert.strictEqual(l['Code produit'], DAP);
  assert.strictEqual(l.Entite, 'Coop EUREDEN');
  assert.strictEqual(l.Statut, 'ACTIVE');
  assert.strictEqual(l['Traitement ventes'], 'PERDUES');
  assert.strictEqual(l.Origine, 'CONSTATEE');
  assert.strictEqual(appel(env, 'ruptures').data.length, 1);
  assert.strictEqual(appel(env, 'annulerRupture', ['RUP0001', 'a1']).ok, true);
  assert.strictEqual(appel(env, 'ruptures').data.length, 0);
  assert.strictEqual(appel(env, 'annulerRupture', ['RUP0001', 'a2']).code, 'DEJA_ANNULE');
  assert.strictEqual(appel(env, 'annulerRupture', ['RUP9999', 'a3']).code, 'AJUSTEMENT_INCONNU');
  assert.strictEqual(declarer(env, {}, 'r1').data.rejoue, true);
});
test('ruptures : contrôles des semaines, du traitement, du taux, du retour et du substitut', () => {
  const env = envRup();
  const code = (o) => declarer(env, o).code;
  assert.strictEqual(code({ code: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(code({ entite: 'Inconnue' }), 'ENTITE_INCONNUE');
  assert.strictEqual(code({ debut: '2027-6' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ fin: '2027-S05' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ traitement: 'AUTRE' }), 'TYPE_INVALIDE');
  assert.strictEqual(code({ cause: 'ENVIE' }), 'TYPE_INVALIDE');
  assert.strictEqual(code({ origine: 'RUMEUR' }), 'TYPE_INVALIDE');
  assert.strictEqual(code({ traitement: 'REPORTEES', taux: 0, retour: '2027-S09' }), 'TAUX_INVALIDE');
  assert.strictEqual(code({ traitement: 'REPORTEES', taux: 50, retour: '' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ traitement: 'REPORTEES', taux: 50, retour: '2027-S07' }), 'SEMAINE_INVALIDE');
  assert.strictEqual(code({ traitement: 'SUBSTITUEES', taux: 50, substitut: '' }), 'CODE_OBLIGATOIRE');
  assert.strictEqual(code({ traitement: 'SUBSTITUEES', taux: 50, substitut: DAP }), 'SUBSTITUTION_INVALIDE');
  assert.strictEqual(env.lignes('SORTIE1', 'RUPTURES').length, 0);
});
test('ruptures : droits et campagne gelée', () => {
  const env = envRup(); env.moi('rm.engrais@eureden.com');
  assert.strictEqual(declarer(env, {}, 'r1').code, 'CAPACITE_REFUSEE');
  const env2 = envCad(); env2.moi('admin@eureden.com'); env2.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][10] = 'GELEE';
  assert.strictEqual(declarer(env2, {}, 'r1').code, 'CAMPAGNE_FERMEE');
});
test('ruptures : ventes perdues, le réel s\'annule pendant la rupture', () => {
  const env = envRup();
  declarer(env, {}, 'r1');
  const r = env.run("Ruptures.appliquer(Auth.resolve(), { 'COOP EUREDEN|1109939': { '2027-S05': 100, '2027-S06': 100, '2027-S07': 100, '2027-S08': 100 } })");
  assert.deepStrictEqual(r.reel['COOP EUREDEN|1109939'], { '2027-S05': 100, '2027-S06': 0, '2027-S07': 0, '2027-S08': 100 });
  assert.strictEqual(r.perdu['COOP EUREDEN|1109939'], 200);
});
test('ruptures : ventes reportées, une part revient la semaine de retour', () => {
  const env = envRup();
  declarer(env, { traitement: 'REPORTEES', taux: 50, retour: '2027-S09' }, 'r1');
  const r = env.run("Ruptures.appliquer(Auth.resolve(), { 'COOP EUREDEN|1109939': { '2027-S05': 100, '2027-S06': 100, '2027-S07': 100, '2027-S08': 100 } })");
  assert.deepStrictEqual(r.reel['COOP EUREDEN|1109939'], { '2027-S05': 100, '2027-S06': 0, '2027-S07': 0, '2027-S08': 100, '2027-S09': 100 });
  assert.strictEqual(r.perdu['COOP EUREDEN|1109939'], 100);
});
test('ruptures : ventes substituées, le substitut reçoit les mêmes semaines', () => {
  const env = envRup();
  declarer(env, { traitement: 'SUBSTITUEES', taux: 80, substitut: 'X999' }, 'r1');
  const r = env.run("Ruptures.appliquer(Auth.resolve(), { 'COOP EUREDEN|1109939': { '2027-S05': 100, '2027-S06': 100, '2027-S07': 100, '2027-S08': 100 } })");
  assert.deepStrictEqual(r.reel['COOP EUREDEN|X999'], { '2027-S06': 80, '2027-S07': 80 });
  assert.strictEqual(r.perdu['COOP EUREDEN|1109939'], 40);
  assert.strictEqual(r.reel['COOP EUREDEN|1109939']['2027-S06'], 0);
});
test('ruptures : une rupture hors des semaines de demande ne change rien', () => {
  const env = envRup();
  declarer(env, { debut: '2027-S20', fin: '2027-S21' }, 'r1');
  const r = env.run("Ruptures.appliquer(Auth.resolve(), { 'COOP EUREDEN|1109939': { '2027-S05': 100 } })");
  assert.deepStrictEqual(r.reel['COOP EUREDEN|1109939'], { '2027-S05': 100 });
  assert.deepStrictEqual(r.touche, {});
});
test('ruptures : une rupture sans fin dure jusqu\'à la dernière semaine', () => {
  const env = envRup();
  declarer(env, { fin: '' }, 'r1');
  const r = env.run("Ruptures.appliquer(Auth.resolve(), { 'COOP EUREDEN|1109939': { '2027-S05': 100, '2027-S06': 100, '2027-S08': 100 } })");
  assert.deepStrictEqual(r.reel['COOP EUREDEN|1109939'], { '2027-S05': 100, '2027-S06': 0, '2027-S08': 0 });
});
test('ruptures : quantité réelle attendue dans PREVISION et dans la prévision courante', () => {
  const env = envRup();
  declarer(env, {}, 'r1');
  reprev(env, [], 'rp1');
  const d = prevLigne(env, DAP);
  assert.ok(Math.abs(d['Qte reelle attendue'] - 2 * SEM) < 0.01);
  assert.strictEqual(prevLigne(env, ONA_ART)['Qte reelle attendue'], '');
  const c = env.run('apiPrevision()').data;
  const a = c.articles.filter((x) => x.code === DAP)[0];
  assert.ok(Math.abs(a.reel - 2 * SEM) < 0.01);
  assert.strictEqual(c.articles.filter((x) => x.code === ONA_ART)[0].reel, null);
  const tot = c.totaux.filter((t) => t.entite === 'Coop EUREDEN')[0];
  assert.ok(Math.abs(tot.q.reel - 2 * SEM) < 0.01);
  const ona = c.totaux.filter((t) => t.entite === 'NEGOCE ONA')[0];
  assert.strictEqual(ona.q.reel, ona.q.retenue);
});
test('ruptures : sans cadençage, avertissement et pas de réel', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  declarer(env, {}, 'r1');
  const r = reprev(env, [], 'rp1');
  assert.ok(r.data.resultat.avertissements.some((a) => /cadençage n'est pas défini/.test(a)));
  assert.strictEqual(prevLigne(env, DAP)['Qte reelle attendue'], '');
});
test('ruptures : un substitut absent de la prévision reçoit une ligne', () => {
  const env = envRup();
  declarer(env, { traitement: 'SUBSTITUEES', taux: 100, substitut: 'X999' }, 'r1');
  reprev(env, [], 'rp1');
  const x = prevLigne(env, 'X999');
  assert.ok(x);
  assert.strictEqual(x['Qte arbitree'], 0);
  assert.ok(Math.abs(x['Qte reelle attendue'] - 2 * SEM) < 0.01);
  assert.ok(Math.abs(prevLigne(env, DAP)['Qte reelle attendue'] - 2 * SEM) < 0.01);
});
test('ruptures : la publication distingue demande et réel, le substitut apparaît avec une demande nulle', () => {
  const env = envRup();
  declarer(env, { traitement: 'SUBSTITUEES', taux: 100, substitut: 'X999' }, 'r1');
  reprev(env, [], 'rp1');
  const r = appel(env, 'validerVersion', [{}, 'v1']);
  assert.strictEqual(r.data.resultat.publication.ecrit, true);
  const h = env.lignes('SORTIE1', 'PUBLICATION_HEBDO');
  const dap = h.filter((x) => x['Code produit'] === DAP).sort((a, b) => (a.Semaine < b.Semaine ? -1 : 1));
  assert.deepStrictEqual(dap.map((x) => x.Semaine), ['2027-S05', '2027-S06', '2027-S07', '2027-S08']);
  assert.deepStrictEqual(dap.map((x) => x['Quantite demande']), [SEM, SEM, SEM, SEM]);
  assert.deepStrictEqual(dap.map((x) => x['Quantite reelle']), [SEM, 0, 0, SEM]);
  const x9 = h.filter((x) => x['Code produit'] === 'X999');
  assert.deepStrictEqual(x9.map((x) => x['Quantite demande']), [0, 0]);
  assert.deepStrictEqual(x9.map((x) => x['Quantite reelle']), [SEM, SEM]);
  const m = env.lignes('SORTIE1', 'PUBLICATION_MENSUELLE');
  const mdap = m.filter((x) => x['Code produit'] === DAP)[0];
  assert.ok(Math.abs(mdap['Quantite demande'] - 4 * SEM) < 0.01);
  assert.ok(Math.abs(mdap['Quantite reelle'] - 2 * SEM) < 0.01);
  assert.strictEqual(r.data.resultat.publication.ruptures, 2);
});
test('ruptures : sans rupture la quantité réelle égale la demande dans la publication', () => {
  const env = envRup();
  reprev(env, [], 'rp1');
  appel(env, 'validerVersion', [{}, 'v1']);
  assert.ok(env.lignes('SORTIE1', 'PUBLICATION_HEBDO').every((x) => x['Quantite reelle'] === x['Quantite demande']));
});
test('ruptures : le stock réel plafonne les ventes et compte les ventes perdues', () => {
  const env = envStock();
  const d = proj(env).data;
  const a = art(d, DAP);
  assert.ok(Math.abs(a.perdu - 4345.188) < 0.01);
  assert.ok(a.serieReel.every((v) => v >= 0));
  assert.ok(a.serie.some((v) => v < 0));
  assert.strictEqual(a.serieReel[d.semaines.indexOf('2027-S08')], 0);
  assert.strictEqual(art(d, ONA_ART).perdu, 0);
  assert.strictEqual(d.kpis.declarees, 0);
  assert.strictEqual(a.declaree, false);
});
test('ruptures : une rupture déclarée couvrant la semaine de rupture prévue marque l\'article comme déclaré', () => {
  const env = envStock();
  declarer(env, { debut: '2027-S07', fin: '2027-S08' }, 'r1');
  const d = proj(env).data;
  assert.strictEqual(art(d, DAP).declaree, true);
  assert.strictEqual(d.kpis.declarees, 1);
  const env2 = envStock();
  declarer(env2, { debut: '2027-S09', fin: '' }, 'r1');
  assert.strictEqual(art(proj(env2).data, DAP).declaree, false);
});

// ---------- Corrections de la relecture indépendante
function ajouterAMOna(env) {
  const profils = env.lignes('PARAM_FICHIER_TEST_00001', 'PROFILS').filter((p) => p.Role === 'PREV').map((p) => Object.assign({}, p, { Role: 'AM', 'Perimetre obligatoire': 'GLOBAL ou périmètre explicite' }));
  const tous = env.lignes('PARAM_FICHIER_TEST_00001', 'PROFILS').concat(profils);
  env.semer('PARAM_FICHIER_TEST_00001', 'PROFILS', tous);
  const acces = env.lignes('PARAM_FICHIER_TEST_00001', 'ACCES').concat([{ 'ID campagne': 'SOP_2027_PAC2', 'Email Google': 'prev.ona@eureden.com', Role: 'AM', Entite: 'NEGOCE ONA', Actif: 'OUI' }]);
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', acces);
  env.nouvelleExecution();
  env.moi('prev.ona@eureden.com');
}
test('relecture : une reprévision refusée après validation ne touche pas aux corrections', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], 'rp1');
  appel(env, 'validerVersion', [{ commentaire: 'c' }, 'v1']);
  const avant = JSON.stringify(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').concat(env.lignes('SORTIE1', 'JOURNAL')));
  const r = reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -5 }], 'rp2');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'VERSION_VERROUILLEE');
  assert.strictEqual(JSON.stringify(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE').concat(env.lignes('SORTIE1', 'JOURNAL'))), avant);
});
test('relecture : une nouvelle version ne remplace pas la version validée et demande un périmètre global', () => {
  const env = envPrev(); env.moi('admin@eureden.com');
  reprev(env, [{ entite: 'Coop EUREDEN', code: DAP, quantite: -1000 }], 'rp1');
  appel(env, 'validerVersion', [{ commentaire: 'c' }, 'v1']);
  assert.strictEqual(appel(env, 'creerVersion', [{ type: 'STATISTIQUE', libelle: 'x' }, 'c1']).code, 'VERSION_DEJA_VERROUILLEE');
  ajouterAMOna(env);
  const r2 = appel(env, 'creerVersion', [{ type: 'STATISTIQUE', libelle: 'x' }, 'c2']);
  assert.strictEqual(r2.code, 'CAPACITE_REFUSEE', JSON.stringify(r2));
});
test('relecture : le budget respecte le périmètre de l\'utilisateur', () => {
  const env = envBud(); env.moi('admin@eureden.com');
  ajouterAMOna(env);
  const rr = appel(env, 'budget'); assert.ok(rr.ok, JSON.stringify(rr));
  const r = rr.data;
  assert.strictEqual(r.disponible, true);
  r.mois.forEach((m) => assert.deepStrictEqual(Object.keys(m.parEntite), ['NEGOCE ONA']));
});
test('relecture : un TC avec Code technicien « * » n\'a pas d\'accès', () => {
  const env = creerEnvStandard();
  env.semer('PARAM_FICHIER_TEST_00001', 'ACCES', [{ 'ID campagne': 'SOP_2027_PAC2', 'Email Google': 'tc.joker@eureden.com', Role: 'TC', 'Code technicien': '*', Actif: 'OUI' }]);
  env.moi('tc.joker@eureden.com');
  assert.strictEqual(erreur(env, 'Auth.resolve()'), 'ACCES_REFUSE');
});
test('référentiel TC : un RT voit l\'historique des TC de son territoire, et la plateforme se déduit du bassin', () => {
  const env = envHisto();
  env.semer('PARAM_FICHIER_TEST_00001', 'TC', [
    { 'Code technicien': '102441', Entite: 'Coop EUREDEN', 'Territoire TC': 'Argoat Centre Bretagne', 'Bassin TC': 'Glomel', Actif: 'OUI' },
    { 'Code technicien': '199405', Entite: 'Coop EUREDEN', 'Territoire TC': 'Autre', 'Bassin TC': 'Ailleurs', Actif: 'OUI' }]);
  env.semer('PARAM_FICHIER_TEST_00001', 'AFFECTATION_PLATEFORME', [{ Entite: 'Coop EUREDEN', 'Bassin TC': 'Glomel', Plateforme: 'PF Glomel', Validation: 'VALIDE' }]);
  env.nouvelleExecution();
  env.moi('rt.argoat@eureden.com');
  const r = env.run('apiHistorique()').data;
  const t = r.totaux.filter((x) => x.entite === 'Coop EUREDEN' && x.annee === '2024')[0];
  assert.strictEqual(t.lignes, 1);
  assert.strictEqual(t.qte, 14420);
  const ref = env.run('Referentiel.charger(Auth.resolve())');
  assert.strictEqual(ref['102441'].plateforme, 'PF GLOMEL');
  assert.strictEqual(ref['199405'].plateforme, '');
});
test('référentiel TC lu dans les vrais en-têtes EurePrev (département, territoire, bassin de vie, calendrier, plateforme)', () => {
  const env = envCad(); env.moi('admin@eureden.com');
  env.ajouterClasseur(F_TC, { DONNEES: [['N° TC', 'Clé unique', 'ID PAC', 'TYPE CALENDRIER', 'Code technicien Appro/DTD', 'Code produit long Triskalia', '_Canal de distribution', 'Type du technicien Appro/DTD', 'Nom du département. du TC Appro/DTD', 'Nom du territoire du TC Appro/DTD', 'Libellé bassin de vie du TC Appro/DTD', 'Libellé groupe structure Triskalia', 'PREV 2027 en QTE', 'Plateforme', 'Saisie pour prévisions Coop (Oui ou Non)'],
    [1, '1764245159307', 1, 'N', 159307, 1764245, 'NEGOCE ONA', 'TC', 'NEGOCE BRETAGNE', 'BOURDOIS', 'ROSTRENEN', 'FERTI FOLIAIRES', 10, 'GLOMEL', 'OUI']] });
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [{ 'ID source': 'TC', Nature: 'PREV_TC', 'ID fichier': F_TC, Onglet: 'DONNEES', 'Actif import': 'OUI' }]);
  env.nouvelleExecution();
  const ref = env.run('Referentiel.charger(Auth.resolve())')['159307'];
  assert.strictEqual(ref.territoire, 'BOURDOIS');
  assert.strictEqual(ref.bassin, 'ROSTRENEN');
  assert.strictEqual(ref.departement, 'NEGOCE BRETAGNE');
  assert.strictEqual(ref.calendrier, 'N');
  assert.strictEqual(ref.plateforme, 'GLOMEL');
});
test('contrôles : la source PREV_TC est listée, en OK ou avec les colonnes PREV trouvées', () => {
  const env = envTC();
  const ok = env.run('Controles.run(Auth.resolve())').filter((x) => x.sujet === 'Source PREV_TC (EurePrev)')[0];
  assert.strictEqual(ok.niveau, 'OK');
  assert.ok(/PREV 2027 en QTE/.test(ok.detail));
  const env2 = envTC();
  env2.classeurs[F_TC]._feuilles.DONNEES._data[0][6] = 'PREV 2026 en QTE';
  env2.nouvelleExecution();
  const ko = env2.run('Controles.run(Auth.resolve())').filter((x) => x.sujet === 'Source PREV_TC (EurePrev)')[0];
  assert.strictEqual(ko.niveau, 'ERREUR');
  assert.ok(/PREV 2026 en QTE/.test(ko.detail) && /2027/.test(ko.detail));
});

let echecs = 0;
tests.forEach(({ nom, fn }) => {
  try { fn(); console.log('  ok   ' + nom); } catch (e) { echecs++; console.log('  ECHEC ' + nom + '\n        ' + (e.message || e).split('\n')[0]); }
});
console.log('\n' + (tests.length - echecs) + ' / ' + tests.length + ' tests réussis');
process.exit(echecs ? 1 : 0);

