/**
 * htmlv theme loader — skins live under themes/*.css and are optional.
 *
 * Enable / switch:
 *   ?theme=omarchy   (default)
 *   ?theme=off
 * Persist: localStorage key "htmlv-theme"
 * Toggle: press T (when not typing in an input)
 */
(function () {
  var KEY = 'htmlv-theme';
  var DEFAULT = 'omarchy';
  var params = new URLSearchParams(location.search);
  var theme = params.get('theme');
  if (theme === null || theme === '') {
    try {
      theme = localStorage.getItem(KEY);
    } catch (_) {
      theme = null;
    }
  }
  if (theme === null || theme === '') theme = DEFAULT;
  if (theme === 'none' || theme === '0' || theme === 'false') theme = 'off';

  function apply(name) {
    var root = document.documentElement;
    root.dataset.theme = name;
    var link = document.getElementById('htmlv-theme-css');
    if (name === 'off') {
      if (link) link.remove();
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = name;
      var href = 'themes/' + name + '.css';
      if (link) {
        link.href = href;
      } else {
        link = document.createElement('link');
        link.id = 'htmlv-theme-css';
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      }
    }
    try {
      localStorage.setItem(KEY, name);
    } catch (_) {}
  }

  apply(theme);

  window.__HTMLV_THEME__ = {
    get: function () {
      return document.documentElement.dataset.theme || 'off';
    },
    set: apply,
    toggle: function () {
      var cur = document.documentElement.dataset.theme || 'off';
      apply(cur === 'off' ? DEFAULT : 'off');
    },
  };

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') {
      window.__HTMLV_THEME__.toggle();
    }
  });
})();
