// Trace des modifications (JOURNAL) et reçus d'opération (OPERATIONS) pour rejouer un appel sans doublon.

var Journal = {
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
    Store.append(idSortie, 'OPERATIONS', [{
      'ID operation': id,
      'Auteur': acteur.email,
      'Horodatage': maintenant(),
      'Lignes': 1,
      'Resultat': JSON.stringify(resultat)
    }]);
    return { rejoue: false, resultat: resultat };
  }
};
