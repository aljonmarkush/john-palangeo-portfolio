  /* state classes live here so the page still opens if the main script fails */
  (function () {
    var d = document.documentElement;
    d.classList.add("js", "loading");
    window.__done = function () { d.classList.remove("loading"); d.classList.add("ready"); };
    var rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (rm) window.__done(); else setTimeout(window.__done, 6500);
  })();
