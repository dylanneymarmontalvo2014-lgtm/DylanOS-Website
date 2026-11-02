(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DylanReleaseCatalogue = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var EMPTY_TITLE = 'No hay ISOs disponibles';
  var EMPTY_DESCRIPTION = 'Todavía no existe una versión publicada en este canal.';

  function splitChannel(rows) {
    var visible = (rows || []).filter(function (row) { return row && (row.status === 'published' || row.status === 'retired'); });
    var active = visible.find(function (row) { return row.status === 'published'; }) || null;
    var history = visible.filter(function (row) { return row.status === 'retired'; }).sort(function (a, b) {
      return new Date(b.published_at || 0) - new Date(a.published_at || 0);
    });
    return { active: active, history: history };
  }

  function downloadUrl(release, config) {
    if (!release || !release.file_path) return null;
    var rawPath = String(release.file_path);
    var segments = rawPath.split('/');
    var safe = rawPath.length <= 300 && !rawPath.startsWith('/') && !rawPath.includes('\\') && !/[^\x20-\x7e]/.test(rawPath)
      && segments.every(function (segment) {
        return Boolean(segment) && segment !== '.' && segment !== '..' && !/^[ .]/.test(segment)
          && !/ $/.test(segment) && /^[0-9A-Za-z _+.,=@!()[\]~\-]+$/.test(segment);
      });
    if (!safe) return null;
    var path = segments.map(encodeURIComponent).join('/');
    if (release.storage_provider === 'sourceforge') {
      if (!/\.iso$/i.test(rawPath)) return null;
      var sourceforgeBase = config && config.sourceforge_download_base;
      if (!sourceforgeBase && config && /^[a-z0-9][a-z0-9-]{1,62}$/.test(String(config.sourceforge_project || ''))) {
        sourceforgeBase = 'https://sourceforge.net/projects/' + encodeURIComponent(config.sourceforge_project) + '/files';
      }
      return sourceforgeBase ? String(sourceforgeBase).replace(/\/+$/, '') + '/' + path + '/download' : null;
    }
    if (release.storage_provider === 'r2') {
      var base = config && config.r2_public_base;
      return base ? String(base).replace(/\/+$/, '') + '/' + path : null;
    }
    if (config && config.supabase && config.bucket) {
      return String(config.supabase.url).replace(/\/+$/, '') + '/storage/v1/object/public/' + encodeURIComponent(config.bucket) + '/' + path;
    }
    return null;
  }

  return { EMPTY_TITLE: EMPTY_TITLE, EMPTY_DESCRIPTION: EMPTY_DESCRIPTION, splitChannel: splitChannel, downloadUrl: downloadUrl };
}));
