// Trace des modifications (JOURNAL) et reçus d'opération (OPERATIONS) pour rejouer un appel sans doublon.

var Journal = {
  // Dernières entrées du journal, la plus récente d'abord. Réservé à la configuration et à l'arbitrage.
  lire: function (acteur, limite) {
    if (!acteur.caps.configuration && !acteur.caps.arbitrage) throw new AppError('CAPACITE_REFUSEE', 'Votre rôle ne permet pas de lire le journal.');
    var rows = Store.read(Params.idSortie(acteur.campagne), 'JOURNAL').rows;
    return rows.slice(-Math.max(1, Math.min(Number(limite) || 200, 1000))).reverse().map(function (r) {
      return { le: txt(r.Horodatage), par: txt(r.Auteur), action: txt(r.Action), objet: txt(r.Objet), avant: txt(r['Ancienne valeur']), apres: txt(r['Nouvelle valeur']), motif: txt(r.Motif) };
    });
  },

  log: function (idSortie, acteur, action, objet, avant, apres, motif, idOperation) {
    Store.append(idSortie, 'JOURNAL', [{
      'Horodatage': maintenant(),
      'Auteur': acteur.email,
      'Action': action,
      'Objet': objet,
      'Ancienne valeur': avant === undefined ? '' : avant,
      'Nouvelle valeur': apres === undefined ? '' : apres,
      'Motif': motif || '',
      'ID operation': idOperation || ''
    }]);
  }
};

var Operations = {
  // Exécute fn une seule fois par identifiant d'opération. Un second appel renvoie le résultat enregistré.
  run: function (idSortie, acteur, idOperation, fn) {
    var id = txt(idOperation);
    if (!id) throw new AppError('OPERATION_SANS_ID', 'Identifiant d\'opération manquant.');
    var existant = Store.read(idSortie, 'OPERATIONS').rows.filter(function (r) { return txt(r['ID operation']) === id; })[0];
    if (existant) {
      if (txt(existant.Auteur).toLowerCase() !== acteur.email) {
        throw new AppError('OPERATION_CONFLIT', 'Cet identifiant d\'opération appartient à un autre utilisateur.');
      }
      return { rejoue: true, resultat: JSON.parse(txt(existant.Resultat) || 'null') };
    }
    var resultat = fn();
    // Une cellule Sheets tient 50 000 caractères : au-delà, le reçu ne garde que les valeurs simples.
    var json = JSON.stringify(resultat);
    if (json && json.length > 40000 && resultat && typeof resultat === 'object') {
      var court = { tronque: true };
      Object.keys(resultat).forEach(function (k) { var v = resultat[k]; if (v === null || typeof v !== 'object') court[k] = v; });
      json = JSON.stringify(court);
    }
    Store.append(idSortie, 'OPERATIONS', [{
      'ID operation': id,
      'Auteur': acteur.email,
      'Horodatage': maintenant(),
      'Lignes': 1,
      'Resultat': json
    }]);
    return { rejoue: false, resultat: resultat };
  }
};
