// Contrôles de mise en service : structure des classeurs, campagne, accès. Réservé à la configuration.

var Controles = (function () {
  function verifierClasseur(resultats, idFichier, groupe, etiquette) {
    var tabs = SOP_STRUCTURE[groupe];
    Object.keys(tabs).forEach(function (tab) {
      try {
        var c = Store.checkHeaders(idFichier, tab, tabs[tab]);
        if (!c.ok) {
          var detail = [];
          if (c.manquants.length) detail.push('colonnes manquantes : ' + c.manquants.join(', '));
          if (c.inconnus.length) detail.push('colonnes inconnues : ' + c.inconnus.join(', '));
          resultats.push({ niveau: 'ERREUR', sujet: etiquette + ' / ' + tab, detail: detail.join(' ; ') });
        } else if (c.ordre) {
          resultats.push({ niveau: 'ATTENTION', sujet: etiquette + ' / ' + tab, detail: 'Les colonnes sont présentes mais dans un autre ordre.' });
        }
      } catch (e) {
        if (e && e.code === 'ONGLET_ABSENT') resultats.push({ niveau: 'ERREUR', sujet: etiquette + ' / ' + tab, detail: 'Onglet absent.' });
        else throw e;
      }
    });
  }

  function run(acteur) {
    Auth.requireCap(acteur, 'configuration');
    var res = [];
    var idParam = Params.idFichier();
    verifierClasseur(res, idParam, 'PARAMETRES_SOP', 'Paramètres');

    var campagne = acteur.campagne;
    var idCampagne = txt(campagne['ID campagne']);
    var idSortie = txt(campagne['ID sortie']);
    if (!idSortie) {
      res.push({ niveau: 'ERREUR', sujet: 'Campagne ' + idCampagne, detail: 'ID sortie vide dans CAMPAGNES.' });
    } else {
      verifierClasseur(res, idSortie, 'SORTIE_SOP', 'Sortie');
    }
    if (['PREPARATION', 'OUVERTE', 'GELEE', 'CLOTUREE'].indexOf(norm(campagne.Statut)) < 0) {
      res.push({ niveau: 'ERREUR', sujet: 'Campagne ' + idCampagne, detail: 'Statut inconnu : ' + txt(campagne.Statut) });
    }

    var profils = Params.profils();
    var acces = Params.acces(idCampagne);
    var invalides = acces.filter(function (l) { return !Auth.ligneValide(l, profils); });
    invalides.forEach(function (l) {
      res.push({ niveau: 'ATTENTION', sujet: 'Accès ligne ' + l._row, detail: 'Ligne ignorée : rôle inconnu ou périmètre obligatoire manquant (' + txt(l['Email Google']) + ', ' + txt(l.Role) + ').' });
    });
    var domaines = txt(Params.reglages().DOMAINES).split(',').map(function (d) { return txt(d).toLowerCase(); }).filter(Boolean);
    acces.forEach(function (l) {
      var e = txt(l['Email Google']).toLowerCase();
      if (e && !domaines.some(function (d) { return e.slice(-(d.length + 1)) === '@' + d; })) {
        res.push({ niveau: 'ATTENTION', sujet: 'Accès ligne ' + l._row, detail: 'Adresse hors domaine autorisé : ' + e });
      }
    });
    if (!acces.some(function (l) { return norm(l.Role) === 'ADMIN' && Auth.ligneValide(l, profils); })) {
      res.push({ niveau: 'ATTENTION', sujet: 'Accès', detail: 'Aucun administrateur dans ACCES : seuls les administrateurs initiaux (propriété ' + SOP.PROP_ADMINS + ') ont la main.' });
    }
    if (res.some(function (r) { return r.niveau === 'ERREUR' && /colonnes|Onglet absent/.test(r.detail); })) {
      res.push({ niveau: 'ATTENTION', sujet: 'Modèle', detail: 'La structure attendue est la version ' + SOP_STRUCTURE_VERSION + ' du modèle. Si les classeurs ont été créés avec une version plus ancienne, réimportez les modèles actuels (Fichier > Importer > Remplacer la feuille de calcul garde le même ID).' });
    }
    if (!res.length) res.push({ niveau: 'OK', sujet: 'Mise en service', detail: 'Structure, campagne et accès conformes.' });
    return res.concat(Histo.verifier(idCampagne));
  }

  return { run: run };
})();
