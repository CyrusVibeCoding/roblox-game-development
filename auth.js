// Shared Supabase client + helpers.
(function () {
  var client = null;
  window.getSupabase = function () {
    if (client) return client;
    var c = window.APP_CONFIG;
    client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    return client;
  };

  var COLORS = ["#2dc76a", "#e8833a", "#4a7bd8", "#c4478f", "#8a63d2"];
  window.colorFor = function (str) {
    var h = 0;
    for (var i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  window.initials = function (name) {
    return (name || "?").trim().split(/\s+/).map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  };
  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
})();
