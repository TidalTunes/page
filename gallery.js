(() => {
  const previews = document.querySelectorAll("[data-dialog]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sailingBackdrop = document.querySelector(".sailing-background");
  const closeDelay = 240;

  function syncBackdropMotion() {
    sailingBackdrop?.toggleAttribute("paused", reduceMotion.matches || document.hidden);
  }

  syncBackdropMotion();
  reduceMotion.addEventListener("change", syncBackdropMotion);
  document.addEventListener("visibilitychange", syncBackdropMotion);

  function setOrigin(dialog, preview) {
    const rect = preview.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dialog.style.setProperty("--origin-x", `${(centerX / window.innerWidth) * 100}%`);
    dialog.style.setProperty("--origin-y", `${(centerY / window.innerHeight) * 100}%`);
  }

  function launchEmbeddedDemo(dialog) {
    const frame = dialog.querySelector("iframe[data-demo-src]");
    if (!frame || frame.hasAttribute("src")) return;

    const art = frame.closest(".project-art");
    frame.addEventListener("load", () => art?.classList.add("is-loaded"), { once: true });
    frame.setAttribute("src", frame.dataset.demoSrc);
  }

  function playProjectMedia(dialog) {
    const video = dialog.querySelector("[data-project-video]");
    if (!video || reduceMotion.matches) return;
    video.play().catch(() => {});
  }

  function stopProjectMedia(dialog) {
    const video = dialog.querySelector("[data-project-video]");
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }

  function finishClose(dialog) {
    const preview = document.querySelector(`[data-dialog="${dialog.id}"]`);
    stopProjectMedia(dialog);
    dialog.close();
    dialog.removeAttribute("data-closing");
    if (preview) preview.setAttribute("aria-expanded", "false");
  }

  function closeDialog(dialog) {
    if (!dialog.open || dialog.hasAttribute("data-closing")) return;
    dialog.setAttribute("data-closing", "");
    dialog.classList.remove("is-ready");
    if (reduceMotion.matches) {
      finishClose(dialog);
      return;
    }
    window.setTimeout(() => finishClose(dialog), closeDelay);
  }

  for (const preview of previews) {
    const dialog = document.querySelector(`#${preview.dataset.dialog}`);
    if (!dialog) continue;

    preview.addEventListener("click", () => {
      launchEmbeddedDemo(dialog);
      setOrigin(dialog, preview);
      preview.setAttribute("aria-expanded", "true");
      dialog.showModal();
      playProjectMedia(dialog);
      window.requestAnimationFrame(() => dialog.classList.add("is-ready"));
    });

    dialog.querySelector("[data-close]")?.addEventListener("click", () => closeDialog(dialog));

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener("close", () => {
      stopProjectMedia(dialog);
      dialog.classList.remove("is-ready");
      dialog.removeAttribute("data-closing");
      preview.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openDialog = document.querySelector(".project-dialog[open]");
    if (!openDialog) return;
    event.preventDefault();
    closeDialog(openDialog);
  });
})();
