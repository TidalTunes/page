# Kashicode TUI Scripted Demo

This folder contains a portfolio-safe simulation of Kashicode running inside a macOS terminal window. It starts at a fake zsh prompt, types `./kashicode-demo.sh`, and lets Kashicode take over the same terminal grid. It is explicitly a demo, not the Kashicode harness.

## Safety Boundary

- No model or provider calls.
- No backend, server route, shell, filesystem, credentials, persistence, analytics, or network requests.
- Every assistant response, thinking block, skill invocation, tool call, result, file name, and token value is scripted in `demo.js`.
- User prompts select a local presentation scenario by keyword. Prompt text never leaves the page.

The source files and Kashicode mode line carry demo labels. Keep the visible mode-line label when publishing this interface.

## Add To A Website

Copy the complete `kashicode-tui-demo` folder into the website's static/public assets, then embed it:

```html
<iframe
  src="/kashicode-tui-demo/index.html"
  title="Scripted Kashicode terminal demo"
  loading="lazy"
  style="width: 100%; aspect-ratio: 147 / 100; min-height: 560px; border: 0;"
></iframe>
```

For an even stricter browser boundary, allow scripts but omit every other iframe capability:

```html
<iframe
  src="/kashicode-tui-demo/index.html"
  title="Scripted Kashicode terminal demo"
  sandbox="allow-scripts"
  style="width: 100%; aspect-ratio: 147 / 100; min-height: 560px; border: 0;"
></iframe>
```

The demo uses only relative local files and works from a static host. It can also be opened directly from disk for review.

## Local Preview

Opening `index.html` directly works. To preview through a local static server from the repository root:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/kashicode-tui-demo/`.

## Interactions

- The opening shell accepts `./kashicode-demo.sh`, `kashicode`, `clear`, and `help`.
- Enter submits a prompt and chooses a deterministic scripted scenario.
- Escape interrupts the current playback.
- Shift+Tab cycles thinking time.
- Ctrl+R followed by 1–4 selects compact, headers, collapsed detail, or full activity.
- Ctrl+T toggles thinking blocks.
- Ctrl+X toggles user/model transcript rendering.
- Ctrl+L opens the keyboard-operated demo model selector.
- Ctrl+C clears the editor or interrupts playback; twice on an empty prompt returns to zsh.
- Ctrl+D with an empty editor exits Kashicode back to the simulated zsh prompt.
- Prefix `pwd`, `ls`, or `git status` with `!` to render a simulated Bash execution.
- `/help`, `/tour`, `/clear`, `/new`, `/compact`, `/memory`, `/model`, `/about`, and `/exit` are implemented locally.

Tool calls arrive in order and animate while pending. The default view keeps them as compact headers; activity level 4 reveals clickable cards with their scripted output.

## Customization

- Edit scenario copy and tool data in `SCENARIOS` inside `demo.js`.
- Edit color tokens at the top of `styles.css`.
- Resize the containing iframe; the context sidebar is hidden below 760px.
- Do not add real API keys or provider endpoints to this folder. The intended artifact is entirely static.
