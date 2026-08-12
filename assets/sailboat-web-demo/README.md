# Sailboat RL website backdrop

A self-contained browser component for using the trained sailboat race as a
site background. The trained controller, simulation, and renderer are all in
`sailboat-backdrop.js`; there are no packages, build tools, network requests, or
training dependencies.

## Files to use

- `sailboat-backdrop.js` — the complete reusable component
- `index.html` — a full-screen, text-free example

## Add it to a site

1. Copy `sailboat-backdrop.js` into the site's public assets, for example at
   `/assets/sailboat-backdrop.js`.
2. Load the script and place the component near the start of `<body>`:

```html
<script src="/assets/sailboat-backdrop.js" defer></script>

<sailboat-backdrop
  class="sailing-background"
  course-angle="-18"
  time-scale="5"
  aria-hidden="true"
></sailboat-backdrop>

<main class="site-content">
  <!-- Your site -->
</main>
```

3. Put the simulation in a fixed layer and keep site content above it:

```css
html {
  background: #4b8fa3;
}

body {
  min-height: 100vh;
  margin: 0;
}

.sailing-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;

  --sailboat-water: #4b8fa3;
  --sailboat-wind: rgba(50, 123, 145, 0.58);
  --sailboat-line: rgba(240, 252, 249, 0.58);
  --sailboat-mark: #ffd6a5;
}

.site-content {
  position: relative;
  z-index: 1;
}
```

Use transparent or translucent backgrounds on any site sections where the race
should remain visible. Keeping the backdrop at `z-index: 0` is more reliable
than a negative z-index, which can place it behind the document background.

## Scroll zoom

Mouse-wheel and trackpad scrolling smoothly zoom the background around the
pointer while normal page scrolling continues. Boats, sails, wakes, and buoys
scale with the course instead of remaining fixed-size overlays. The initial
scale can be set with `zoom`:

```html
<sailboat-backdrop zoom="1.25"></sailboat-backdrop>
```

Zoom is clamped to `0.55`–`3`. To turn off scroll zoom, add the Boolean
attribute `disable-scroll-zoom`:

```html
<sailboat-backdrop disable-scroll-zoom></sailboat-backdrop>
```

## Configuration

| Attribute | Default | Purpose |
|---|---:|---|
| `course-angle` | `0` | Rotates the complete race course in degrees |
| `zoom` | `1` | Sets the initial background scale (`0.55`–`3`) |
| `view-offset-x` | `0` | Moves the initial camera horizontally in pixels |
| `view-offset-y` | `0` | Moves the initial camera vertically in pixels |
| `time-scale` | `5` | Simulated seconds per real second |
| `boat-count` | `20` | Fleet size, clamped to 4–30 |
| `seed` | random | Reproduces one launch's conditions and colors |
| `paused` | absent | Freezes the race when present |
| `disable-scroll-zoom` | absent | Keeps scrolling from changing the background scale |

Change the angle or zoom at runtime if needed:

```js
const backdrop = document.querySelector("sailboat-backdrop");
backdrop.courseAngle = 27.5;
backdrop.zoomLevel = 1.4;
backdrop.randomize();       // launch new random conditions
backdrop.randomize(12345);  // reproduce a specific launch
```

The component emits `sailboat-reset` after a new race and `sailboat-zoom` when
scroll input changes the target zoom. Their event details contain `seed` and
`zoom`, respectively.

## Local preview

From this folder, start any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The component works in plain HTML and as a client-side custom element in React,
Next.js, Vue, Svelte, and Astro. On server-rendered sites, serve the JavaScript as
a public asset and load it in the browser; no framework wrapper is required.
