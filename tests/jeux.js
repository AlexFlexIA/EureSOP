// Jeux de données partagés par les tests unitaires (run.js) et le test de bout en bout (e2e.js).
'use strict';
const { creerEnvStandard } = require('./harness');

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

function envPrev() {
  const env = envHisto();
  env.semer('PARAM_FICHIER_TEST_00001', 'REGLAGES', [{ Cle: 'PONDERATION_ANNEES', Valeur: '50/30/20' }]);
  return env;
}

module.exports = { ENT_HISTO, FICHIER_EUR, FICHIER_ONA, envHisto, envPrev };
