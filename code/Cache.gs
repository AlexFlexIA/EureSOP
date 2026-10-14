// Cache JSON partagé (CacheService, 10 minutes) pour les lectures lourdes de fichiers externes.
// Une valeur est découpée en entrées de moins de 100 Ko. Le cache est facultatif : toute erreur revient à relire les fichiers.
// La clé contient une version : « actualiser » la change, ce qui invalide tout d'un coup.

var Cache = (function () {
  var TTL = 600;
  var MORCEAU = 40000; // caractères par entrée (limite de 100 Ko par entrée, accents sur deux octets)

  function version() { return txt(PropertiesService.getScriptProperties().getProperty('SOP_CACHE_VERSION')) || '0'; }

  function empreinte(texte) {
    var h = 5381;
    for (var i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function cle(prefixe, signature) { return prefixe + ':' + version() + ':' + empreinte(signature); }

  function lire(k) {
    try {
      var cache = CacheService.getScriptCache();
      var n = Number(cache.get(k + ':n'));
      if (!n) return null;
      var cles = []; for (var i = 0; i < n; i++) cles.push(k + ':' + i);
      var morceaux = cache.getAll(cles), texte = '';
      for (var j = 0; j < n; j++) {
        var m = morceaux[k + ':' + j];
        if (m === undefined || m === null) return null;
        texte += m;
      }
      return JSON.parse(texte);
    } catch (e) { return null; }
  }

  function ecrire(k, valeur) {
    try {
      var texte = JSON.stringify(valeur), cache = CacheService.getScriptCache(), n = Math.ceil(texte.length / MORCEAU), lot = {};
      for (var i = 0; i < n; i++) lot[k + ':' + i] = texte.slice(i * MORCEAU, (i + 1) * MORCEAU);
      lot[k + ':n'] = String(n);
      cache.putAll(lot, TTL);
    } catch (e) { /* facultatif */ }
  }

  // Force la relecture de tous les fichiers externes au prochain appel.
  function actualiser() {
    PropertiesService.getScriptProperties().setProperty('SOP_CACHE_VERSION', String(Date.now()));
    return { version: version() };
  }

  return { cle: cle, lire: lire, ecrire: ecrire, actualiser: actualiser };
})();
