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

  // Commandes proposées (besoins de réapprovisionnement de la projection des stocks). Sans source de stocks, rien n'est écrit.
  function publierAppro(acteur, ctx, version, entete) {
    var p;
    try { p = Stocks.projeter(acteur); } catch (e) {
      Store.viderDonnees(ctx.idSortie, 'PUBLICATION_APPRO');
      return { ecrit: false, raison: e && e.message ? e.message : 'Projection impossible.' };
    }
    var lignes = p.besoins.map(function (b) {
      return Object.assign({}, entete, {
        'Plateforme': '*', 'Code produit': b.code, 'Code fournisseur': b.fournisseur, 'Semaine commande': b.semaineCommande, 'Semaine livraison': b.semaineBesoin,
        'Quantite': b.aCommander, 'Unite stock': b.unite || UNITE_NON_RENSEIGNEE, 'Tonnes': Catalogue.tonnes(b.aCommander, b.unite), 'Statut': 'PROPOSEE'
      });
    });
    Store.viderDonnees(ctx.idSortie, 'PUBLICATION_APPRO');
    Store.append(ctx.idSortie, 'PUBLICATION_APPRO', lignes);
    return { ecrit: true, lignes: lignes.length };
  }

  // lignes : lignes de PREVISION de la version validée. Renvoie { ecrit, ... } ; { ecrit: false, raison } si le cadençage manque.
  function publier(acteur, ctx, version, lignes, idOperation) {
    var annee = Number(acteur.campagne['Annee prevision']) || 0;
    if (!annee) return { ecrit: false, raison: 'La campagne n\'a pas d\'année de prévision : rien n\'est publié.' };
    var jeux = Cadencage.lire(acteur);
    if (!Object.keys(jeux).length) return { ecrit: false, raison: 'Aucun cadençage défini : rien n\'est publié. Définissez les coefficients (écran Cadençage) puis republiez.' };
    var entete = { 'ID campagne': ctx.idCampagne, 'Version contrat': SOP.CONTRAT_VERSION, 'ID version': version.idVersion, 'Scenario': 'BASE', 'Date validation': maintenant() };
    var catalogue = Catalogue.lire(acteur);
    var retenues = lignes.map(function (r) {
      var q = txt(r['Qte validee']) !== '' ? Number(r['Qte validee']) : (txt(r['Qte arbitree']) !== '' ? Number(r['Qte arbitree']) : Number(r['Qte statistique']) || 0);
      return { entite: txt(r.Entite), code: txt(r['Code produit']), qte: q, plateforme: txt(r.Plateforme) || '*', unite: txt(r['Unite stock']) };
    });
    var rep = Cadencage.hebdoPourLignes(acteur, retenues, catalogue);
    var rup = Ruptures.appliquer(acteur, rep.demande);
    var meta = {};
    retenues.forEach(function (l) { meta[norm(l.entite) + '|' + l.code] = l; });
    // Une entrée de réel peut concerner un article substitut absent de la prévision : entité et code se lisent dans la clé.
    var clesToutes = {};
    Object.keys(rep.demande).forEach(function (k) { clesToutes[k] = true; });
    Object.keys(rup.reel).forEach(function (k) { clesToutes[k] = true; });
    var hebdo = [], mensuel = [];
    Object.keys(clesToutes).sort().forEach(function (k) {
      var m = meta[k];
      var code = m ? m.code : k.slice(k.indexOf('|') + 1);
      var entite = m ? m.entite : Ajustements.nomEntite(k.slice(0, k.indexOf('|'))) || k.slice(0, k.indexOf('|'));
      var unite = (m && m.unite) || (catalogue[code] && catalogue[code].unite) || UNITE_NON_RENSEIGNEE;
      var dem = rep.demande[k] || {}, reel = rup.reel[k] || dem;
      var base = { 'Code produit': code, 'Entite': entite, 'Plateforme': (m && m.plateforme) || '*' };
      var semaines = {};
      Object.keys(dem).forEach(function (s) { semaines[s] = true; });
      Object.keys(reel).forEach(function (s) { semaines[s] = true; });
      var parMois = {};
      Object.keys(semaines).sort().forEach(function (s) {
        var qd = dem[s] || 0, qr = reel[s] || 0;
        if (qd === 0 && qr === 0) return;
        hebdo.push(Object.assign({}, entete, base, { 'Semaine': s, 'Quantite demande': qd, 'Quantite reelle': qr, 'Unite stock': unite, 'Tonnes demande': Catalogue.tonnes(qd, unite), 'Tonnes reelle': Catalogue.tonnes(qr, unite) }));
        var mo = Cadencage.mois(Number(s.slice(0, 4)), Number(s.slice(6)));
        var x = parMois[mo] = parMois[mo] || { d: 0, r: 0 };
        x.d = Math.round((x.d + qd) * 1000) / 1000; x.r = Math.round((x.r + qr) * 1000) / 1000;
      });
      Object.keys(parMois).sort().forEach(function (mo) {
        mensuel.push(Object.assign({}, entete, base, { 'Mois': mo, 'Quantite demande': parMois[mo].d, 'Quantite reelle': parMois[mo].r, 'Unite stock': unite, 'Tonnes demande': Catalogue.tonnes(parMois[mo].d, unite), 'Tonnes reelle': Catalogue.tonnes(parMois[mo].r, unite) }));
      });
    });
    var nonCadences = rep.nonCadences;
    Store.viderDonnees(ctx.idSortie, 'PUBLICATION_HEBDO');
    Store.viderDonnees(ctx.idSortie, 'PUBLICATION_MENSUELLE');
    Store.append(ctx.idSortie, 'PUBLICATION_HEBDO', hebdo);
    Store.append(ctx.idSortie, 'PUBLICATION_MENSUELLE', mensuel);
    var appro = publierAppro(acteur, ctx, version, entete);
    var nbContrat = ecrireContrat(ctx);
    Journal.log(ctx.idSortie, acteur, 'PUBLICATION_ECRITE', version.idVersion, '', 'contrat ' + SOP.CONTRAT_VERSION + ' · ' + mensuel.length + ' ligne(s) mensuelles, ' + hebdo.length + ' hebdomadaires', nonCadences ? nonCadences + ' article(s) sans cadençage' : '', idOperation);
    return { ecrit: true, mensuelle: mensuel.length, hebdo: hebdo.length, nonCadences: nonCadences, contrat: nbContrat, appro: appro, ruptures: Object.keys(rup.touche).length };
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
