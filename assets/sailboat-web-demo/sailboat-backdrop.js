/*
 * Sailboat RL Backdrop
 * Browser-only inference demo. No training or RL dependencies are included.
 * The champion genome below is copied verbatim from evolution_champion.npz.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const WORLD_BOUNDS = [-120, 120, -30, 245];
  const COURSE_CENTER = { x: 0, y: 107.5 };
  const BOAT_LENGTH_M = 4.2;
  const BOAT_BEAM_M = 1.5;
  const DT = 0.25;
  const MIN_ZOOM = 0.55;
  const MAX_ZOOM = 3;
  const ZOOM_EASING = 7.5;

  // Exact fully-trained controller parameters, in the same order as agent.py.
  const CHAMPION = Object.freeze([
    54,
    0.85,
    1.9124536877472516,
    0.28324118801843662,
    0.6792777676944942,
    0.8151108655835283,
    -1,
    0.02,
    1.5214066871074177,
    0,
    1.9280773502130033,
    0.83299308799997,
    0.0029813102389615225,
    4.5,
    2.611554760004489,
  ]);

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const length = (x, y) => Math.hypot(x, y);
  const wrap = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const angleDifference = (to, from) => wrap(to - from);

  class Random {
    constructor(seed) {
      this.state = seed >>> 0 || 0x6d2b79f5;
      this.spareNormal = null;
    }

    next() {
      this.state += 0x6d2b79f5;
      let value = this.state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(low, high) {
      return mix(low, high, this.next());
    }

    normal(mean = 0, sigma = 1) {
      if (this.spareNormal !== null) {
        const result = this.spareNormal;
        this.spareNormal = null;
        return mean + sigma * result;
      }
      const radius = Math.sqrt(-2 * Math.log(Math.max(this.next(), 1e-12)));
      const angle = TAU * this.next();
      this.spareNormal = radius * Math.sin(angle);
      return mean + sigma * radius * Math.cos(angle);
    }
  }

  function randomSeed() {
    if (globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  class WindField {
    constructor(rng, meanSpeed, meanFrom, speedVariation, directionVariation) {
      this.meanSpeed = meanSpeed;
      this.meanFrom = meanFrom;
      this.speedVariation = speedVariation;
      this.directionVariation = directionVariation;
      this.modes = Array.from({ length: 7 }, () => {
        const wavelength = rng.range(45, 150);
        const orientation = rng.range(0, TAU);
        const waveNumber = TAU / wavelength;
        return {
          kx: waveNumber * Math.cos(orientation),
          ky: waveNumber * Math.sin(orientation),
          speedWeight: rng.range(0.5, 1),
          directionWeight: rng.range(0.4, 1),
          speedPhase: rng.range(0, TAU),
          directionPhase: rng.range(0, TAU),
          intrinsicRate:
            (TAU / rng.range(110, 260)) * (rng.next() < 0.5 ? -1 : 1),
        };
      });
      const speedWeightTotal = this.modes.reduce(
        (sum, mode) => sum + mode.speedWeight,
        0,
      );
      const directionWeightTotal = this.modes.reduce(
        (sum, mode) => sum + mode.directionWeight,
        0,
      );
      const flowAngle = meanFrom + Math.PI;
      const advectionX = 0.9 * Math.cos(flowAngle);
      const advectionY = 0.9 * Math.sin(flowAngle);
      for (const mode of this.modes) {
        mode.speedWeight /= speedWeightTotal;
        mode.directionWeight /= directionWeightTotal;
        mode.advectionRate = mode.kx * advectionX + mode.ky * advectionY;
      }
    }

    shape(signal) {
      return Math.tanh(1.5 * signal) / Math.tanh(1.5);
    }

    sample(x, y, time) {
      let speedSignal = 0;
      let directionSignal = 0;
      for (const mode of this.modes) {
        const spatialPhase = x * mode.kx + y * mode.ky;
        const timePhase = time * (mode.intrinsicRate - mode.advectionRate);
        speedSignal +=
          Math.sin(spatialPhase + mode.speedPhase + timePhase) *
          mode.speedWeight;
        directionSignal +=
          Math.sin(spatialPhase + mode.directionPhase + 0.8 * timePhase) *
          mode.directionWeight;
      }
      speedSignal = this.shape(speedSignal);
      directionSignal = this.shape(
        0.72 * directionSignal + 0.28 * speedSignal,
      );
      const speed = this.meanSpeed * (1 + this.speedVariation * speedSignal);
      const from = this.meanFrom + this.directionVariation * directionSignal;
      return { speed, from, flow: from + Math.PI };
    }
  }

  function makeCourse(rng) {
    const windward = {
      x: rng.range(-6, 6),
      y: 210 + rng.range(-8, 8),
      r: 0.75,
    };
    const offset = {
      x: windward.x - 38 + rng.range(-3, 3),
      y: windward.y + rng.range(-3, 3),
      r: 0.75,
    };
    const gatePort = { x: -24, y: 35, r: 0.75 };
    const gateStarboard = { x: 24, y: 35, r: 0.75 };
    const radius = 6.3;
    const stages = [
      { kind: "start", x: 0, y: 8 },
      { kind: "point", x: windward.x + radius, y: windward.y },
      { kind: "point", x: windward.x, y: windward.y + radius },
      { kind: "point", x: offset.x, y: offset.y + radius },
      { kind: "point", x: offset.x - radius, y: offset.y },
      { kind: "point", x: offset.x, y: offset.y - radius },
      { kind: "gate", x: 0, y: 35 },
      { kind: "point", x: gateStarboard.x, y: gateStarboard.y - radius },
      { kind: "point", x: gateStarboard.x + radius, y: gateStarboard.y },
      { kind: "point", x: windward.x + radius, y: windward.y },
      { kind: "point", x: windward.x, y: windward.y + radius },
      { kind: "point", x: offset.x, y: offset.y + radius },
      { kind: "point", x: offset.x - radius, y: offset.y },
      { kind: "point", x: offset.x, y: offset.y - radius },
      { kind: "finish", x: 0, y: -8 },
    ];
    return {
      marks: [windward, offset, gatePort, gateStarboard],
      stages,
      lineHalfWidth: 55,
    };
  }

  function tackFor(boat, localWind) {
    const windRelative = wrap(localWind.from - boat.heading);
    if (Math.abs(windRelative) < 38 * DEG) return 0;
    return windRelative >= 0 ? 1 : -1;
  }

  function keepClearDuty(own, other, windField, elapsed) {
    const ownWind = windField.sample(own.x, own.y, elapsed);
    const otherWind = windField.sample(other.x, other.y, elapsed);
    const ownTack = tackFor(own, ownWind);
    const otherTack = tackFor(other, otherWind);
    if (ownTack !== 0 && otherTack !== 0 && ownTack !== otherTack) {
      return ownTack === 1 ? 1 : -1;
    }
    const headingDot = Math.cos(other.heading - own.heading);
    if (headingDot > 0.5) {
      const meanHeading = Math.atan2(
        Math.sin(own.heading) + Math.sin(other.heading),
        Math.cos(own.heading) + Math.cos(other.heading),
      );
      const ahead =
        (other.x - own.x) * Math.cos(meanHeading) +
        (other.y - own.y) * Math.sin(meanHeading);
      if (Math.abs(ahead) > 3.15) return ahead > 0 ? 1 : -1;
    }
    const windFrom = ownWind.from;
    const ownWindward = own.x * Math.cos(windFrom) + own.y * Math.sin(windFrom);
    const otherWindward =
      other.x * Math.cos(windFrom) + other.y * Math.sin(windFrom);
    return ownWindward >= otherWindward ? 1 : -1;
  }

  class ChampionPolicy {
    constructor() {
      this.weights = CHAMPION;
      this.tack = 1;
    }

    act(boat, boats, course, windField, current, elapsed) {
      const w = this.weights;
      const target = targetFor(boat, course);
      const targetX = target.x - boat.x;
      const targetY = target.y - boat.y;
      const targetDistance = Math.max(length(targetX, targetY), 1e-9);
      const targetBearing = Math.atan2(targetY, targetX);
      let targetRelative = wrap(targetBearing - boat.heading);
      const localWind = windField.sample(boat.x, boat.y, elapsed);
      const windRelative = wrap(localWind.from - boat.heading);
      const targetDirectionX = targetX / targetDistance;
      const targetDirectionY = targetY / targetDistance;
      const currentAcross =
        current.x * -targetDirectionY + current.y * targetDirectionX;
      const crabAngle =
        w[8] *
        Math.asin(clamp(currentAcross / Math.max(boat.speed, 0.8), -0.35, 0.35));
      targetRelative = wrap(targetRelative - crabAngle);
      const closeHauled = w[0] * DEG;
      const targetFromWind = wrap(targetRelative - windRelative);
      const rightOfWindX = Math.cos(windField.meanFrom - Math.PI / 2);
      const rightOfWindY = Math.sin(windField.meanFrom - Math.PI / 2);
      const crossTrack =
        ((boat.x - boat.legOriginX) * rightOfWindX +
          (boat.y - boat.legOriginY) * rightOfWindY) /
        50;
      if (Math.abs(targetFromWind) < closeHauled) {
        if (crossTrack > w[1]) this.tack = 1;
        else if (crossTrack < -w[1]) this.tack = -1;
        else if (targetDistance / 240 < w[7] && Math.abs(targetFromWind) > 3 * DEG) {
          this.tack = Math.sign(targetFromWind) || this.tack;
        }
        targetRelative = wrap(windRelative + this.tack * closeHauled);
      }

      const forwardX = Math.cos(boat.heading);
      const forwardY = Math.sin(boat.heading);
      const leftX = -forwardY;
      const leftY = forwardX;
      const nearest = boats
        .filter((other) => other !== boat && !other.finished)
        .map((other) => ({
          other,
          distance: length(other.x - boat.x, other.y - boat.y),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      let collisionSteer = 0;
      let wakeSteer = 0;
      let urgentRisk = 0;
      let urgentRelative = null;
      let followSlowdown = 0;
      const clearance = w[10] / 12;
      for (const item of nearest) {
        const other = item.other;
        const dx = other.x - boat.x;
        const dy = other.y - boat.y;
        const forward = (dx * forwardX + dy * forwardY) / (12 * BOAT_LENGTH_M);
        const lateral = (dx * leftX + dy * leftY) / (12 * BOAT_LENGTH_M);
        const relativeDistance = Math.hypot(forward, lateral);
        const relativeHeading = wrap(other.heading - boat.heading);
        const headingSin = Math.sin(relativeHeading);
        const headingCos = Math.cos(relativeHeading);
        const avoidanceSide =
          Math.abs(lateral) < 0.025 ? -this.tack : -Math.sign(lateral);
        const proximity = clamp(
          1 - relativeDistance / Math.max(clearance, 1e-6),
          0,
          1,
        );
        const headingConflict = 0.55 + 0.45 * Math.abs(headingSin);
        const aheadWeight = clamp(0.75 + 3 * forward, 0.35, 1.25);
        const baseRisk =
          proximity * headingConflict * aheadWeight * clamp(boat.speed / 0.8, 0, 1);
        const duty = keepClearDuty(boat, other, windField, elapsed);
        let maneuverRelative = avoidanceSide;
        let dutyWeight = 0.8;
        if (duty > 0) {
          const trail = Math.min((w[10] + 0.8) / 12, Math.max(0.08, 0.75 * relativeDistance));
          const sternForward = forward - trail * headingCos;
          const sternLateral = lateral - trail * headingSin;
          const sternRelative = Math.atan2(sternLateral, sternForward);
          maneuverRelative =
            0.55 * avoidanceSide + 0.45 * clamp(sternRelative, -1, 1);
          dutyWeight = 1;
          if (
            headingCos > 0.7 &&
            forward > 0 &&
            Math.abs(lateral) < clearance
          ) {
            followSlowdown = Math.max(followSlowdown, proximity * headingCos);
          }
        }
        const risk = baseRisk * dutyWeight;
        collisionSteer +=
          clamp(maneuverRelative, -1, 1) *
          risk *
          (0.85 + 0.3 * Math.abs(headingSin));
        if (risk > urgentRisk) {
          urgentRisk = risk;
          urgentRelative = maneuverRelative;
        }
        const wakeProximity = clamp(1 - relativeDistance / (8 / 12), 0, 1);
        wakeSteer += avoidanceSide * wakeProximity;
      }

      targetRelative += w[11] * clamp(collisionSteer, -1, 1);
      targetRelative += w[12] * boat.wakeLoss * clamp(wakeSteer, -1, 1);
      let rudder = clamp(w[2] * targetRelative, -1, 1);
      const safetyOverride = clamp((urgentRisk - 0.12) / 0.35, 0, 1);
      if (urgentRelative !== null) {
        const urgentRudder = clamp(w[2] * urgentRelative, -1, 1);
        rudder = clamp(mix(rudder, urgentRudder, safetyOverride), -1, 1);
      }

      const angleToWind = Math.abs(windRelative);
      let trim;
      if (angleToWind <= Math.PI / 2) {
        if (angleToWind <= closeHauled) {
          trim = mix(w[3] * 0.5, w[3], angleToWind / closeHauled);
        } else {
          trim = mix(
            w[3],
            w[4],
            (angleToWind - closeHauled) / (Math.PI / 2 - closeHauled),
          );
        }
      } else {
        trim = mix(w[4], w[5], (angleToWind - Math.PI / 2) / (Math.PI / 2));
      }
      trim += w[9] * (localWind.speed / 7 - 1);
      trim += 0.08 * followSlowdown;
      return { rudder, trim: clamp(trim, 0, 1) };
    }
  }

  function targetFor(boat, course) {
    const stage = course.stages[Math.min(boat.stage, course.stages.length - 1)];
    if (stage.kind === "start") return { x: boat.startLane, y: stage.y };
    return stage;
  }

  function segmentDistance(pointX, pointY, startX, startY, endX, endY) {
    const vx = endX - startX;
    const vy = endY - startY;
    const denominator = vx * vx + vy * vy;
    if (denominator <= 1e-12) return length(pointX - startX, pointY - startY);
    const fraction = clamp(
      ((pointX - startX) * vx + (pointY - startY) * vy) / denominator,
      0,
      1,
    );
    return length(pointX - (startX + fraction * vx), pointY - (startY + fraction * vy));
  }

  function polarFactor(angle) {
    const degrees = angle / DEG;
    const points = [0, 32, 38, 55, 90, 120, 150, 180];
    const values = [0, 0, 0.48, 0.72, 1, 0.94, 0.79, 0.65];
    for (let index = 1; index < points.length; index += 1) {
      if (degrees <= points[index]) {
        return mix(
          values[index - 1],
          values[index],
          (degrees - points[index - 1]) / (points[index] - points[index - 1]),
        );
      }
    }
    return values.at(-1);
  }

  function idealTrim(angle) {
    const degrees = angle / DEG;
    const points = [0, 40, 90, 135, 180];
    const values = [0.08, 0.18, 0.5, 0.74, 0.9];
    for (let index = 1; index < points.length; index += 1) {
      if (degrees <= points[index]) {
        return mix(
          values[index - 1],
          values[index],
          (degrees - points[index - 1]) / (points[index] - points[index - 1]),
        );
      }
    }
    return 0.9;
  }

  class SailboatBackdrop extends HTMLElement {
    static get observedAttributes() {
      return [
        "course-angle",
        "time-scale",
        "boat-count",
        "seed",
        "paused",
        "view-offset-x",
        "view-offset-y",
        "zoom",
      ];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            position: relative;
            overflow: hidden;
            min-width: 1px;
            min-height: 1px;
            contain: strict;
            background: var(--sailboat-water, #4b8fa3);
          }
          canvas {
            display: block;
            width: 100%;
            height: 100%;
          }
        </style>
        <canvas aria-label="Animated sailboat race backdrop"></canvas>
      `;
      this.canvas = this.shadowRoot.querySelector("canvas");
      this.context = this.canvas.getContext("2d", { alpha: false });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.lastFrame = 0;
      this.accumulator = 0;
      this.elapsed = 0;
      this.frameHandle = 0;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.projection = null;
      this.currentZoom = 1;
      this.targetZoom = 1;
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
      this.zoomAnchor = null;
      this.handleWheel = this.handleWheel.bind(this);
    }

    connectedCallback() {
      this.currentZoom = this.configuredZoom;
      this.targetZoom = this.currentZoom;
      this.viewOffsetX = this.configuredViewOffsetX;
      this.viewOffsetY = this.configuredViewOffsetY;
      this.resizeObserver.observe(this);
      globalThis.addEventListener("wheel", this.handleWheel, { passive: true });
      this.randomize(this.seed);
      this.lastFrame = performance.now();
      this.frameHandle = requestAnimationFrame((time) => this.frame(time));
    }

    disconnectedCallback() {
      this.resizeObserver.disconnect();
      globalThis.removeEventListener("wheel", this.handleWheel);
      cancelAnimationFrame(this.frameHandle);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this.isConnected) return;
      if (name === "seed" || name === "boat-count") this.randomize(this.seed);
      if (name === "course-angle") this.updateProjection();
      if (name === "view-offset-x") {
        this.viewOffsetX = this.configuredViewOffsetX;
        this.updateProjection();
      }
      if (name === "view-offset-y") {
        this.viewOffsetY = this.configuredViewOffsetY;
        this.updateProjection();
      }
      if (name === "zoom") this.setZoomTarget(this.configuredZoom);
    }

    get seed() {
      const raw = this.getAttribute("seed");
      if (raw === null || raw.trim() === "") return randomSeed();
      const value = Number(raw);
      return Number.isFinite(value) ? value >>> 0 : randomSeed();
    }

    get courseAngle() {
      const value = Number(this.getAttribute("course-angle"));
      return Number.isFinite(value) ? value : 0;
    }

    set courseAngle(value) {
      this.setAttribute("course-angle", String(value));
    }

    get timeScale() {
      const value = Number(this.getAttribute("time-scale"));
      return Number.isFinite(value) && value > 0 ? value : 5;
    }

    get boatCount() {
      const raw = this.getAttribute("boat-count");
      if (raw === null || raw.trim() === "") return 20;
      const value = Number(raw);
      return clamp(Number.isFinite(value) ? Math.round(value) : 20, 4, 30);
    }

    get paused() {
      return this.hasAttribute("paused");
    }

    get configuredZoom() {
      const raw = this.getAttribute("zoom");
      if (raw === null || raw.trim() === "") return 1;
      const value = Number(raw);
      return clamp(Number.isFinite(value) ? value : 1, MIN_ZOOM, MAX_ZOOM);
    }

    get configuredViewOffsetX() {
      const value = Number(this.getAttribute("view-offset-x"));
      return Number.isFinite(value) ? value : 0;
    }

    get configuredViewOffsetY() {
      const value = Number(this.getAttribute("view-offset-y"));
      return Number.isFinite(value) ? value : 0;
    }

    get zoomLevel() {
      return this.targetZoom;
    }

    set zoomLevel(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      this.setAttribute("zoom", String(clamp(numeric, MIN_ZOOM, MAX_ZOOM)));
    }

    setZoomTarget(value, screenX = this.width / 2, screenY = this.height / 2) {
      const nextZoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - this.targetZoom) < 1e-9) return false;
      if (this.projection) {
        const world = this.unproject(screenX, screenY);
        this.zoomAnchor = {
          screenX,
          screenY,
          worldX: world.x,
          worldY: world.y,
        };
      }
      this.targetZoom = nextZoom;
      return true;
    }

    handleWheel(event) {
      if (this.hasAttribute("disable-scroll-zoom") || event.defaultPrevented) {
        return;
      }
      const rect = this.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
      const delta = clamp(event.deltaY * unit, -240, 240);
      if (Math.abs(delta) < 0.01) return;
      const nextZoom = clamp(
        this.targetZoom * Math.exp(-delta * 0.0015),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const changed = this.setZoomTarget(
        nextZoom,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      if (!changed) return;
      this.dispatchEvent(
        new CustomEvent("sailboat-zoom", {
          detail: { zoom: this.targetZoom },
        }),
      );
    }

    randomize(seed = randomSeed()) {
      this.currentSeed = seed >>> 0;
      this.rng = new Random(this.currentSeed);
      this.course = makeCourse(this.rng);
      const meanWind = this.rng.range(5.6, 8.6);
      const meanFrom = Math.PI / 2 + this.rng.range(-8 * DEG, 8 * DEG);
      const gustiness = this.rng.range(0.04, 0.24);
      const directionVariation = mix(
        5 * DEG,
        14 * DEG,
        (gustiness - 0.04) / 0.2,
      );
      this.windField = new WindField(
        this.rng,
        meanWind,
        meanFrom,
        gustiness,
        directionVariation,
      );
      const currentSpeed = this.rng.range(0.04, 0.22);
      const currentAngle =
        Math.atan2(-0.08, 0.12) + this.rng.range(-35 * DEG, 35 * DEG);
      this.current = {
        x: currentSpeed * Math.cos(currentAngle),
        y: currentSpeed * Math.sin(currentAngle),
      };
      const count = this.boatCount;
      const shuffledHues = Array.from({ length: count }, (_, index) => index / count)
        .sort(() => this.rng.next() - 0.5);
      this.boats = Array.from({ length: count }, (_, index) => {
        const lineFraction = count === 1 ? 0.5 : index / (count - 1);
        const lane = mix(-52, 52, lineFraction) + this.rng.range(-0.25, 0.25);
        const sag = 2.8 * (1 - (lane / 52) ** 2);
        const hue = (shuffledHues[index] * 360 + this.rng.range(-12, 12) + 360) % 360;
        const speedFactor = this.rng.range(0.9, 1.1);
        return {
          x: lane,
          y: -0.45 - sag + this.rng.range(-0.2, 0.2),
          previousX: lane,
          previousY: -0.45 - sag,
          heading: meanFrom + 50 * DEG + this.rng.normal(0, 0.35 * DEG),
          speed: clamp(this.rng.normal(3.1, 0.08), 2.85, 3.35) * speedFactor,
          speedFactor,
          trim: clamp(this.rng.normal(0.21, 0.012), 0.17, 0.25),
          stage: 0,
          legOriginX: lane,
          legOriginY: -0.45 - sag,
          startLane: lane,
          policy: new ChampionPolicy(),
          wake: [],
          wakeTimer: this.rng.range(0, 0.28),
          wakeLoss: 0,
          finished: false,
          finishedAt: Infinity,
          color: `hsl(${hue.toFixed(1)} 70% 78%)`,
          sailColor: `hsla(${hue.toFixed(1)} 78% 91% / 0.88)`,
        };
      });
      this.elapsed = 0;
      this.accumulator = 0;
      this.restartDelay = 0;
      this.updateProjection();
      this.dispatchEvent(
        new CustomEvent("sailboat-reset", {
          detail: { seed: this.currentSeed },
        }),
      );
    }

    resize() {
      const rect = this.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.updateProjection();
    }

    updateProjection() {
      const angle = this.courseAngle * DEG;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const [minX, maxX, minY, maxY] = WORLD_BOUNDS;
      const corners = [
        [minX, minY],
        [minX, maxY],
        [maxX, minY],
        [maxX, maxY],
      ].map(([x, y]) => {
        const dx = x - COURSE_CENTER.x;
        const dy = y - COURSE_CENTER.y;
        return {
          x: dx * cosine - dy * sine,
          y: dx * sine + dy * cosine,
        };
      });
      const extentX = Math.max(...corners.map((point) => Math.abs(point.x))) * 2;
      const extentY = Math.max(...corners.map((point) => Math.abs(point.y))) * 2;
      const baseScale =
        0.94 * Math.min(this.width / extentX, this.height / extentY);
      const scale = baseScale * this.currentZoom;
      if (this.zoomAnchor) {
        const dx = this.zoomAnchor.worldX - COURSE_CENTER.x;
        const dy = this.zoomAnchor.worldY - COURSE_CENTER.y;
        const rotatedX = dx * cosine - dy * sine;
        const rotatedY = dx * sine + dy * cosine;
        this.viewOffsetX =
          this.zoomAnchor.screenX - this.width / 2 - rotatedX * scale;
        this.viewOffsetY =
          this.zoomAnchor.screenY - this.height / 2 + rotatedY * scale;
      }
      this.projection = {
        angle,
        cosine,
        sine,
        scale,
        offsetX: this.viewOffsetX,
        offsetY: this.viewOffsetY,
      };
    }

    project(x, y) {
      const projection = this.projection;
      const dx = x - COURSE_CENTER.x;
      const dy = y - COURSE_CENTER.y;
      const rotatedX = dx * projection.cosine - dy * projection.sine;
      const rotatedY = dx * projection.sine + dy * projection.cosine;
      return {
        x: this.width / 2 + projection.offsetX + rotatedX * projection.scale,
        y: this.height / 2 + projection.offsetY - rotatedY * projection.scale,
      };
    }

    unproject(screenX, screenY) {
      const projection = this.projection;
      const rotatedX =
        (screenX - this.width / 2 - projection.offsetX) / projection.scale;
      const rotatedY =
        -(screenY - this.height / 2 - projection.offsetY) / projection.scale;
      return {
        x:
          COURSE_CENTER.x +
          rotatedX * projection.cosine +
          rotatedY * projection.sine,
        y:
          COURSE_CENTER.y -
          rotatedX * projection.sine +
          rotatedY * projection.cosine,
      };
    }

    frame(now) {
      const wallDelta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      const zoomBefore = this.currentZoom;
      const zoomAmount = 1 - Math.exp(-ZOOM_EASING * wallDelta);
      this.currentZoom = mix(this.currentZoom, this.targetZoom, zoomAmount);
      if (Math.abs(this.currentZoom - this.targetZoom) < 0.0001) {
        this.currentZoom = this.targetZoom;
      }
      if (this.currentZoom !== zoomBefore) this.updateProjection();
      if (this.currentZoom === this.targetZoom) this.zoomAnchor = null;
      if (!this.paused && this.boats) {
        this.accumulator += wallDelta * this.timeScale;
        let steps = 0;
        while (this.accumulator >= DT && steps < 10) {
          this.step(DT);
          this.accumulator -= DT;
          steps += 1;
        }
      }
      this.draw();
      this.frameHandle = requestAnimationFrame((time) => this.frame(time));
    }

    step(dt) {
      this.elapsed += dt;
      this.computeWakeEffects();
      const actions = this.boats.map((boat) =>
        boat.finished
          ? null
          : boat.policy.act(
              boat,
              this.boats,
              this.course,
              this.windField,
              this.current,
              this.elapsed,
            ),
      );
      this.applySafetyBias(actions);
      for (let index = 0; index < this.boats.length; index += 1) {
        const boat = this.boats[index];
        if (boat.finished) continue;
        const action = actions[index];
        boat.previousX = boat.x;
        boat.previousY = boat.y;
        const steeringAuthority = 0.3 + 0.7 * clamp(boat.speed / 1.5, 0, 1);
        boat.heading = wrap(
          boat.heading + action.rudder * 22 * DEG * steeringAuthority * dt,
        );
        boat.trim += clamp(action.trim - boat.trim, -dt / 1.2, dt / 1.2);
        boat.trim = clamp(boat.trim, 0, 1);
        const localWind = this.windField.sample(boat.x, boat.y, this.elapsed);
        const effectiveWindSpeed = localWind.speed * (1 - boat.wakeLoss);
        const windFrom = localWind.from;
        const angleToWind = Math.abs(wrap(boat.heading - windFrom));
        const windFactor = effectiveWindSpeed / this.windField.meanSpeed;
        const trimError = Math.abs(boat.trim - idealTrim(angleToWind));
        const trimEfficiency = Math.max(
          0.12,
          Math.cos((trimError * Math.PI) / 2) ** 2,
        );
        const targetSpeed =
          4.8 *
          boat.speedFactor *
          windFactor *
          polarFactor(angleToWind) *
          trimEfficiency *
          (1 - 0.12 * Math.abs(action.rudder));
        boat.speed += (targetSpeed - boat.speed) * (dt / 3.5);
        boat.speed = Math.max(0, boat.speed);
        boat.x += (boat.speed * Math.cos(boat.heading) + this.current.x) * dt;
        boat.y += (boat.speed * Math.sin(boat.heading) + this.current.y) * dt;
        boat.wakeTimer += dt;
        if (boat.wakeTimer >= 0.28) {
          boat.wakeTimer = 0;
          boat.wake.push({
            x: boat.x,
            y: boat.y,
            heading: boat.heading,
            time: this.elapsed,
          });
        }
        // This is deliberately only a few boat-lengths of disturbed water,
        // never a history/trajectory trace.
        boat.wake = boat.wake.filter((point) => this.elapsed - point.time < 4.8);
        this.advanceStage(boat);
      }
      this.resolveOverlaps();
      const finished = this.boats.every((boat) => boat.finished);
      if (finished || this.elapsed > 1050) this.restartDelay += dt;
      if (this.restartDelay > 4) this.randomize();
    }

    computeWakeEffects() {
      for (const target of this.boats) {
        let remaining = 1;
        for (const source of this.boats) {
          if (source === target || source.finished) continue;
          const ambient = this.windField.sample(source.x, source.y, this.elapsed);
          const flowX = Math.cos(ambient.flow);
          const flowY = Math.sin(ambient.flow);
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const downstream = dx * flowX + dy * flowY;
          if (downstream <= 0 || downstream >= 8 * BOAT_LENGTH_M) continue;
          const lateral = flowX * dy - flowY * dx;
          const width = 0.38 * BOAT_LENGTH_M + 0.055 * downstream;
          const profile = Math.exp(-0.5 * (lateral / width) ** 2);
          const onset = 1 - Math.exp(-downstream / (0.45 * BOAT_LENGTH_M));
          const decay = Math.exp(-downstream / (5.5 * BOAT_LENGTH_M));
          const cutoff = (1 - downstream / (8 * BOAT_LENGTH_M)) ** 0.75;
          const loading = 0.55 + 0.45 * clamp(source.speed / 4.8, 0, 1);
          const deficit = clamp(
            0.3 * loading * (1 - 0.25 * source.trim) * profile * onset * decay * cutoff,
            0,
            0.3,
          );
          remaining *= 1 - deficit;
        }
        target.wakeLoss = Math.min(0.38, 1 - remaining);
      }
    }

    applySafetyBias(actions) {
      for (let firstIndex = 0; firstIndex < this.boats.length; firstIndex += 1) {
        const first = this.boats[firstIndex];
        if (first.finished) continue;
        for (let secondIndex = firstIndex + 1; secondIndex < this.boats.length; secondIndex += 1) {
          const second = this.boats[secondIndex];
          if (second.finished) continue;
          const rx = second.x - first.x;
          const ry = second.y - first.y;
          if (rx * rx + ry * ry > 18 * 18) continue;
          const firstVx = first.speed * Math.cos(first.heading);
          const firstVy = first.speed * Math.sin(first.heading);
          const secondVx = second.speed * Math.cos(second.heading);
          const secondVy = second.speed * Math.sin(second.heading);
          const rvx = secondVx - firstVx;
          const rvy = secondVy - firstVy;
          const rv2 = rvx * rvx + rvy * rvy;
          const cpaTime = clamp(
            rv2 > 1e-9 ? -(rx * rvx + ry * rvy) / rv2 : 0,
            0,
            4.5,
          );
          const cpaX = rx + rvx * cpaTime;
          const cpaY = ry + rvy * cpaTime;
          const cpa = length(cpaX, cpaY);
          if (cpa >= 3.5 || cpaTime <= 0.1) continue;
          const firstDuty = keepClearDuty(first, second, this.windField, this.elapsed);
          const giveWayIndex = firstDuty > 0 ? firstIndex : secondIndex;
          const standOnIndex = giveWayIndex === firstIndex ? secondIndex : firstIndex;
          const giveWay = this.boats[giveWayIndex];
          const standOn = this.boats[standOnIndex];
          const sternDistance = 1.15 * BOAT_LENGTH_M;
          const targetX = standOn.x - sternDistance * Math.cos(standOn.heading);
          const targetY = standOn.y - sternDistance * Math.sin(standOn.heading);
          const desired = Math.atan2(targetY - giveWay.y, targetX - giveWay.x);
          const desiredRudder = clamp(1.7 * angleDifference(desired, giveWay.heading), -1, 1);
          const strength = clamp((3.5 - cpa) / 3.5, 0.25, 0.75);
          actions[giveWayIndex].rudder = mix(
            actions[giveWayIndex].rudder,
            desiredRudder,
            strength,
          );
          if (cpa < 1.2 && cpaTime < 1.2) {
            actions[standOnIndex].rudder *= 0.7;
          }
        }
      }
    }

    advanceStage(boat) {
      const stage = this.course.stages[boat.stage];
      let complete = false;
      if (stage.kind === "start") {
        complete = boat.previousY < 0 && boat.y >= 0 && Math.abs(boat.x) <= 55;
      } else if (stage.kind === "gate") {
        complete =
          boat.previousY > 35 && boat.y <= 35 && Math.abs(boat.x) <= 24;
      } else if (stage.kind === "finish") {
        complete = boat.previousY > 0 && boat.y <= 0 && Math.abs(boat.x) <= 55;
      } else {
        complete =
          segmentDistance(
            stage.x,
            stage.y,
            boat.previousX,
            boat.previousY,
            boat.x,
            boat.y,
          ) <= 8.4;
      }
      if (!complete) return;
      boat.stage += 1;
      boat.legOriginX = boat.x;
      boat.legOriginY = boat.y;
      if (boat.stage >= this.course.stages.length) {
        boat.finished = true;
        boat.finishedAt = this.elapsed;
      }
    }

    resolveOverlaps() {
      for (let firstIndex = 0; firstIndex < this.boats.length; firstIndex += 1) {
        const first = this.boats[firstIndex];
        if (first.finished) continue;
        for (let secondIndex = firstIndex + 1; secondIndex < this.boats.length; secondIndex += 1) {
          const second = this.boats[secondIndex];
          if (second.finished) continue;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = length(dx, dy);
          const minimum = 0.62 * BOAT_BEAM_M;
          if (distance >= minimum) continue;
          const nx = distance > 1e-6 ? dx / distance : 1;
          const ny = distance > 1e-6 ? dy / distance : 0;
          const push = (minimum - distance + 0.01) / 2;
          first.x -= nx * push;
          first.y -= ny * push;
          second.x += nx * push;
          second.y += ny * push;
          first.speed *= 0.94;
          second.speed *= 0.94;
        }
      }
    }

    draw() {
      if (!this.boats || !this.projection) return;
      const context = this.context;
      const styles = getComputedStyle(this);
      const water = styles.getPropertyValue("--sailboat-water").trim() || "#4b8fa3";
      const wind =
        styles.getPropertyValue("--sailboat-wind").trim() ||
        "rgba(50,123,145,.58)";
      const line = styles.getPropertyValue("--sailboat-line").trim() || "rgba(235,248,246,.58)";
      const mark =
        styles.getPropertyValue("--sailboat-mark").trim() ||
        "#ffd6a5";
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.fillStyle = water;
      context.fillRect(0, 0, this.width, this.height);
      this.drawWind(context, wind);
      this.drawCourse(context, line, mark);
      this.drawWakes(context);
      for (const boat of this.boats) this.drawBoat(context, boat);
    }

    drawWind(context, windColor) {
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 1.9;
      context.strokeStyle = windColor;
      const columns = Math.max(5, Math.ceil(this.width / 74));
      const rows = Math.max(5, Math.ceil(this.height / 66));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const screenX = ((column + 0.5) / columns) * this.width;
          const screenY = ((row + 0.5) / rows) * this.height;
          const world = this.unproject(screenX, screenY);
          const wind = this.windField.sample(world.x, world.y, this.elapsed);
          const strength = clamp((wind.speed - 4) / 7, 0, 1);
          const vectorPx = mix(3.2, 15.5, strength ** 1.35);
          const direction = wind.flow + this.projection.angle;
          const ux = Math.cos(direction);
          const uy = -Math.sin(direction);
          const endX = screenX + ux * vectorPx;
          const endY = screenY + uy * vectorPx;
          const headLength = clamp(vectorPx * 0.32, 1.2, 3.4);
          const headWidth = headLength * 0.62;
          context.beginPath();
          context.moveTo(screenX, screenY);
          context.lineTo(endX, endY);
          context.moveTo(endX, endY);
          context.lineTo(
            endX - headLength * ux + headWidth * uy,
            endY - headLength * uy - headWidth * ux,
          );
          context.moveTo(endX, endY);
          context.lineTo(
            endX - headLength * ux - headWidth * uy,
            endY - headLength * uy + headWidth * ux,
          );
          context.stroke();
        }
      }
      context.restore();
    }

    drawCourse(context, lineColor, markColor) {
      context.save();
      context.strokeStyle = lineColor;
      context.lineWidth = 1.4;
      context.setLineDash([5, 8]);
      for (const y of [0, 35]) {
        const halfWidth = y === 0 ? 55 : 24;
        const start = this.project(-halfWidth, y);
        const end = this.project(halfWidth, y);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }
      context.setLineDash([]);
      for (const buoy of this.course.marks) {
        const point = this.project(buoy.x, buoy.y);
        const baseScale = this.projection.scale / this.currentZoom;
        const radius =
          Math.max(3.2, buoy.r * baseScale) * this.currentZoom;
        context.fillStyle = markColor;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    drawWakes(context) {
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const boat of this.boats) {
        if (boat.wake.length < 2) continue;
        for (let side = -1; side <= 1; side += 2) {
          for (let index = 1; index < boat.wake.length; index += 1) {
            const previous = boat.wake[index - 1];
            const point = boat.wake[index];
            const previousAge = this.elapsed - previous.time;
            const age = this.elapsed - point.time;
            const life = clamp(1 - 0.5 * (previousAge + age) / 4.8, 0, 1);
            const previousSpread = 0.34 + 0.13 * previousAge;
            const spread = 0.34 + 0.13 * age;
            const start = this.project(
              previous.x - Math.sin(previous.heading) * previousSpread * side,
              previous.y + Math.cos(previous.heading) * previousSpread * side,
            );
            const end = this.project(
              point.x - Math.sin(point.heading) * spread * side,
              point.y + Math.cos(point.heading) * spread * side,
            );
            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.strokeStyle = `rgba(244,253,251,${0.34 * life ** 1.35})`;
            context.lineWidth = 0.45 + 0.9 * life;
            context.stroke();
          }
        }
      }
      context.restore();
    }

    drawBoat(context, boat) {
      const alpha = boat.finished
        ? clamp(1 - (this.elapsed - boat.finishedAt) / 3, 0, 1)
        : 1;
      if (alpha <= 0) return;
      const position = this.project(boat.x, boat.y);
      const heading = boat.heading + this.projection.angle;
      const baseScale = this.projection.scale / this.currentZoom;
      const scale = clamp(baseScale * 5, 7.6, 18) * this.currentZoom;
      const edgeWidth = scale * 0.085;
      context.save();
      context.globalAlpha = alpha;
      context.translate(position.x, position.y);
      context.rotate(-heading);
      context.fillStyle = boat.color;
      context.strokeStyle = "rgba(42,68,76,.58)";
      context.lineWidth = edgeWidth;
      context.beginPath();
      context.moveTo(scale * 0.7, 0);
      context.quadraticCurveTo(-scale * 0.18, scale * 0.32, -scale * 0.58, 0);
      context.quadraticCurveTo(-scale * 0.18, -scale * 0.32, scale * 0.7, 0);
      context.closePath();
      context.fill();
      context.stroke();

      const localWind = this.windField.sample(boat.x, boat.y, this.elapsed);
      const windRelative = wrap(localWind.from - boat.heading);
      const sailSide = windRelative >= 0 ? 1 : -1;
      const boomAngle = sailSide * boat.trim * 82 * DEG;
      // The mast sits halfway between the hull center and the bow.
      context.translate(scale * 0.35, 0);
      context.rotate(-boomAngle);
      context.strokeStyle = "rgba(50,75,82,.38)";
      context.lineCap = "round";
      context.lineWidth = scale * 0.125;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(-scale * 0.72, 0);
      context.stroke();

      // Lay the sail over the boom so the spar reads as its lower edge instead
      // of as a dark line drawn through the cloth.
      context.fillStyle = boat.sailColor;
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-scale * 0.33, sailSide * scale * 0.08, -scale * 0.72, 0);
      context.lineTo(-scale * 0.1, 0);
      context.closePath();
      context.fill();
      context.lineWidth = edgeWidth;
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(
        -scale * 0.33,
        sailSide * scale * 0.08,
        -scale * 0.72,
        0,
      );
      context.stroke();
      context.restore();
    }
  }

  if (!customElements.get("sailboat-backdrop")) {
    customElements.define("sailboat-backdrop", SailboatBackdrop);
  }
})();
