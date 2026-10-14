// Corrections, événements, arrêts de produit et substitutions appliqués à la prévision statistique.
//
//  - CORRECTION  : ligne de AJUSTEMENTS_SEMAINE (SORTIE), type CORRECTION.
//  - EVENEMENT   : ligne de EVENEMENTS_COMMERCE (SORTIE) : polco, promo, grand compte, appel d'offres, réglementaire.
//  - SUBSTITUTION et ARRET : ligne de SUBSTITUTIONS (PARAMETRES_SOP, permanent). Un arrêt est une substitution sans nouvel article.
//
// Les semaines saisies sont conservées pour le cadençage à venir : au niveau du PAC, seule la quantité compte.
// Aucune de ces saisies ne modifie PREVISION tant qu'une version arbitrée n'est pas créée.

var Ajustements = (function () {
  var TYPES_EVENEMENT = ['POLCO', 'PROMO', 'GRAND_COMPTE', 'APPEL_OFFRES', 'REGLEMENTAIRE'];
  var MOTIFS_SUBSTITUTION = ['REMPLACEMENT', 'REGLEMENTAIRE', 'AUTRE'];

  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    if (t === '') return NaN;
    return Number(t);
  }

  function annee(v) {
    if (v && typeof v.getFullYear === 'function') return v.getFullYear();
    var m = /^(\d{4})/.exec(txt(v));
    return m ? Number(m[1]) : 0;
  }

  function cle(entite, code) { return norm(entite) + '|' + txt(code); }

  // Nom exact de l'entité tel que déclaré dans les sources d'historique actives (SOURCES, colonne Entite).
  function nomEntite(entite) {
    var voulu = norm(entite);
    var trouve = Params.table('SOURCES').filter(function (r) {
      return norm(r.Nature) === 'HISTO_PAC' && yes(r['Actif import']) && norm(r.Entite) === voulu;
    })[0];
    return trouve ? txt(trouve.Entite) : '';
  }

  // Droits : correction et événement demandent la correction de prévision, substitution et arrêt la validation de gamme
  // ou l'arbitrage. Le périmètre doit être global : ces fichiers ne portent pas le marché ni le territoire.
  function exigerDroit(acteur, nature) {
    var cap = nature === 'SUBSTITUTION' || nature === 'ARRET' ? (acteur.caps.validationGamme ? 'validationGamme' : 'arbitrage') : 'correctionPrevision';
    Auth.requireCap(acteur, cap);
    if (!Auth.inScope(acteur, cap, {})) {
      throw new AppError('CAPACITE_REFUSEE', 'Cette saisie porte sur un article de toute la campagne : elle demande un périmètre global. Pour un périmètre marché, saisissez directement dans l\'onglet SUBSTITUTIONS.');
    }
    Auth.requireWritable(acteur);
  }

  function suivant(rows, colonne, prefixe, largeur) {
    var max = rows.reduce(function (m, r) {
      var x = /(\d+)$/.exec(txt(r[colonne]));
      return x ? Math.max(m, Number(x[1])) : m;
    }, 0) + 1;
    var n = String(max);
    while (n.length < largeur) n = '0' + n;
    return prefixe + n;
  }

  function impact(entree) {
    var q = nombre(entree.quantite), p = nombre(entree.pourcent);
    var aQ = !isNaN(q) && txt(entree.quantite) !== '', aP = !isNaN(p) && txt(entree.pourcent) !== '';
    if (aQ === aP) throw new AppError('IMPACT_INVALIDE', 'Renseignez soit une quantité, soit un pourcentage, mais pas les deux ni aucun.');
    if (aQ && q === 0) throw new AppError('IMPACT_INVALIDE', 'La quantité ne peut pas être nulle.');
    if (aP && (p === 0 || p < -100 || p > 1000)) throw new AppError('IMPACT_INVALIDE', 'Le pourcentage doit être non nul, entre -100 et 1000.');
    return { quantite: aQ ? q : '', pourcent: aP ? p : '' };
  }

  function semaines(entree) {
    var d = txt(entree.semaineDebut), f = txt(entree.semaineFin);
    var re = /^\d{4}-S\d{2}$/;
    if ((d && !re.test(d)) || (f && !re.test(f))) throw new AppError('SEMAINE_INVALIDE', 'Les semaines se saisissent au format AAAA-Sss, par exemple 2027-S06.');
    if (d && f && f < d) throw new AppError('SEMAINE_INVALIDE', 'La semaine de fin précède la semaine de début.');
    return { debut: d, fin: f };
  }

  function creer(acteur, entree, idOperation) {
    entree = entree || {};
    var nature = norm(entree.nature);
    if (['CORRECTION', 'EVENEMENT', 'SUBSTITUTION', 'ARRET'].indexOf(nature) < 0) throw new AppError('NATURE_INVALIDE', 'Nature inconnue : ' + txt(entree.nature) + '.');
    exigerDroit(acteur, nature);
    var ctx = Versions.contexte(acteur);
    var code = txt(entree.code), ancien = txt(entree.ancien), nouveau = txt(entree.nouveau);
    var entite = txt(entree.entite) ? nomEntite(entree.entite) : '';

    if (nature === 'CORRECTION' || nature === 'EVENEMENT') {
      if (!code) throw new AppError('CODE_OBLIGATOIRE', 'Le code produit est obligatoire.');
      if (!entite) throw new AppError('ENTITE_INCONNUE', 'Entité inconnue : choisissez une entité de l\'historique.');
    }
    if (nature === 'SUBSTITUTION' || nature === 'ARRET') {
      if (!ancien) throw new AppError('CODE_OBLIGATOIRE', 'Le code de l\'ancien article est obligatoire.');
      if (txt(entree.entite) && !entite) throw new AppError('ENTITE_INCONNUE', 'Entité inconnue : choisissez une entité de l\'historique ou laissez vide pour toutes.');
      if (nature === 'SUBSTITUTION' && !nouveau) throw new AppError('CODE_OBLIGATOIRE', 'Le code du nouvel article est obligatoire pour une substitution.');
      if (nature === 'SUBSTITUTION' && nouveau === ancien) throw new AppError('SUBSTITUTION_INVALIDE', 'L\'ancien et le nouvel article sont identiques.');
    }

    var donnees;
    if (nature === 'CORRECTION') {
      var motif = txt(entree.motif);
      if (!motif) throw new AppError('MOTIF_OBLIGATOIRE', 'Le motif d\'une correction est obligatoire.');
      donnees = { impact: impact(entree), semaines: semaines(entree), motif: motif };
    } else if (nature === 'EVENEMENT') {
      var type = norm(entree.type);
      if (TYPES_EVENEMENT.indexOf(type) < 0) throw new AppError('TYPE_INVALIDE', 'Type d\'événement inconnu : ' + txt(entree.type) + '.');
      donnees = { impact: impact(entree), semaines: semaines(entree), type: type };
    } else {
      var taux = txt(entree.taux) === '' ? 100 : nombre(entree.taux);
      if (isNaN(taux) || taux <= 0 || taux > 100) throw new AppError('TAUX_INVALIDE', 'Le taux de report est un pourcentage entre 0 (exclu) et 100.');
      ['dateEffet', 'dateFin'].forEach(function (k) {
        if (txt(entree[k]) && !/^\d{4}-\d{2}-\d{2}$/.test(txt(entree[k]))) throw new AppError('DATE_INVALIDE', 'Les dates se saisissent au format AAAA-MM-JJ.');
      });
      var motifS = nature === 'ARRET' ? 'ARRET' : (norm(entree.motif) || 'REMPLACEMENT');
      if (nature === 'SUBSTITUTION' && MOTIFS_SUBSTITUTION.indexOf(motifS) < 0) throw new AppError('TYPE_INVALIDE', 'Motif de substitution inconnu : ' + txt(entree.motif) + '.');
      donnees = { taux: taux, motif: motifS };
    }

    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var maintenantTxt = maintenant();
        var id, avertissement = '';
        var connus = Store.read(ctx.idSortie, 'PREVISION').rows;
        var verifier = nature === 'SUBSTITUTION' || nature === 'ARRET' ? ancien : code;
        var existe = connus.some(function (r) { return txt(r['Code produit']) === verifier && (!entite || norm(r.Entite) === norm(entite)); });
        if (!existe) avertissement = 'Le code ' + verifier + ' n\'est pas dans la prévision actuelle' + (entite ? ' de ' + entite : '') + ' : nouvel article ou faute de frappe ?';

        if (nature === 'CORRECTION') {
          var cors = Store.read(ctx.idSortie, 'AJUSTEMENTS_SEMAINE').rows;
          id = suivant(cors, 'ID ajustement', 'COR', 4);
          Store.append(ctx.idSortie, 'AJUSTEMENTS_SEMAINE', [{
            'ID ajustement': id, 'Code produit': code, 'Marche': '', 'Entite': entite, 'Plateforme': '*',
            'Semaine debut': donnees.semaines.debut, 'Semaine fin': donnees.semaines.fin, 'Type': 'CORRECTION',
            'Quantite': donnees.impact.quantite, 'Pourcent': donnees.impact.pourcent, 'Motif': donnees.motif,
            'Statut': 'ACTIF', 'Cree par': acteur.email, 'Cree le': maintenantTxt
          }]);
        } else if (nature === 'EVENEMENT') {
          var evs = Store.read(ctx.idSortie, 'EVENEMENTS_COMMERCE').rows;
          id = suivant(evs, 'ID evenement', 'EVT', 4);
          Store.append(ctx.idSortie, 'EVENEMENTS_COMMERCE', [{
            'ID evenement': id, 'Type': donnees.type, 'Code produit': code, 'Marche': '', 'Entite': entite, 'Territoire TC': '*',
            'Semaine debut': donnees.semaines.debut, 'Semaine fin': donnees.semaines.fin,
            'Impact quantite': donnees.impact.quantite, 'Impact pourcent': donnees.impact.pourcent,
            'Commentaire': txt(entree.commentaire), 'Saisi par': acteur.email, 'Saisi le': maintenantTxt, 'Actif': 'OUI'
          }]);
        } else {
          var idParam = Params.idFichier();
          var subs = Store.read(idParam, 'SUBSTITUTIONS').rows;
          id = suivant(subs, 'ID substitution', 'SUB_', 3);
          Store.append(idParam, 'SUBSTITUTIONS', [{
            'ID substitution': id, 'Code ancien': ancien, 'Code nouveau': nature === 'ARRET' ? '' : nouveau, 'Entite': entite,
            'Portee': 'PREVISION', 'Motif': donnees.motif, 'Date effet': txt(entree.dateEffet), 'Date fin': txt(entree.dateFin),
            'Taux de report': donnees.taux, 'Renseigne par': acteur.email, 'Valide par': '', 'Actif': 'OUI',
            'Commentaire': txt(entree.commentaire)
          }]);
        }
        Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_CREE', id, '', nature, txt(entree.commentaire) || txt(entree.motif), idOperation);
        return { id: id, nature: nature, avertissement: avertissement };
      });
    });
  }

  function annuler(acteur, nature, id, idOperation) {
    nature = norm(nature);
    if (['CORRECTION', 'EVENEMENT', 'SUBSTITUTION'].indexOf(nature) < 0) throw new AppError('NATURE_INVALIDE', 'Nature inconnue : ' + txt(nature) + '.');
    exigerDroit(acteur, nature);
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var maintenantTxt = maintenant();
        var fichier = nature === 'SUBSTITUTION' ? Params.idFichier() : ctx.idSortie;
        var onglet = nature === 'CORRECTION' ? 'AJUSTEMENTS_SEMAINE' : nature === 'EVENEMENT' ? 'EVENEMENTS_COMMERCE' : 'SUBSTITUTIONS';
        var colId = nature === 'CORRECTION' ? 'ID ajustement' : nature === 'EVENEMENT' ? 'ID evenement' : 'ID substitution';
        var ligne = Store.read(fichier, onglet).rows.filter(function (r) { return txt(r[colId]) === txt(id); })[0];
        if (!ligne) throw new AppError('AJUSTEMENT_INCONNU', 'Saisie ' + txt(id) + ' introuvable.');
        if (nature === 'CORRECTION') {
          if (norm(ligne.Statut) !== 'ACTIF') throw new AppError('DEJA_ANNULE', 'La saisie ' + txt(id) + ' est déjà annulée.');
          Store.updateRow(fichier, onglet, ligne._row, { 'Statut': 'ANNULE', 'Annule par': acteur.email, 'Annule le': maintenantTxt });
        } else {
          if (!yes(ligne.Actif)) throw new AppError('DEJA_ANNULE', 'La saisie ' + txt(id) + ' est déjà annulée.');
          Store.updateRow(fichier, onglet, ligne._row, { 'Actif': 'NON' });
        }
        Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_ANNULE', txt(id), 'ACTIF', 'ANNULE', nature, idOperation);
        return { id: txt(id), nature: nature };
      });
    });
  }

  function lister(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = Versions.contexte(acteur);
    var autorise = Histo.filtre(acteur);
    var corrections = Store.read(ctx.idSortie, 'AJUSTEMENTS_SEMAINE').rows
      .filter(function (r) { return norm(r.Type) === 'CORRECTION' && norm(r.Statut) === 'ACTIF' && autorise(txt(r.Entite), ''); })
      .map(function (r) { return { id: txt(r['ID ajustement']), code: txt(r['Code produit']), entite: txt(r.Entite), quantite: txt(r.Quantite), pourcent: txt(r.Pourcent), motif: txt(r.Motif), par: txt(r['Cree par']), le: txt(r['Cree le']) }; });
    var evenements = Store.read(ctx.idSortie, 'EVENEMENTS_COMMERCE').rows
      .filter(function (r) { return yes(r.Actif) && autorise(txt(r.Entite), ''); })
      .map(function (r) { return { id: txt(r['ID evenement']), type: norm(r.Type), code: txt(r['Code produit']), entite: txt(r.Entite), quantite: txt(r['Impact quantite']), pourcent: txt(r['Impact pourcent']), commentaire: txt(r.Commentaire), par: txt(r['Saisi par']), le: txt(r['Saisi le']) }; });
    var substitutions = Store.read(Params.idFichier(), 'SUBSTITUTIONS').rows
      .filter(function (r) { return yes(r.Actif) && txt(r['Code ancien']) && autorise(txt(r.Entite), ''); })
      .map(function (r) { return { id: txt(r['ID substitution']), nature: txt(r['Code nouveau']) ? 'SUBSTITUTION' : 'ARRET', ancien: txt(r['Code ancien']), nouveau: txt(r['Code nouveau']), entite: txt(r.Entite), taux: txt(r['Taux de report']) || '100', motif: norm(r.Motif), effet: txt(r['Date effet']), fin: txt(r['Date fin']), commentaire: txt(r.Commentaire), par: txt(r['Renseigne par']) }; });
    return { corrections: corrections, evenements: evenements, substitutions: substitutions, entites: Histo.sources(ctx.idCampagne).map(function (s) { return txt(s.Entite); }) };
  }

  // Corrections saisies en bloc dans le tableau de prévision : chaque ligne donne la correction nette voulue pour un article.
  // Une ligne sans quantité ni pourcentage supprime les corrections actives de l'article. Tout est contrôlé avant la première écriture.
  function preparerCorrections(items, motif, commentaire) {
    var lignes = [];
    var vues = {};
    var avecImpact = 0;
    (items || []).forEach(function (it, i) {
      var code = txt(it && it.code);
      var entite = nomEntite(it && it.entite);
      if (!code) throw new AppError('CODE_OBLIGATOIRE', 'Ligne ' + (i + 1) + ' : code produit manquant.');
      if (!entite) throw new AppError('ENTITE_INCONNUE', 'Ligne ' + (i + 1) + ' : entité inconnue.');
      var k = cle(entite, code);
      if (vues[k]) throw new AppError('DOUBLON', 'L\'article ' + code + ' (' + entite + ') est saisi deux fois.');
      vues[k] = true;
      var q = txt(it.quantite) === '' ? NaN : nombre(it.quantite), p = txt(it.pourcent) === '' ? NaN : nombre(it.pourcent);
      var vide = (isNaN(q) || q === 0) && (isNaN(p) || p === 0);
      if (vide) { lignes.push({ entite: entite, code: code, quantite: '', pourcent: '' }); return; }
      if (!isNaN(q) && q !== 0 && !isNaN(p) && p !== 0) throw new AppError('IMPACT_INVALIDE', 'Article ' + code + ' : une quantité ou un pourcentage, pas les deux.');
      if (!isNaN(p) && p !== 0 && (p < -100 || p > 1000)) throw new AppError('IMPACT_INVALIDE', 'Article ' + code + ' : le pourcentage doit être entre -100 et 1000.');
      avecImpact++;
      lignes.push({ entite: entite, code: code, quantite: !isNaN(q) && q !== 0 ? q : '', pourcent: !isNaN(p) && p !== 0 ? p : '' });
    });
    if (avecImpact && !txt(motif)) throw new AppError('MOTIF_OBLIGATOIRE', 'Le motif de la reprévision est obligatoire.');
    var texte = txt(motif) + (txt(commentaire) ? ' – ' + txt(commentaire) : '');
    lignes.forEach(function (l) { l.motif = texte; });
    return lignes;
  }

  function remplacerCorrections(acteur, ctx, lignes, idOperation) {
    var cree = 0, annule = 0;
    var maintenantTxt = maintenant();
    lignes.forEach(function (l) {
      var actives = Store.read(ctx.idSortie, 'AJUSTEMENTS_SEMAINE').rows.filter(function (r) {
        return norm(r.Type) === 'CORRECTION' && norm(r.Statut) === 'ACTIF' && cle(r.Entite, r['Code produit']) === cle(l.entite, l.code);
      });
      actives.forEach(function (r) {
        Store.updateRow(ctx.idSortie, 'AJUSTEMENTS_SEMAINE', r._row, { 'Statut': 'ANNULE', 'Annule par': acteur.email, 'Annule le': maintenantTxt });
        Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_ANNULE', txt(r['ID ajustement']), 'ACTIF', 'ANNULE', 'Remplacé par la reprévision', idOperation);
        annule++;
      });
      if (l.quantite === '' && l.pourcent === '') return;
      var id = suivant(Store.read(ctx.idSortie, 'AJUSTEMENTS_SEMAINE').rows, 'ID ajustement', 'COR', 4);
      Store.append(ctx.idSortie, 'AJUSTEMENTS_SEMAINE', [{
        'ID ajustement': id, 'Code produit': l.code, 'Marche': '', 'Entite': l.entite, 'Plateforme': '*',
        'Semaine debut': '', 'Semaine fin': '', 'Type': 'CORRECTION', 'Quantite': l.quantite, 'Pourcent': l.pourcent, 'Motif': l.motif,
        'Statut': 'ACTIF', 'Cree par': acteur.email, 'Cree le': maintenantTxt
      }]);
      Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_CREE', id, '', 'CORRECTION', l.motif, idOperation);
      cree++;
    });
    return { cree: cree, annule: annule };
  }

  // Effets des saisies actives sur la prévision statistique.
  // base : { 'ENTITE|code': { entite, code, stat } }. Les pourcentages s'appliquent à la statistique de l'article.
  // Les substitutions se calculent toutes sur la statistique de départ : pas de chaînage A vers B vers C.
  function effets(acteur, base) {
    var ctx = Versions.contexte(acteur);
    var anneePrevue = Number(acteur.campagne['Annee prevision']) || 0;
    var res = { cles: {}, avertissements: [], nbEvenements: 0, nbCorrections: 0, nbSubstitutions: 0 };

    function fiche(entite, code) {
      var k = cle(entite, code);
      return res.cles[k] = res.cles[k] || { entite: entite, code: code, evenements: 0, correction: 0, substitution: 0 };
    }
    function statDe(entite, code) { var b = base[cle(entite, code)]; return b ? b.stat : 0; }

    Store.read(ctx.idSortie, 'EVENEMENTS_COMMERCE').rows.forEach(function (r) {
      if (!yes(r.Actif) || !txt(r['Code produit']) || !txt(r.Entite)) return;
      var q = nombre(r['Impact quantite']), p = nombre(r['Impact pourcent']);
      var valeur = !isNaN(q) ? q : (!isNaN(p) ? statDe(r.Entite, txt(r['Code produit'])) * p / 100 : 0);
      fiche(txt(r.Entite), txt(r['Code produit'])).evenements += valeur;
      res.nbEvenements++;
    });
    Store.read(ctx.idSortie, 'AJUSTEMENTS_SEMAINE').rows.forEach(function (r) {
      if (norm(r.Type) !== 'CORRECTION' || norm(r.Statut) !== 'ACTIF' || !txt(r['Code produit']) || !txt(r.Entite)) return;
      var q = nombre(r.Quantite), p = nombre(r.Pourcent);
      var valeur = !isNaN(q) ? q : (!isNaN(p) ? statDe(r.Entite, txt(r['Code produit'])) * p / 100 : 0);
      fiche(txt(r.Entite), txt(r['Code produit'])).correction += valeur;
      res.nbCorrections++;
    });

    var entites = {};
    Object.keys(base).forEach(function (k) { entites[base[k].entite] = true; });
    Params.table('SUBSTITUTIONS').forEach(function (r) {
      var ancien = txt(r['Code ancien']);
      if (!yes(r.Actif) || !ancien) return;
      var portee = norm(r.Portee);
      if (portee && portee !== 'PREVISION' && portee !== 'LES_DEUX') return;
      var debut = annee(r['Date effet']), fin = annee(r['Date fin']);
      if (anneePrevue && ((debut && debut > anneePrevue) || (fin && fin < anneePrevue))) return;
      var taux = txt(r['Taux de report']) === '' ? 100 : nombre(r['Taux de report']);
      if (isNaN(taux) || taux <= 0 || taux > 100) {
        res.avertissements.push('Substitution ' + txt(r['ID substitution']) + ' ignorée : taux de report invalide (' + txt(r['Taux de report']) + ').');
        return;
      }
      var nouveau = txt(r['Code nouveau']);
      var cibles = txt(r.Entite) ? [txt(r.Entite)] : Object.keys(entites);
      var appliquee = false;
      cibles.forEach(function (e) {
        var b = base[cle(e, ancien)];
        if (!b || !(b.stat > 0)) return;
        var transfert = b.stat * taux / 100;
        fiche(b.entite, ancien).substitution -= transfert;
        if (nouveau) fiche(b.entite, nouveau).substitution += transfert;
        appliquee = true;
      });
      if (appliquee) res.nbSubstitutions++;
      else res.avertissements.push('Substitution ' + txt(r['ID substitution']) + ' : l\'article ' + ancien + ' n\'a pas de prévision statistique, rien à reporter.');
    });
    return res;
  }

  return { creer: creer, annuler: annuler, lister: lister, effets: effets, preparerCorrections: preparerCorrections, remplacerCorrections: remplacerCorrections, TYPES_EVENEMENT: TYPES_EVENEMENT };
})();
