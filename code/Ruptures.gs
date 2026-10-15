// Ruptures : lire la demande et le réel en parallèle.
//
// Une rupture ne supprime pas la demande : la vue DEMANDE garde la prévision retenue, la vue REEL retire les ventes
// qui ne peuvent pas se faire pendant la rupture. Chaque rupture (onglet RUPTURES de SORTIE_SOP) dit comment les ventes non
// réalisées sont traitées :
//  - PERDUES      : elles disparaissent du réel ;
//  - REPORTEES    : un taux (%) revient à la semaine de retour, le reste est perdu ;
//  - SUBSTITUEES  : un taux (%) passe sur l'article substitut, les mêmes semaines, le reste est perdu.
// Au niveau du PAC, la demande est répartie par semaine avec le cadençage ; sans cadençage il n'y a pas de réel calculable.

var Ruptures = (function () {
  var TRAITEMENTS = ['PERDUES', 'REPORTEES', 'SUBSTITUEES'];
  var CAUSES = ['APPRO_FOURNISSEUR', 'REGLEMENTAIRE', 'QUALITE', 'AUTRE'];
  var ORIGINES = ['CONSTATEE', 'PREVUE', 'PROPOSEE'];
  var RE_SEMAINE = /^\d{4}-S\d{2}$/;

  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var t = txt(v).replace(/[\s ]/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  function cle(entite, code) { return norm(entite) + '|' + txt(code); }
  function arr(x) { return Math.round(x * 1000) / 1000; }

  function exigerDroit(acteur) {
    Auth.requireCap(acteur, 'correctionPrevision');
    if (!Auth.inScope(acteur, 'correctionPrevision', {})) throw new AppError('CAPACITE_REFUSEE', 'Une rupture porte sur un article de toute la campagne : elle demande un périmètre global.');
    Auth.requireWritable(acteur);
  }

  function suivant(rows) {
    var max = rows.reduce(function (m, r) { var x = /(\d+)$/.exec(txt(r['ID rupture'])); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
    var n = String(max); while (n.length < 4) n = '0' + n;
    return 'RUP' + n;
  }

  function vue(r) {
    return {
      id: txt(r['ID rupture']), code: txt(r['Code produit']), entite: txt(r.Entite), debut: txt(r['Semaine debut']), fin: txt(r['Semaine fin']),
      origine: norm(r.Origine), cause: norm(r.Cause), traitement: norm(r['Traitement ventes']),
      taux: txt(r['Taux report']) === '' ? null : Number(r['Taux report']), retour: txt(r['Semaine retour']), substitut: txt(r['Code produit substitut']),
      statut: norm(r.Statut), commentaire: txt(r.Commentaire), par: txt(r['Cree par']), le: txt(r['Cree le'])
    };
  }

  function actives(ctx) {
    return Store.read(ctx.idSortie, 'RUPTURES').rows.filter(function (r) { return norm(r.Statut) === 'ACTIVE' && txt(r['Code produit']) && txt(r.Entite); }).map(vue);
  }

  function lister(acteur) {
    Auth.requireCap(acteur, 'consultation');
    var ctx = Versions.contexte(acteur);
    var autorise = Histo.filtre(acteur);
    return actives(ctx).filter(function (r) { return autorise(r.entite, '', r.code); });
  }

  // entree : { entite, code, debut, fin, origine, cause, traitement, taux, retour, substitut, commentaire }
  function creer(acteur, entree, idOperation) {
    entree = entree || {};
    exigerDroit(acteur);
    var ctx = Versions.contexte(acteur);
    var code = txt(entree.code);
    if (!code) throw new AppError('CODE_OBLIGATOIRE', 'Le code produit est obligatoire.');
    var entite = Ajustements.nomEntite(entree.entite);
    if (!entite) throw new AppError('ENTITE_INCONNUE', 'Entité inconnue : choisissez une entité de l\'historique.');
    var debut = txt(entree.debut), fin = txt(entree.fin);
    if (!RE_SEMAINE.test(debut)) throw new AppError('SEMAINE_INVALIDE', 'La semaine de début se saisit au format AAAA-Sss, par exemple 2027-S07.');
    if (fin && !RE_SEMAINE.test(fin)) throw new AppError('SEMAINE_INVALIDE', 'La semaine de fin se saisit au format AAAA-Sss.');
    if (fin && fin < debut) throw new AppError('SEMAINE_INVALIDE', 'La semaine de fin précède la semaine de début.');
    var origine = norm(entree.origine) || 'CONSTATEE', cause = norm(entree.cause) || 'AUTRE', traitement = norm(entree.traitement) || 'PERDUES';
    if (ORIGINES.indexOf(origine) < 0) throw new AppError('TYPE_INVALIDE', 'Origine inconnue : ' + txt(entree.origine) + '.');
    if (CAUSES.indexOf(cause) < 0) throw new AppError('TYPE_INVALIDE', 'Cause inconnue : ' + txt(entree.cause) + '.');
    if (TRAITEMENTS.indexOf(traitement) < 0) throw new AppError('TYPE_INVALIDE', 'Traitement des ventes inconnu : ' + txt(entree.traitement) + '.');
    var taux = '', retour = '', substitut = '';
    if (traitement !== 'PERDUES') {
      var t = txt(entree.taux) === '' ? NaN : nombre(entree.taux);
      if (isNaN(t) || t <= 0 || t > 100) throw new AppError('TAUX_INVALIDE', 'Le taux de report est un pourcentage entre 0 (exclu) et 100.');
      taux = t;
      if (traitement === 'REPORTEES') {
        retour = txt(entree.retour);
        if (!RE_SEMAINE.test(retour)) throw new AppError('SEMAINE_INVALIDE', 'La semaine de retour des ventes se saisit au format AAAA-Sss.');
        if (retour <= (fin || debut)) throw new AppError('SEMAINE_INVALIDE', 'La semaine de retour doit suivre la rupture.');
      } else {
        substitut = txt(entree.substitut);
        if (!substitut) throw new AppError('CODE_OBLIGATOIRE', 'Le code de l\'article substitut est obligatoire.');
        if (substitut === code) throw new AppError('SUBSTITUTION_INVALIDE', 'Le substitut doit être un autre article.');
      }
    }
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var id = suivant(Store.read(ctx.idSortie, 'RUPTURES').rows);
        Store.append(ctx.idSortie, 'RUPTURES', [{
          'ID rupture': id, 'Code produit': code, 'Entite': entite, 'Plateforme': '*', 'Semaine debut': debut, 'Semaine fin': fin,
          'Origine': origine, 'Cause': cause, 'Traitement ventes': traitement, 'Taux report': taux, 'Semaine retour': retour, 'Code produit substitut': substitut,
          'Statut': 'ACTIVE', 'Commentaire': txt(entree.commentaire), 'Cree par': acteur.email, 'Cree le': maintenant()
        }]);
        Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_CREE', id, '', 'RUPTURE ' + traitement, txt(entree.commentaire) || cause, idOperation);
        return { id: id };
      });
    });
  }

  function annuler(acteur, id, idOperation) {
    exigerDroit(acteur);
    var ctx = Versions.contexte(acteur);
    return sousVerrou(function () {
      return Operations.run(ctx.idSortie, acteur, idOperation, function () {
        var ligne = Store.read(ctx.idSortie, 'RUPTURES').rows.filter(function (r) { return txt(r['ID rupture']) === txt(id); })[0];
        if (!ligne) throw new AppError('AJUSTEMENT_INCONNU', 'Rupture ' + txt(id) + ' introuvable.');
        if (norm(ligne.Statut) !== 'ACTIVE') throw new AppError('DEJA_ANNULE', 'La rupture ' + txt(id) + ' est déjà annulée ou clôturée.');
        Store.updateRow(ctx.idSortie, 'RUPTURES', ligne._row, { 'Statut': 'ANNULEE' });
        Journal.log(ctx.idSortie, acteur, 'AJUSTEMENT_ANNULE', txt(id), 'ACTIVE', 'ANNULEE', 'RUPTURE', idOperation);
        return { id: txt(id) };
      });
    });
  }

  // Applique les ruptures actives à une demande hebdomadaire.
  // demande : { 'ENTITE|code': { 'AAAA-Sss': quantité } } ; renvoie { reel: même forme, perdu: { clé: total perdu }, touche: { clé: true } }.
  // Les ventes reportées ou substituées qui arrivent sur un article sans demande créent une entrée de réel (demande 0).
  function appliquer(acteur, demande) {
    var ctx = Versions.contexte(acteur);
    var liste = actives(ctx);
    var reel = {}, perdu = {}, touche = {};
    Object.keys(demande).forEach(function (k) { reel[k] = {}; Object.keys(demande[k]).forEach(function (s) { reel[k][s] = demande[k][s]; }); });
    var ajouter = function (k, semaine, q) { reel[k] = reel[k] || {}; reel[k][semaine] = arr((reel[k][semaine] || 0) + q); };
    liste.forEach(function (r) {
      var k = cle(r.entite, r.code);
      var d = demande[k];
      if (!d) return;
      var semaines = Object.keys(d).filter(function (s) { return s >= r.debut && (!r.fin || s <= r.fin); }).sort();
      if (!semaines.length) return;
      var manque = 0;
      semaines.forEach(function (s) { manque += reel[k][s] || 0; reel[k][s] = 0; });
      touche[k] = true;
      perdu[k] = arr((perdu[k] || 0) + manque);
      if (r.traitement === 'REPORTEES') {
        var rendu = manque * r.taux / 100;
        ajouter(k, r.retour, rendu);
        perdu[k] = arr(perdu[k] - rendu);
      } else if (r.traitement === 'SUBSTITUEES') {
        var ks = cle(r.entite, r.substitut);
        semaines.forEach(function (s) { ajouter(ks, s, (d[s] || 0) * r.taux / 100); });
        perdu[k] = arr(perdu[k] - manque * r.taux / 100);
        touche[ks] = true;
      }
    });
    Object.keys(reel).forEach(function (k) { Object.keys(reel[k]).forEach(function (s) { reel[k][s] = arr(reel[k][s]); }); });
    return { reel: reel, perdu: perdu, touche: touche };
  }

  return { lister: lister, creer: creer, annuler: annuler, appliquer: appliquer, actives: actives, TRAITEMENTS: TRAITEMENTS, CAUSES: CAUSES };
})();
