(() => {
  const canvas = document.querySelector(".field-canvas");
  const installation = document.querySelector(".backdrop-project");
  const header = document.querySelector(".site-header");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!canvas || !installation || reduceMotion.matches) return;

  const context = canvas.getContext("2d", { alpha: false });
  const pointer = { x: 0, y: 0, active: false };
  const particles = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let isVisible = true;
  let animationId = 0;

  const colors = {
    paper: "oklch(96.8% 0.012 88)",
    wash: "oklch(96.8% 0.012 88 / 0.075)",
    graphite: "oklch(38% 0.025 253 / 0.2)",
    blue: "oklch(48% 0.18 259 / 0.42)",
  };

  function resetParticle(particle, randomizeAge = true) {
    particle.x = Math.random() * width;
    particle.y = Math.random() * height;
    particle.age = randomizeAge ? Math.random() * particle.life : 0;
    particle.speed = 0.45 + Math.random() * 0.65;
    particle.blue = Math.random() < 0.08;
  }

  function resize() {
    const rect = installation.getBoundingClientRect();
    const headerHeight = header ? header.getBoundingClientRect().height : 56;
    width = Math.max(320, rect.width);
    height = Math.max(420, rect.height - headerHeight);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);

    const targetCount = Math.min(760, Math.max(260, Math.round((width * height) / 2600)));
    particles.length = 0;
    for (let index = 0; index < targetCount; index += 1) {
      const particle = { x: 0, y: 0, age: 0, life: 130 + Math.random() * 260, speed: 1, blue: false };
      resetParticle(particle);
      particles.push(particle);
    }
  }

  function angleAt(x, y, time) {
    const nx = x / Math.max(width, 1) - 0.5;
    const ny = y / Math.max(height, 1) - 0.5;
    let angle =
      Math.sin(nx * 8.5 + time * 0.00023) * 1.05 +
      Math.cos(ny * 7.2 - time * 0.00017) * 0.9 +
      Math.sin((nx + ny) * 5.4) * 0.48;

    if (pointer.active) {
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / Math.min(width, height) / 0.42);
      angle += (Math.atan2(dy, dx) + Math.PI / 2 - angle) * influence;
    }

    return angle;
  }

  function draw(time) {
    if (!isVisible) return;

    context.fillStyle = colors.wash;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 0.72;
    context.lineCap = "round";

    for (const particle of particles) {
      const previousX = particle.x;
      const previousY = particle.y;
      const angle = angleAt(particle.x, particle.y, time);
      particle.x += Math.cos(angle) * particle.speed;
      particle.y += Math.sin(angle) * particle.speed;
      particle.age += 1;

      context.beginPath();
      context.moveTo(previousX, previousY);
      context.lineTo(particle.x, particle.y);
      context.strokeStyle = particle.blue ? colors.blue : colors.graphite;
      context.stroke();

      if (
        particle.x < -8 ||
        particle.x > width + 8 ||
        particle.y < -8 ||
        particle.y > height + 8 ||
        particle.age > particle.life
      ) {
        resetParticle(particle, false);
      }
    }

    animationId = requestAnimationFrame(draw);
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
  }

  const observer = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
    if (isVisible && !animationId) animationId = requestAnimationFrame(draw);
    if (!isVisible && animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
    }
  });

  installation.addEventListener("pointermove", updatePointer, { passive: true });
  installation.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  window.addEventListener("resize", resize, { passive: true });
  observer.observe(installation);
  resize();
  animationId = requestAnimationFrame(draw);
})();
