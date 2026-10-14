// Identité, rôles, capacités et périmètre. Chaque appel serveur recalcule tout : rien n'est supposé côté navigateur.

var Auth = (function () {
  // Texte de « Perimetre obligatoire » (PROFILS) vers colonne de ACCES.
  var COLONNE_PERIMETRE = {
    'CODE TC': 'Code technicien',
    'TERRITOIRE': 'Territoire TC',
    'BASSIN': 'Bassin TC',
    'MARCHE': 'Marche'
  };

  function admins() {
    return txt(PropertiesService.getScriptProperties().getProperty(SOP.PROP_ADMINS))
      .split(',').map(function (e) { return txt(e).toLowerCase(); }).filter(Boolean);
  }

  function perimetreSatisfait(ligne, profil) {
    var p = norm(profil.perimetre);
    if (p === 'GLOBAL') return yes(ligne.Global);
    if (p.indexOf('GLOBAL OU') === 0) {
      return yes(ligne.Global) || Object.keys(SOP.PERIMETRE).some(function (k) { return txt(ligne[SOP.PERIMETRE[k]]) !== ''; });
    }
    var col = COLONNE_PERIMETRE[p];
    return !!col && txt(ligne[col]) !== '';
  }

  function perimetreDe(ligne) {
    var s = { global: yes(ligne.Global) };
    Object.keys(SOP.PERIMETRE).forEach(function (k) {
      var v = txt(ligne[SOP.PERIMETRE[k]]);
      s[k] = v === '*' ? '' : norm(v);
    });
    return s;
  }

  // Une ligne d'accès est valide si son rôle existe et si son périmètre obligatoire est renseigné.
  function ligneValide(ligne, profils) {
    var role = norm(ligne.Role);
    var profil = profils[role];
    if (!profil || SOP.ROLES.indexOf(role) < 0) return false;
    return perimetreSatisfait(ligne, profil);
  }

  function campagnePourId(idCampagne) {
    if (!txt(idCampagne)) return Params.campagneSelectionnee();
    var c = Params.table('CAMPAGNES').filter(function (r) { return txt(r['ID campagne']) === txt(idCampagne); })[0];
    if (!c) throw new AppError('CAMPAGNE_INCONNUE', 'La campagne ' + txt(idCampagne).slice(0, 40) + ' n\'existe pas dans CAMPAGNES.');
    return c;
  }

  // Campagnes sur lesquelles l'adresse a au moins une ligne d'accès valide (les administrateurs initiaux les voient toutes).
  function campagnesAccessibles(email, profils) {
    var admin = admins().indexOf(email) >= 0;
    return Params.table('CAMPAGNES').filter(function (c) {
      var id = txt(c['ID campagne']);
      if (!id) return false;
      if (admin) return true;
      return Params.acces(id).some(function (l) { return txt(l['Email Google']).toLowerCase() === email && ligneValide(l, profils); });
    });
  }

  // idCampagne facultatif : sans lui, la campagne marquée Selectionnee dans CAMPAGNES.
  function resolve(idCampagne) {
    var email = txt(Session.getActiveUser().getEmail()).toLowerCase();
    if (!email) {
      throw new AppError('IDENTITE_INDISPONIBLE', 'Votre adresse n\'a pas pu être lue. L\'application doit être déployée pour l\'organisation, exécutée au nom du déployeur.');
    }
    var reg = Params.reglages();
    var domaines = txt(reg.DOMAINES).split(',').map(function (d) { return txt(d).toLowerCase(); }).filter(Boolean);
    if (!domaines.length) throw new AppError('DOMAINE_NON_CONFIGURE', 'Le réglage DOMAINES est vide.');
    var autorise = domaines.some(function (d) { return email.slice(-(d.length + 1)) === '@' + d; });
    if (!autorise) throw new AppError('DOMAINE_REFUSE', 'Ce compte n\'appartient pas à un domaine autorisé.');

    var profils = Params.profils();
    var estAdminInitial = admins().indexOf(email) >= 0;
    var rolesPour = function (c) {
      var lignes = Params.acces(c['ID campagne']).filter(function (l) {
        return txt(l['Email Google']).toLowerCase() === email && ligneValide(l, profils);
      });
      var r = lignes.map(function (l) { return { role: norm(l.Role), perimetre: perimetreDe(l) }; });
      if (estAdminInitial && !r.some(function (x) { return x.role === 'ADMIN'; })) r.push({ role: 'ADMIN', perimetre: { global: true } });
      return r;
    };
    var campagne = campagnePourId(idCampagne);
    var roles = rolesPour(campagne);
    // Sans campagne demandée et sans accès à la campagne par défaut : première campagne accessible.
    if (!roles.length && !txt(idCampagne)) {
      var autre = campagnesAccessibles(email, profils)[0];
      if (autre) { campagne = autre; roles = rolesPour(autre); }
    }
    if (!roles.length) throw new AppError('ACCES_REFUSE', 'Aucun accès actif pour ' + email + ' sur la campagne ' + txt(campagne['ID campagne']) + '.');

    var caps = {};
    Object.keys(SOP.CAPS).forEach(function (cap) {
      caps[cap] = roles.some(function (r) { return profils[r.role] && profils[r.role][cap]; });
    });
    return { email: email, campagne: campagne, roles: roles, caps: caps, profils: profils, campagnes: campagnesAccessibles(email, profils) };
  }

  function requireCap(actor, cap) {
    if (!actor.caps[cap]) throw new AppError('CAPACITE_REFUSEE', 'Votre rôle ne permet pas cette action.');
  }

  // Vrai si un des rôles de l'acteur qui porte la capacité couvre la cible.
  function inScope(actor, cap, cible) {
    cible = cible || {};
    return actor.roles.some(function (r) {
      var profil = actor.profils[r.role];
      if (!profil || !profil[cap]) return false;
      if (r.perimetre.global) return true;
      return Object.keys(SOP.PERIMETRE).every(function (k) {
        if (!r.perimetre[k]) return true;
        return norm(cible[k]) === r.perimetre[k];
      });
    });
  }

  // Les écritures sont permises quand la campagne est ouverte. En préparation, seuls les rôles de configuration écrivent.
  function requireWritable(actor) {
    var statut = norm(actor.campagne.Statut);
    if (statut === 'OUVERTE') return;
    if (statut === 'PREPARATION' && actor.caps.configuration) return;
    throw new AppError('CAMPAGNE_FERMEE', 'La campagne est en statut ' + (statut || 'inconnu') + ' : les modifications sont fermées.');
  }

  return { resolve: resolve, requireCap: requireCap, inScope: inScope, requireWritable: requireWritable, ligneValide: ligneValide };
})();
