// Publication vers les autres applications : onglets PUBLICATION_* et CONTRAT du fichier de sortie.
// Écrite à la validation d'une version (et à la demande, pour republier après un changement de cadençage).
// Les autres applications ne lisent que ces onglets et se fient à CONTRAT, versionné.

var Publication = (function () {
  var UNITE_NON_RENSEIGNEE = '';

  function colonnes(tab) { return SOP_STRUCTURE.SORTIE_SOP[tab]; }

  function ecrireContrat(ctx) {
    var lignes = [];
    Object.keys(SOP_REGLES).forEach(function (tab) {
      colonnes(tab).forEach(function (col, i) {
        lignes.push({ 'Onglet': tab, 'Colonne': col, 'Type': SOP_TYPES.SORTIE_SOP[tab][i], 'Description': SOP_REGLES[tab][i] || '', 'Version contrat': SOP.CONTRAT_VERSION });
      });
    });
    Store.viderDonnees(ctx.idSortie, 'CONTRAT');
    Store.append(ctx.idSortie, 'CONTRAT', lignes);
    return lignes.length;
  }

  // lignes : lignes de PREVISION de la version validée. Renvoie { ecrit, ... } ; { ecrit: false, raison } si le cadençage manque.
  function publier(acteur, ctx, version, lignes, idOperation) {
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    if (!annee) return { ecrit: false, raison: 'La campagne n\'a pas d\'année de prévision : rien n\'est publié.' };
    var jeux = Cadencage.lire(acteur);
    if (!Object.keys(jeux).length) return { ecrit: false, raison: 'Aucun cadençage défini : rien n\'est publié. Définissez les coefficients (écran Cadençage) puis republiez.' };
    var entete = { 'ID campagne': ctx.idCampagne, 'Version contrat': SOP.CONTRAT_VERSION, 'ID version': version.idVersion, 'Scenario': 'BASE', 'Date validation': maintenant() };
    var hebdo = [], mensuel = [], nonCadences = 0, parMois = {};
    lignes.forEach(function (r) {
      var retenue = txt(r['Qte validee']) !== '' ? Number(r['Qte validee']) : (txt(r['Qte arbitree']) !== '' ? Number(r['Qte arbitree']) : Number(r['Qte statistique']) || 0);
      var jeu = Cadencage.profil(jeux, txt(r['Code produit']));
      if (!jeu) { nonCadences++; return; }
      if (!(retenue > 0)) return;
      var base = { 'Code produit': txt(r['Code produit']), 'Entite': txt(r.Entite), 'Plateforme': txt(r.Plateforme) || '*' };
      var mensuelArticle = {};
      Cadencage.repartir(retenue, jeu).forEach(function (x) {
        if (x.qte === 0) return;
        hebdo.push(Object.assign({}, entete, base, { 'Semaine': Cadencage.etiquette(annee, x.sem), 'Quantite demande': x.qte, 'Quantite reelle': x.qte, 'Unite stock': UNITE_NON_RENSEIGNEE }));
        var m = Cadencage.mois(annee, x.sem);
        mensuelArticle[m] = Math.round(((mensuelArticle[m] || 0) + x.qte) * 1000) / 1000;
      });
      Object.keys(mensuelArticle).sort().forEach(function (m) {
        mensuel.push(Object.assign({}, entete, base, { 'Mois': m, 'Quantite demande': mensuelArticle[m], 'Quantite reelle': mensuelArticle[m], 'Unite stock': UNITE_NON_RENSEIGNEE }));
      });
    });
    Store.viderDonnees(ctx.idSortie, 'PUBLICATION_HEBDO');
    Store.viderDonnees(ctx.idSortie, 'PUBLICATION_MENSUELLE');
    Store.append(ctx.idSortie, 'PUBLICATION_HEBDO', hebdo);
    Store.append(ctx.idSortie, 'PUBLICATION_MENSUELLE', mensuel);
    var nbContrat = ecrireContrat(ctx);
    Journal.log(ctx.idSortie, acteur, 'PUBLICATION_ECRITE', version.idVersion, '', 'contrat ' + SOP.CONTRAT_VERSION + ' · ' + mensuel.length + ' ligne(s) mensuelles, ' + hebdo.length + ' hebdomadaires', nonCadences ? nonCadences + ' article(s) sans cadençage' : '', idOperation);
    return { ecrit: true, mensuelle: mensuel.length, hebdo: hebdo.length, nonCadences: nonCadences, contrat: nbContrat };
  }

  // Republie la version validée courante (après un changement de cadençage par exemple).
  function republier(acteur, idOperation) {
    Auth.requireCap(acteur, 'validation');
    if (!Auth.inScope(acteur, 'validation', {})) throw new AppError('CAPACITE_REFUSEE', 'La publication porte sur tous les articles : elle demande un périmètre global.');
    Auth.requireWritable(acteur);
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var cour = Versions.lignesCampagne(ctx).filter(function (r) { return norm(r.Scenario) === 'BASE' && norm(r.Statut) === 'COURANTE'; })[0];
        if (!cour || norm(cour.Type) !== 'VALIDEE') throw new AppError('VERSION_NON_VALIDEE', 'Seule une version validée peut être publiée.');
        var lignes = Store.read(ctx.idSortie, 'PREVISION').rows;
        return publier(acteur, ctx, { idVersion: txt(cour['ID version']) }, lignes, idOperation);
      });
    });
  }

  return { publier: publier, republier: republier };
})();
