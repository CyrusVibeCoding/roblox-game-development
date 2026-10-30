(function () {
  var config = window.APP_CONFIG || {};
  var endpoint = "https://games.roblox.com/v1/games?universeIds=" +
    encodeURIComponent(config.ROBLOX_UNIVERSE_ID || "");
  var visitsPromise;

  window.getGameVisits = function () {
    if (visitsPromise) return visitsPromise;

    visitsPromise = fetch(endpoint, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Roblox stats request failed (" + response.status + ")");
        return response.json();
      })
      .then(function (payload) {
        var visits = payload && payload.data && payload.data[0] && payload.data[0].visits;
        if (!Number.isFinite(visits)) throw new Error("Roblox stats response did not include visits");
        return visits;
      })
      .catch(function (error) {
        console.warn("Using fallback game visits:", error.message);
        return Number(config.FALLBACK_VISITS) || 0;
      });

    return visitsPromise;
  };
})();
