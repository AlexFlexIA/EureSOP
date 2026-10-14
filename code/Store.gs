// Accès aux Google Sheets : lecture en objets, ajout de lignes, mise à jour de cellules.
// Les lectures sont mémorisées pendant une exécution et invalidées à chaque écriture.

var Store = (function () {
  var books = {};
  var memo = {};

  function cle(id, tab) { return id + '|' + tab; }

  function sheet(id, tab) {
    if (!books[id]) {
      try {
        books[id] = SpreadsheetApp.openById(id);
      } catch (e) {
        throw new AppError('CLASSEUR_INACCESSIBLE', 'Impossible d\'ouvrir le classeur ' + id + '. Vérifiez l\'ID et que le compte qui déploie y a accès.');
      }
    }
    var sh = books[id].getSheetByName(tab);
    if (!sh) throw new AppError('ONGLET_ABSENT', 'Onglet ' + tab + ' absent du classeur.');
    return sh;
  }

  function typeDe(tab, entete) {
    var groupes = Object.keys(SOP_STRUCTURE);
    for (var g = 0; g < groupes.length; g++) {
      var cols = SOP_STRUCTURE[groupes[g]][tab];
      if (cols) {
        var i = cols.indexOf(entete);
        return i < 0 ? '' : SOP_TYPES[groupes[g]][tab][i];
      }
    }
    return '';
  }

  function textuel(tab, entete) {
    var t = typeDe(tab, entete);
    return t === 'TEXTE' || t === 'DATE';
  }

  function read(id, tab) {
    var k = cle(id, tab);
    if (memo[k]) return memo[k];
    var sh = sheet(id, tab);
    var nc = sh.getLastColumn();
    var nr = sh.getLastRow();
    if (!nc || !nr) return (memo[k] = { headers: [], rows: [] });
    var values = sh.getRange(1, 1, nr, nc).getValues();
    var headers = values[0].map(txt);
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var vide = values[i].every(function (v) { return v === '' || v === null; });
      if (vide) continue;
      var o = { _row: i + 1 };
      for (var j = 0; j < headers.length; j++) if (headers[j]) o[headers[j]] = values[i][j];
      rows.push(o);
    }
    return (memo[k] = { headers: headers, rows: rows });
  }

  function invalider(id, tab) { delete memo[cle(id, tab)]; }

  // En-têtes seuls (ligne 1) : évite de relire tout l'onglet avant chaque écriture.
  function entetes(id, tab) {
    var k = cle(id, tab);
    if (memo[k]) return memo[k].headers;
    var sh = sheet(id, tab);
    var nc = sh.getLastColumn();
    return nc ? sh.getRange(1, 1, 1, nc).getValues()[0].map(txt) : [];
  }

  // Oublie classeurs et lectures mémorisées. Apps Script le fait de lui-même à chaque exécution ; les tests s'en servent.
  function reset() { books = {}; memo = {}; }

  // Ajoute des lignes à la suite. Les colonnes inconnues sont refusées pour attraper les fautes de frappe.
  function append(id, tab, objets) {
    if (!objets.length) return;
    var sh = sheet(id, tab);
    var headers = entetes(id, tab);
    var lignes = objets.map(function (o) {
      Object.keys(o).forEach(function (k) {
        if (headers.indexOf(k) < 0) throw new AppError('COLONNE_INCONNUE', tab + ' : colonne « ' + k + ' » inconnue.');
      });
      return headers.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
    });
    var debut = sh.getLastRow() + 1;
    // Sheets refuse d'écrire hors de la grille : on l'agrandit avant.
    if (typeof sh.getMaxRows === 'function') {
      var manque = debut + lignes.length - 1 - sh.getMaxRows();
      if (manque > 0) sh.insertRowsAfter(sh.getMaxRows(), manque);
    }
    headers.forEach(function (h, c) {
      if (textuel(tab, h)) sh.getRange(debut, c + 1, lignes.length, 1).setNumberFormat('@');
    });
    sh.getRange(debut, 1, lignes.length, headers.length).setValues(lignes);
    invalider(id, tab);
  }

  // Taille d'un onglet sans lire son contenu : { lignes, colonnes }. Lance ONGLET_ABSENT ou CLASSEUR_INACCESSIBLE.
  function apercu(id, tab) {
    var sh = sheet(id, tab);
    return { lignes: Math.max(0, sh.getLastRow() - 1), colonnes: sh.getLastColumn() };
  }

  // Efface toutes les lignes de données, l'en-tête est conservé.
  function viderDonnees(id, tab) {
    var sh = sheet(id, tab);
    var nr = sh.getLastRow();
    if (nr > 1) sh.getRange(2, 1, nr - 1, Math.max(sh.getLastColumn(), 1)).clearContent();
    invalider(id, tab);
  }

  // Met à jour des cellules d'une ligne déjà lue (numéro de ligne dans _row).
  function updateRow(id, tab, ligne, valeurs) {
    var sh = sheet(id, tab);
    var headers = entetes(id, tab);
    Object.keys(valeurs).forEach(function (k) {
      var c = headers.indexOf(k);
      if (c < 0) throw new AppError('COLONNE_INCONNUE', tab + ' : colonne « ' + k + ' » inconnue.');
      var cell = sh.getRange(ligne, c + 1);
      if (textuel(tab, k)) cell.setNumberFormat('@');
      cell.setValue(valeurs[k]);
    });
    invalider(id, tab);
  }

  // Compare les en-têtes réels à ceux de la structure attendue.
  function checkHeaders(id, tab, attendus) {
    var sh = sheet(id, tab);
    var nc = sh.getLastColumn();
    var reels = nc ? sh.getRange(1, 1, 1, nc).getValues()[0].map(txt).filter(function (h) { return h !== ''; }) : [];
    var manquants = attendus.filter(function (h) { return reels.indexOf(h) < 0; });
    var inconnus = reels.filter(function (h) { return attendus.indexOf(h) < 0; });
    var ordre = manquants.length === 0 && inconnus.length === 0 && reels.join('|') !== attendus.join('|');
    return { ok: manquants.length === 0 && inconnus.length === 0, manquants: manquants, inconnus: inconnus, ordre: ordre };
  }

  return { reset: reset, read: read, append: append, apercu: apercu, viderDonnees: viderDonnees, updateRow: updateRow, checkHeaders: checkHeaders, invalider: invalider };
})();
