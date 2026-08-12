(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sailingSection = document.querySelector(".installation--sailing");
  const sailingBackdrop = document.querySelector(".sailing-work");
  const terminal = document.querySelector("[data-kashicode-work]");
  const terminalFrame = terminal?.querySelector("iframe[data-demo-src]");
  const maestroSection = document.querySelector(".installation--maestro");
  const maestroVideo = document.querySelector("[data-maestro-video]");
  let sailingVisible = false;
  let maestroVisible = false;
  let scrollFrame = 0;

  function syncIntroLabels() {
    const revealLimit = sailingSection
      ? Math.max(8, sailingSection.offsetHeight - window.innerHeight + 2)
      : 8;
    sailingSection?.classList.toggle(
      "has-intro-labels",
      window.scrollY > 4 && window.scrollY < revealLimit,
    );
    scrollFrame = 0;
  }

  function requestIntroSync() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(syncIntroLabels);
  }

  function syncSailingMotion() {
    sailingBackdrop?.toggleAttribute(
      "paused",
      reduceMotion.matches || document.hidden || !sailingVisible,
    );
  }

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
        if (entry.target === sailingSection) {
          sailingVisible = entry.isIntersecting;
          syncSailingMotion();
        }
        if (entry.target === maestroSection) {
          maestroVisible = entry.isIntersecting;
          syncMaestroMotion();
        }
        if (entry.target === terminal && entry.isIntersecting) loadTerminal();
      }
    },
    { rootMargin: "20% 0px", threshold: 0.05 },
  );

  if (sailingSection) sectionObserver.observe(sailingSection);
  if (maestroSection) sectionObserver.observe(maestroSection);
  if (terminal) sectionObserver.observe(terminal);

  reduceMotion.addEventListener("change", () => {
    syncSailingMotion();
    syncMaestroMotion();
    if (!reduceMotion.matches) loadTerminal();
  });

  document.addEventListener("visibilitychange", () => {
    syncSailingMotion();
    syncMaestroMotion();
  });

  window.addEventListener("scroll", requestIntroSync, { passive: true });

  syncIntroLabels();
  syncSailingMotion();
  syncMaestroMotion();
})();
