// Tests du socle. Lancer : node tests/run.js
'use strict';
const assert = require('assert');
const { creerEnv, creerEnvStandard } = require('./harness');

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
const ENT_HISTO = ['Concat', 'Code produit long Triskalia', 'Libellé produit de la coop origine', 'Code technicien Appro/DTD', 'Nom du technicien Appro/DTD', 'Total qtés vtes', 'Total Ha vtes', 'Total mt ht vtes'];
const FICHIER_EUR = 'FICHIER_HISTO_EUREDEN_0001';
const FICHIER_ONA = 'FICHIER_HISTO_ONA_00000001';

function envHisto(extraSource) {
  const env = creerEnvStandard();
  env.ajouterClasseur(FICHIER_EUR, {
    'Données 2024': [ENT_HISTO,
      ['1109939102441', 1109939, 'D.A.P. 35K', 102441, 'LE NAOUR ROBERT', 14420, 144, 12000],
      ['1109939199405', 1109939, 'D.A.P. 35K', 199405, 'TC OK', '1 000,5', 10, '2 000,25'],
      ['x', '', 'sans code', 102441, 'LE NAOUR ROBERT', 5, 1, 1]],
    'Données 2025': [ENT_HISTO,
      ['1109939102441', 1109939, 'D.A.P. 35K', 102441, 'LE NAOUR ROBERT', 16000, 160, 14000],
      ['1109939199405', 1109939, 'D.A.P. 35K', 199405, 'TC OK', 900, 9, 1800]]
  });
  env.ajouterClasseur(FICHIER_ONA, {
    'Données 2025': [ENT_HISTO, ['2200001159304', 2200001, 'AUTRE ARTICLE', 159304, 'TC ONA', 50, 5, 500]]
  });
  const base = { Nature: 'HISTO_PAC', Onglet: 'Données {ANNEE}', 'Actif import': 'OUI', PAC: 'PAC1', Format: 'SHEETS' };
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [
    Object.assign({ 'ID source': 'HISTO_EUREDEN', 'ID fichier': FICHIER_EUR, Entite: 'Coop EUREDEN', Annees: '2024,2025' }, base),
    Object.assign({ 'ID source': 'HISTO_ONA', 'ID fichier': FICHIER_ONA, Entite: 'NEGOCE ONA', Annees: '2025' }, base)
  ].concat(extraSource || []));
  return env;
}

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

let echecs = 0;
tests.forEach(({ nom, fn }) => {
  try { fn(); console.log('  ok   ' + nom); } catch (e) { echecs++; console.log('  ECHEC ' + nom + '\n        ' + (e.message || e).split('\n')[0]); }
});
console.log('\n' + (tests.length - echecs) + ' / ' + tests.length + ' tests réussis');
process.exit(echecs ? 1 : 0);
