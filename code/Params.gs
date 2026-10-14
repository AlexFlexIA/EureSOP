// Lecture du fichier PARAMETRES_SOP : campagne sélectionnée, réglages, profils, accès.

var Params = (function () {
  function idFichier() {
    var id = PropertiesService.getScriptProperties().getProperty(SOP.PROP_PARAM_ID);
    if (!txt(id)) {
      throw new AppError('PARAM_NON_CONFIGURE', 'Le fichier de paramètres n\'est pas configuré. Un administrateur doit lancer la configuration dans l\'éditeur Apps Script.');
    }
    return txt(id);
  }

  function table(tab) { return Store.read(idFichier(), tab).rows; }

  function reglages() {
    var map = {};
    table('REGLAGES').forEach(function (r) { if (txt(r.Cle)) map[norm(r.Cle)] = txt(r.Valeur); });
    return map;
  }

  function campagneSelectionnee() {
    var sel = table('CAMPAGNES').filter(function (r) { return yes(r.Selectionnee); });
    if (sel.length !== 1) {
      throw new AppError('CAMPAGNE_INVALIDE', 'Il faut exactement une campagne sélectionnée dans CAMPAGNES (' + sel.length + ' trouvée(s)).');
    }
    return sel[0];
  }

  function profils() {
    var map = {};
    table('PROFILS').forEach(function (r) {
      var role = norm(r.Role);
      if (!role) return;
      var p = { perimetre: txt(r['Perimetre obligatoire']) };
      Object.keys(SOP.CAPS).forEach(function (cap) { p[cap] = yes(r[SOP.CAPS[cap]]); });
      map[role] = p;
    });
    return map;
  }

  function acces(idCampagne) {
    return table('ACCES').filter(function (r) {
      return txt(r['ID campagne']) === txt(idCampagne) && yes(r.Actif);
    });
  }

  function idSortie(campagne) {
    var id = txt(campagne['ID sortie']);
    if (!id) throw new AppError('SORTIE_NON_CONFIGUREE', 'La campagne ' + txt(campagne['ID campagne']) + ' n\'a pas d\'ID de fichier de sortie.');
    return id;
  }

  return {
    idFichier: idFichier,
    table: table,
    reglages: reglages,
    campagneSelectionnee: campagneSelectionnee,
    profils: profils,
    acces: acces,
    idSortie: idSortie
  };
})();
