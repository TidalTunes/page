(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const terminal = document.querySelector("[data-kashicode-work]");
  const terminalFrame = terminal?.querySelector("iframe[data-demo-src]");
  const maestroSection = document.querySelector(".installation--maestro");
  const maestroVideo = document.querySelector("[data-maestro-video]");
  let maestroVisible = false;

  function syncMaestroMotion() {
    if (!maestroVideo) return;
    if (reduceMotion.matches || document.hidden || !maestroVisible) {
      maestroVideo.pause();
      return;
    }
    maestroVideo.play().catch(() => {});
  }

  function loadTerminal() {
    if (!terminalFrame || terminalFrame.hasAttribute("src") || reduceMotion.matches) return;
    terminalFrame.addEventListener("load", () => terminal?.classList.add("is-loaded"), {
      once: true,
    });
    terminalFrame.setAttribute("src", terminalFrame.dataset.demoSrc);
  }

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === maestroSection) {
          maestroVisible = entry.isIntersecting;
          syncMaestroMotion();
        }
        if (entry.target === terminal && entry.isIntersecting) loadTerminal();
      }
    },
    { rootMargin: "20% 0px", threshold: 0.05 },
  );

  if (maestroSection) sectionObserver.observe(maestroSection);
  if (terminal) sectionObserver.observe(terminal);

  reduceMotion.addEventListener("change", () => {
    syncMaestroMotion();
    if (!reduceMotion.matches) loadTerminal();
  });

  document.addEventListener("visibilitychange", () => {
    syncMaestroMotion();
  });

  syncMaestroMotion();
})();
