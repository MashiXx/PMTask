(function () {
  var data = window.__I18N__ || { lang: 'en', dict: {} };

  window.t = function (key, vars) {
    var str = data.dict[key];
    if (str === undefined) str = key;
    if (vars) {
      str = str.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
      });
    }
    return str;
  };

  window.currentLang = data.lang;

  window.setLanguage = function (lang) {
    fetch('/profile/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    })
      .then(function (r) { if (r.ok) location.reload(); })
      .catch(function () {});
  };
})();
