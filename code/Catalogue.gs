// Catalogue des produits : libellé, marché, famille, segment, unité de stock.
// Il vient de la sortie EurePrev déclarée en source PREV_TC (même lecture, même cache que la saisie des TC).
// Sans cette source, le catalogue est vide et l'application fonctionne sans marché ni unité.

var Catalogue = (function () {
  // { code: { libelle, marche, famille, segment, unite } }
  function lire(acteur) {
    try {
      var t = PrevTC.lire(acteur);
      return t && t.catalogue ? t.catalogue : {};
    } catch (e) {
      if (e && e.code) return {};
      throw e;
    }
  }

  function marches(catalogue) {
    var vus = {};
    Object.keys(catalogue).forEach(function (c) { if (catalogue[c].marche) vus[catalogue[c].marche] = true; });
    return Object.keys(vus).sort();
  }

  // Tonnes d'une quantité : seules les unités en KG se convertissent sans poids d'article.
  function tonnes(quantite, unite) {
    return norm(unite) === 'KG' ? Math.round(quantite / 1000 * 1000) / 1000 : '';
  }

  return { lire: lire, marches: marches, tonnes: tonnes };
})();
