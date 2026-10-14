// Test de bout en bout : le vrai navigateur, la vraie interface (code/*.html), le vrai code serveur (code/*.gs)
// exécuté dans Node sur des feuilles simulées en mémoire. Lancer : node tests/e2e.js
// Playwright doit être installé (NODE_PATH=/opt/node22/lib/node_modules dans l'environnement de développement).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { envPrev } = require('./jeux');

const RACINE = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PW);

function page() {
  let html = fs.readFileSync(path.join(RACINE, 'code', 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('([A-Za-z]+)'\) \?>/g, (_, n) => fs.readFileSync(path.join(RACINE, 'code', n + '.html'), 'utf8'));
  const sortie = path.join(RACINE, 'tests', '.page-e2e.html');
  fs.writeFileSync(sortie, html);
  return sortie;
}

(async () => {
  const env = envPrev();
  env.feuille('PARAM_FICHIER_TEST_00001', 'CAMPAGNES')._data[1][3] = 2027;
  env.moi('admin@eureden.com');
  env.ajouterClasseur('FICHIER_STOCKS_0000000001', { Stocks: [['Date stock', 'Plateforme', 'Code produit', 'Entite', 'Stock'],
    ['2027-01-04', 'GLOMEL', '1109939', 'Coop EUREDEN', 5000], ['2027-01-04', 'GRUEL', '1109939', 'Coop EUREDEN', 3000], ['2027-01-04', 'GLOMEL', '2200001', 'NEGOCE ONA', 100]] });
  env.ajouterClasseur('FICHIER_COMMANDES_00000001', { Commandes: [['Code produit', 'Code point', 'Date limite livraison', 'Quantite reste a livrer', 'Code fournisseur'], ['1109939', 'GLOMEL', '2027-02-08', 4000, 'F1']] });
  env.ajouterClasseur('FICHIER_EUREPREV_TC_0000001', { DONNEES: [['N° TC', 'Code technicien Appro/DTD', 'Code produit long Triskalia', '_Canal de distribution', 'Saisie pour prévisions Coop (Oui ou Non)', 'PREV 2027', 'PREV 2027 en QTE', 'PREV 2027 en SURFACE', 'Etat saisie', 'Libellé produit de la coop origine', 'Libellé groupe structure Triskalia', 'Libellé famille structure Triskalia', 'Segmentation technico économique', 'Libelle abrege unite cpte stock TK'],
    [1, 102441, 1109939, 'Coop EUREDEN', 'OUI', '', 9000, '', 'SAISI', 'D.A.P. 35K', 'ENGRAIS', 'NUTRITION', 'PERF', 'U'], [2, 199405, 1109939, 'Coop EUREDEN', 'OUI', '', 8000.5, '', 'SAISI', '', '', '', '', ''], [3, 111111, 1109939, 'Coop EUREDEN', 'OUI', '', '', '', 'NON_RENSEIGNE', '', '', '', '', ''],
    [4, 159304, 2200001, 'NEGOCE ONA', 'OUI', '', 40, '', 'SAISI', 'AUTRE ARTICLE', 'SEMENCES', 'GRAINES', 'REF', 'KG']] });
  env.ajouterClasseur('FICHIER_BUDGET_0000000001', { Budget: [['Annee', 'Version budget', 'Mois', 'Code produit', 'Entite', 'Quantite', 'Valeur euro'],
    [2027, 'V1', '2027-02', '1109939', 'Coop EUREDEN', 5000, 3000], [2027, 'V1', '2027-03', '1109939', 'Coop EUREDEN', 8000, 4800], [2027, 'V1', '2027-04', '1109939', 'Coop EUREDEN', 2000, 1200]] });
  env.semer('PARAM_FICHIER_TEST_00001', 'SOURCES', [
    { 'ID source': 'BUD', Nature: 'BUDGET', 'ID fichier': 'FICHIER_BUDGET_0000000001', Onglet: 'Budget', 'Actif import': 'OUI', Sensible: 'OUI' },
    { 'ID source': 'TC', Nature: 'PREV_TC', 'ID fichier': 'FICHIER_EUREPREV_TC_0000001', Onglet: 'DONNEES', 'Actif import': 'OUI' },
    { 'ID source': 'STK', Nature: 'STOCKS', 'ID fichier': 'FICHIER_STOCKS_0000000001', Onglet: 'Stocks', 'Actif import': 'OUI' },
    { 'ID source': 'CMD', Nature: 'COMMANDES_FOURN', 'ID fichier': 'FICHIER_COMMANDES_00000001', Onglet: 'Commandes', 'Actif import': 'OUI' }]);
  const erreurs = [];
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', (e) => erreurs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.exposeFunction('__serveur', (nom, args) => {
    const r = env.run('api(' + JSON.stringify(nom) + ',' + JSON.stringify(args) + ',' + JSON.stringify(arguments_camp()) + ')');
    return r;
  });
  let campCourante = '';
  function arguments_camp() { return campCourante; }
  await p.exposeFunction('__campagne', (c) => { campCourante = c; });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler(ko) { return new Proxy({}, { get: (_, n) => (...a) => { window.__campagne(a[2] || ''); window.__serveur(a[0], a[1] || []).then(ok, ko); } }); } }; } } } };
  });
  const etapes = [];
  let numero = 0;
  const etape = async (nom, fn) => { try { await fn(); if (process.env.CAPTURES) await p.screenshot({ path: path.join(process.env.CAPTURES, String(++numero).padStart(2, '0') + '.png'), fullPage: true }); etapes.push('ok   ' + nom); } catch (e) { etapes.push('ECHEC ' + nom + '\n        ' + String(e.message).split('\n')[0]); throw e; } };
  const texte = (sel) => p.locator(sel).first().innerText();

  try {
    await p.goto('file://' + page());
    await etape('démarrage : en-tête, campagne, entités, menu', async () => {
      await p.waitForSelector('#menu button');
      assert.ok((await texte('#camp')).includes('PAC 2 2027'));
      assert.deepStrictEqual(await p.$$eval('#ent option', (o) => o.map((x) => x.textContent)), ['Coop EUREDEN + NEGOCE ONA', 'Coop EUREDEN', 'NEGOCE ONA']);
      assert.ok((await texte('#entete-utilisateur')).includes('admin@eureden.com'));
      assert.strictEqual(await p.$$eval('#menu button', (b) => b.length), 6 + 2); // 6 écrans + sources + contrôles (réservé à la configuration)
    });
    await etape('tableau de bord sans prévision : alerte et source non connectée', async () => {
      await p.waitForSelector('.kpi');
      const t = await texte('main');
      assert.ok(/Aucune prévision/.test(t));
      assert.ok(/budget 2027/i.test(t) && /Cadençage requis/.test(t), 'le budget doit demander le cadençage pour comparer');
    });
    await etape('prévision : calcul de la statistique', async () => {
      await p.click('#menu [data-v=prevision]');
      await p.waitForSelector('#p-stat');
      await p.click('#p-stat');
      await p.waitForSelector('#dlg[open]');
      await p.click('#dlg-ok');
      await p.waitForSelector('#p-table table');
      assert.ok((await texte('#p-table')).includes('D.A.P. 35K'));
      assert.ok(/17\s001/.test(await texte('#p-table')), 'la saisie des TC doit apparaître dans le tableau');
      assert.ok(/ENGRAIS/.test(await texte('#p-table')), 'le marché doit apparaître sous le code');
      await p.selectOption('#p-marche', 'SEMENCES');
      assert.ok(!/D\.A\.P\./.test(await texte('#p-table')), 'le filtre de marché masque les autres marchés');
      await p.selectOption('#p-marche', '');
      assert.strictEqual(env.lignes('SORTIE1', 'VERSIONS').length, 1);
    });
    await etape('prévision : correction dans le tableau puis reprévision', async () => {
      const cell = p.locator('#p-table tr', { hasText: '1109939' }).locator('input.cell');
      await cell.fill('-1000'); await cell.dispatchEvent('change');
      await p.waitForSelector('#p-save');
      assert.ok((await texte('main')).includes('1 modification'));
      await p.click('#p-save');
      await p.waitForSelector('#dlg[open]');
      await p.click('#dlg-ok');
      assert.ok(/commentaire est obligatoire/.test(await texte('#dlg-msg')), 'le commentaire doit être exigé');
      await p.fill('#d-com', 'Comité du 12/10');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.waitForFunction(() => /Version V002|V002/.test(document.body.innerText));
      const prev = env.lignes('SORTIE1', 'PREVISION').filter((x) => x['Code produit'] === '1109939')[0];
      assert.strictEqual(prev['Qte correction'], -1000);
      assert.strictEqual(prev.Statut, 'ARBITREE');
      assert.strictEqual(env.lignes('SORTIE1', 'AJUSTEMENTS_SEMAINE')[0].Statut, 'ACTIF');
    });
    await etape('prévision : détail de l\'article et annulation de la saisie', async () => {
      await p.locator('#p-table tr', { hasText: '1109939' }).click();
      await p.waitForSelector('#p-detail [data-annuler]');
      assert.ok((await texte('#p-detail')).includes('Comité du 12/10'));
    });
    await etape('tableau de bord : totaux, changement d\'unité et d\'entité', async () => {
      await p.click('#menu [data-v=dashboard]');
      await p.waitForSelector('.kpi');
      await p.waitForFunction(() => /Erreur \d+ %|Il faut deux/.test(document.body.innerText));
      await p.waitForSelector('main :text("Prévision mensuelle")', { timeout: 3000 }).catch(() => {}); // seulement si un cadençage existe
      const quantite = await texte('main');
      assert.ok(/prévision retenue/i.test(quantite));
      assert.ok(/3 TC sur 4 ont saisi/.test(quantite), 'la couverture de la saisie doit apparaître');
      await p.click('#unites [data-u=E]');
      const valeur = await texte('main');
      assert.ok(/ €/.test(valeur));
      assert.notStrictEqual(quantite, valeur);
      await p.selectOption('#ent', 'NEGOCE ONA');
      const lignes = await p.$$eval('main table tbody tr', (r) => r.map((x) => x.innerText));
      assert.ok(lignes.every((l) => !/Coop EUREDEN/.test(l)), 'le filtre d\'entité doit masquer Coop EUREDEN');
      await p.selectOption('#ent', '');
      await p.click('#unites [data-u=Q]');
    });
    await etape('historique : totaux et ajout d\'un arrêt de produit', async () => {
      await p.click('#menu [data-v=historique]');
      await p.waitForSelector('#h-arret');
      assert.ok((await texte('main')).includes('1109939'));
      await p.click('#h-arret');
      await p.waitForSelector('#dlg[open]');
      await p.fill('#s-ancien', '2200001');
      await p.selectOption('#s-ent', 'NEGOCE ONA');
      await p.fill('#s-com', 'Arrêt Minarix');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.waitForSelector('#h-subs td:has-text("2200001")');
      assert.strictEqual(env.lignes('PARAM_FICHIER_TEST_00001', 'SUBSTITUTIONS')[0]['Code ancien'], '2200001');
    });
    await etape('historique : correction d\'une période (rupture) avec rappel du brut', async () => {
      await p.click('#h-corr');
      await p.waitForSelector('#dlg[open]');
      await p.selectOption('#k-ent', 'Coop EUREDEN');
      await p.fill('#k-code', '1109939');
      await p.selectOption('#k-annee', '2025');
      await p.waitForFunction(() => /16\s?900/.test(document.querySelector('#k-brut').innerText));
      await p.click('#dlg-ok');
      assert.ok(/quantité corrigée/i.test(await texte('#dlg-msg')), 'quantité exigée');
      await p.fill('#k-qte', '20000');
      await p.fill('#k-motif', 'Rupture de trois semaines');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.waitForSelector('[data-annuler-h]');
      assert.ok(/Rupture/.test(await texte('main')));
      assert.strictEqual(env.lignes('SORTIE1', 'CORRECTIONS_HISTO')[0]['Qte corrigee'], 20000);
      assert.ok(/20\s000/.test(await texte('main')), 'le tableau doit afficher la quantité corrigée');
    });
    await etape('alerte « saisies non appliquées » puis application', async () => {
      await p.click('#menu [data-v=dashboard]');
      await p.waitForSelector('.alert');
      assert.ok(/Saisies non appliquées/.test(await texte('main')));
      await p.click('#menu [data-v=prevision]');
      await p.waitForSelector('#p-save');
      await p.click('#p-save');
      await p.fill('#d-com', 'Application arrêt');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.waitForFunction(() => /V003/.test(document.body.innerText));
      const ona = env.lignes('SORTIE1', 'PREVISION').filter((x) => x['Code produit'] === '2200001')[0];
      assert.strictEqual(ona['Qte arbitree'], 0);
    });
    await etape('cadençage : répartition uniforme sur S05 à S13, enregistrement, résultat par mois', async () => {
      await p.click('#menu [data-v=cadencage]');
      await p.waitForSelector('#k-unif');
      await p.fill('#k-de', '5'); await p.dispatchEvent('#k-de', 'change');
      await p.fill('#k-a', '13'); await p.dispatchEvent('#k-a', 'change');
      await p.click('#k-unif');
      await p.waitForSelector('input[data-sem="9"]');
      assert.ok(/Total 100 %/.test(await texte('#k-somme')));
      await p.click('#k-save');
      await p.waitForFunction(() => /version 1/.test(document.body.innerText));
      assert.strictEqual(env.lignes('PARAM_FICHIER_TEST_00001', 'COEFFICIENTS').length, 9);
      const m = await texte('main');
      assert.ok(/févr\. 2027/.test(m) && /mars 2027/.test(m) && /avr\. 2027/.test(m));
    });
    await etape('cadençage : un coefficient hors total est refusé par le serveur', async () => {
      await p.fill('input[data-sem="9"]', '50'); await p.dispatchEvent('input[data-sem="9"]', 'change');
      assert.ok(/doit faire 100/.test(await texte('#k-somme')));
      await p.click('#k-save');
      await p.waitForFunction(() => /doit faire 100 %/.test(document.querySelector('#k-msg').innerText));
      await p.click('#menu [data-v=prevision]');
      await p.click('#menu [data-v=cadencage]');
      await p.waitForSelector('input[data-sem="9"]');
      assert.strictEqual(await p.inputValue('input[data-sem="9"]'), '11.11');
    });
    await etape('cadençage par marché : un jeu pour ENGRAIS qui prime sur le global', async () => {
      await p.click('#menu [data-v=cadencage]');
      await p.waitForSelector('#k-jeu');
      await p.selectOption('#k-jeu', 'NOUVEAU|MARCHE');
      await p.waitForSelector('#dlg[open]');
      assert.deepStrictEqual(await p.$$eval('#n-code option', (o) => o.map((x) => x.textContent)), ['ENGRAIS', 'SEMENCES']);
      await p.selectOption('#n-code', 'ENGRAIS');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.fill('#k-de', '5'); await p.dispatchEvent('#k-de', 'change');
      await p.fill('#k-a', '6'); await p.dispatchEvent('#k-a', 'change');
      await p.click('#k-unif');
      await p.click('#k-save');
      await p.waitForFunction(() => /Cadençage enregistré/.test(document.body.innerText));
      const l = env.lignes('PARAM_FICHIER_TEST_00001', 'COEFFICIENTS').filter((x) => x.Niveau === 'MARCHE');
      assert.deepStrictEqual(l.map((x) => x.Semaine), [5, 6]);
      assert.ok(l.every((x) => x['Cle niveau'] === 'ENGRAIS'));
      assert.ok(/Marché ENGRAIS/.test(await p.$eval('#k-jeu', (e) => e.options[e.selectedIndex].textContent)));
    });
    await etape('tableau de bord : graphique mensuel dès que le cadençage existe', async () => {
      await p.click('#menu [data-v=dashboard]');
      await p.waitForSelector('main :text("Prévision mensuelle")');
      assert.ok(/févr\. 2027/.test(await texte('main')));
      const tm = await texte('main');
      assert.ok(/Vue comité par marché/.test(tm) && /ENGRAIS/.test(tm), 'vue par marché absente : ' + tm.replace(/\s+/g, ' ').slice(0, 1500));
      await p.waitForFunction(() => /budget 2027 \(V1\)/i.test(document.body.innerText));
      const t = await texte('main');
      assert.ok(/15\s000/.test(t), 'le budget des mois du cadençage doit apparaître');
      assert.ok(/vs budget/i.test(t));
      await p.click('#unites [data-u=H]');
      assert.ok(/Pas d'hectares au budget/.test(await texte('main')));
      await p.click('#unites [data-u=Q]');
    });
    await etape('stocks : ruptures prévues, besoins de réapprovisionnement, export', async () => {
      await p.click('#menu [data-v=stocks]');
      await p.waitForSelector('main :text("Besoins de réapprovisionnement")');
      const t = await texte('main');
      assert.ok(/ruptures prévues/i.test(t));
      assert.ok(/D\.A\.P\. 35K/.test(t));
      assert.ok(/F1/.test(t), 'le fournisseur de la commande doit apparaître');
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#s-csv')]);
      assert.ok(/^besoins-appro-/.test(dl.suggestedFilename()));
      await p.click('#s-risque');
      assert.ok(/1 article\(s\)/.test(await texte('main')));
    });
    await etape('tableau de bord : alerte de rupture issue des stocks', async () => {
      await p.click('#menu [data-v=dashboard]');
      await p.waitForSelector('.alert');
      assert.ok(/Rupture prévue/.test(await texte('main')));
    });
    await etape('versions : liste et fiabilité de la méthode', async () => {
      await p.click('#menu [data-v=versions]');
      await p.waitForSelector('.vt li');
      assert.strictEqual(await p.$$eval('.vt li', (l) => l.length), 3);
      await p.click('#v-essai');
      await p.waitForSelector('table:has-text("Erreur")');
    });
    await etape('versions : comparaison, export, validation par le comité', async () => {
      await p.click('#menu [data-v=versions]');
      await p.waitForSelector('#c-go');
      await p.selectOption('#c-a', 'V001');
      await p.selectOption('#c-b', 'V003');
      await p.click('#c-go');
      await p.waitForSelector('#x-cmp:not([disabled])');
      assert.ok(/article\(s\) modifié/.test(await texte('main')));
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#x-prev')]);
      assert.ok(/^prevision-SOP_2027_PAC2-V003\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      await p.click('[data-valider]');
      await p.waitForSelector('#dlg[open]');
      await p.fill('#d-com', 'Comité du 12/10');
      await p.click('#dlg-ok');
      await p.waitForSelector('#dlg:not([open])', { state: 'attached' });
      await p.waitForFunction(() => /Validée/.test(document.body.innerText));
      const v = env.lignes('SORTIE1', 'VERSIONS');
      assert.strictEqual(v[v.length - 1].Type, 'VALIDEE');
      assert.strictEqual(v[v.length - 1].Verrouillee, 'OUI');
      assert.ok(env.lignes('SORTIE1', 'PUBLICATION_HEBDO').length > 0, 'la validation doit publier');
      assert.ok(env.lignes('SORTIE1', 'PUBLICATION_APPRO').length > 0, 'les commandes proposées doivent être publiées');
      assert.ok(env.lignes('SORTIE1', 'PUBLICATION_MENSUELLE').some((x) => x.Mois === '2027-02'));
      await p.waitForSelector('table:has-text("Version validée")');
    });
    await etape('prévision verrouillée après validation', async () => {
      await p.click('#menu [data-v=prevision]');
      await p.waitForSelector('#p-table table');
      assert.strictEqual(await p.locator('#p-save').count(), 0);
      assert.strictEqual(await p.locator('#p-stat').count(), 0);
      assert.ok(await p.locator('#p-table input.cell').first().isDisabled());
    });
    await etape('contrôles de mise en service', async () => {
      await p.click('#menu [data-v=controles]');
      await p.click('#c-lancer');
      await p.waitForSelector('#c-res table');
      assert.ok(/Historique HISTO_EUREDEN/.test(await texte('#c-res')));
    });
    await etape('sources : état des fichiers', async () => {
      await p.click('#menu [data-v=sources]');
      await p.waitForSelector('main table tbody tr');
      assert.ok(/Historique des ventes par PAC/.test(await texte('main')));
      assert.ok(/Connectée/.test(await texte('main')));
    });
    await etape('actualiser : relecture des fichiers sources', async () => {
      await p.click('#menu [data-v=dashboard]');
      await p.waitForSelector('.kpi');
      await p.click('#actualiser');
      await p.waitForFunction(() => /Fichiers sources relus/.test(document.body.innerText));
      await p.waitForSelector('.kpi');
    });
    await etape('TC : écrans limités à son périmètre, aucune action de pilotage', async () => {
      env.moi('tc.ok@eureden.com');
      await p.reload();
      await p.waitForSelector('#menu button');
      assert.strictEqual(await p.locator('#menu [data-v=controles]').count(), 0);
      await p.click('#menu [data-v=prevision]');
      await p.waitForSelector('#p-table table');
      assert.strictEqual(await p.locator('#p-save').count(), 0);
      assert.strictEqual(await p.locator('#p-stat').count(), 0);
      await p.click('#menu [data-v=historique]');
      await p.waitForSelector('#h-table table');
      assert.strictEqual(await p.locator('#h-arret').count(), 0);
      assert.strictEqual(await p.locator('#h-corr').count(), 0);
      assert.ok(!/NEGOCE ONA/.test(await texte('#h-table')), 'un TC ne voit pas les autres entités');
      await p.click('#menu [data-v=versions]');
      await p.waitForSelector('.vt li');
      assert.strictEqual(await p.locator('[data-valider]').count(), 0);
      assert.strictEqual(await p.locator('#x-jrn').count(), 0);
    });
    await etape('utilisateur sans accès : message clair et nouvelle tentative', async () => {
      env.moi('inconnu@eureden.com');
      await p.reload();
      await p.waitForSelector('#erreur:not([hidden])');
      assert.ok(/Aucun accès actif/.test(await texte('#erreur-message')));
      assert.ok(/ACCES_REFUSE/.test(await texte('#erreur-code')));
      env.moi('admin@eureden.com');
      await p.click('#erreur-retour');
      await p.waitForSelector('#menu button');
    });
    assert.deepStrictEqual(erreurs, [], 'erreurs JavaScript dans la page : ' + erreurs.join(' | '));
  } catch (e) {
    console.log(etapes.join('\n'));
    console.log('\nÉCHEC : ' + e.message);
    try { await p.screenshot({ path: path.join(RACINE, 'tests', 'echec-e2e.png'), fullPage: true }); } catch (x) { /* ignoré */ }
    await nav.close();
    process.exit(1);
  }
  console.log(etapes.join('\n'));
  console.log('\n' + etapes.length + ' étapes réussies');
  await nav.close();
})();
