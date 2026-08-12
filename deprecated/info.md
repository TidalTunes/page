# Personal Website

This repository is a simple static personal website. It has a main page, a blog page, shared CSS, and a games page. The main active project in the repo is `games.html`, which contains a self-contained ML-themed browser game called **Neural Forager**.

## Neural Forager

Neural Forager is a static-site game where a small creature moves around an arena using a user-built sparse neural network as its brain. The player edits the brain by dragging wires between nodes, selecting wires, changing connection strength, and saving the network. The creature then moves according to the resulting network output.

The core goal is to keep the creature alive by managing energy. Energy is the only success and survival unit: accelerating spends it, food restores it, and spikes remove a large chunk. When energy reaches zero, the creature stops accelerating until the arena is reset.

## Roguelike Progression

Neural Forager now starts as a smaller roguelike-style learning run instead of exposing every brain feature immediately. The HUD shows the current level and total energy consumed. As the player's brain spends energy, the run levels up at fixed score thresholds.

The level progression currently works as follows:

- Level 1 starts with only `Food dir`, `Food dist`, `Wander dir`, and `Accel dir`.
- Odd levels add new environmental complexity and matching inputs.
- Level 3 unlocks spikes plus `Spike dir` and `Spike dist`.
- Level 5 unlocks rival creatures plus `Creature dir` and `Creature dist`.
- Level 7 unlocks `Fixed dir`.
- Even levels present a choice of three locked output abilities. Choosing one adds that output node to the brain.

Graph state is persisted in `localStorage`, but each page load starts a fresh level 1 run. The arena appears behind a small start menu and remains paused until the player starts the run. Saved wires to still-locked nodes are ignored until those nodes are unlocked again in the current run.

The game pauses whenever an even-level ability choice is open, so the creature, rivals, projectiles, energy drain, and collisions wait until the player picks an upgrade.

## Arena

The game arena is drawn on a canvas. It contains:

- A small green creature.
- Food objects, starting with a simpler low-pressure layout.
- Spike obstacles after the level 3 environment unlock.
- Deterministic rival creatures after the level 5 environment unlock.
- An energy counter and energy bar.
- A level counter and energy-consumed score.
- A reset button.
- A visible vision circle around the creature.

The arena now uses a larger world than the visible canvas. The world is currently `2400 x 1800`, while the canvas acts as a camera viewport into that map. Starting or resetting a run clears run progression, places the creature near the center of the world, and centers the camera on it. The user can drag the arena or use WASD to pan around, and can scroll over the arena or use `+` / `-` to zoom in and out.

The player creature uses simple physics:

- The neural network outputs an acceleration direction.
- As ability outputs are chosen, the same brain can also output abstract signals for projectiles, dashes, electric shocks, digging, and flying.
- The creature accelerates in that direction while it has energy.
- Acceleration drains energy in proportion to output strength.
- Burst abilities spend fixed chunks of energy and have short cooldowns.
- Digging and flying are temporary continuous modes that drain energy while active.
- Velocity is damped each frame.
- Velocity is capped by a max speed.
- World edges bounce the creature back inward.

Rival creatures appear once their level unlock is reached. They move deterministically around the larger map, seek the nearest food, steer away from spikes and the player at close range, and consume food when they reach it. This creates direct resource competition without adding extra player controls.

Energy values currently use simple fixed tuning:

- Reset starts the creature at `60 / 100` energy.
- Food restores `22` energy, capped at `100`.
- Spikes remove `35` energy.
- Acceleration drains roughly `9` energy per second at full output.
- Projectiles cost `4.5` energy and briefly push rivals away.
- Dashes cost `9` energy, add a directional burst of velocity, and briefly raise the speed cap.
- Electric shocks cost `12` energy and push nearby rivals outward.
- Digging costs up to `3.2` energy per second and lets the creature pass through spikes while active.
- Flying costs up to `4.8` energy per second, preserves speed better, and raises the speed cap.

## Vision And Inputs

The creature does not receive perfect global object positions. It has a circular vision range. Objects outside this range are visually dimmed and do not contribute to the creature's sensory fields.

Unlocked objects inside the vision range are synthesized into weighted fields:

- `Food dir`: distance-weighted average direction of visible food.
- `Food dist`: nearest food distance shown in pixels, plus the count of visible food objects.
- `Spike dir`: distance-weighted average direction of visible spikes.
- `Spike dist`: nearest spike distance shown in pixels, plus the count of visible spikes.
- `Creature dir`: direction to visible rival creatures.
- `Creature dist`: nearest rival creature distance shown in pixels, plus the count of visible rivals.
- `Wander dir`: a full-strength random direction vector that switches at a user-set interval.
- `Fixed dir`: a full-strength direction vector set directly by the user.

Even though distance values are shown as real pixel distances, the network computes with normalized closeness values in a stable range. Direction inputs compute as unit vectors. This keeps connection amplitudes comparable across different input types.

The arena also renders subtle field arrows around the creature for unlocked signals:

- A food-field arrow.
- A spike-field arrow.
- A creature-field arrow.
- A wander direction arrow.
- A fixed direction arrow.

These show what the brain is receiving after the vision-weighted synthesis.

## Brain Editor

The brain editor is a compact graph editor embedded beside the arena.

The base brain starts with:

- `Food dir`
- `Food dist`
- `Wander dir`
- `Accel dir`

Additional inputs and output abilities are now unlocked by level progression rather than all being available at the beginning of a run.

Each node has connection ports. Drag from a source port to a target port to create a wire. Click an existing wire to select it. The selected wire can be edited with the amplitude slider.

Wire colors communicate connection polarity and strength:

- Red: negative connection.
- Gray: near zero.
- Green: positive connection.

The connection amplitude slider ranges from `-1` to `+1`.

The advanced output nodes are intentionally abstract. Directional outputs (`Accel dir`, `Shoot`, and `Dash`) use the direction of their incoming vector, while mode outputs (`Shock`, `Dig`, and `Fly`) use incoming vector strength as activation. This lets players wire the same sensory fields into movement, attacks, and temporary modes without learning separate control schemes for each mechanic.

## Optional Nodes

The brain starts without optional nodes. The user can add them with buttons:

- `+ Hidden`
- `+ Multiply`

Hidden nodes are optional nonlinear nodes. When connected, each hidden node independently applies a sigmoid activation to its incoming weighted signal.

Multiply nodes are optional merge nodes. A multiply node can receive up to two incoming connections, multiply their normalized contributions, and expose one outgoing source port. This makes it possible to create gated signals such as:

`spike direction * spike closeness -> acceleration`

That pattern lets the creature avoid spikes strongly only when spikes are close.

Optional nodes can be deleted with their small `x` button. Deleting a node also removes any wires connected to it.

## Brain Layout Tools

The brain editor includes graph layout helpers:

- `Snap`: moves nodes back into layered positions.
- `Fit`: fits the brain graph into the visible editor area.

Nodes can also be dragged manually. The graph area supports panning and zooming. The graph layout, optional nodes, and saved connections are persisted in browser storage.

## Preset

The `Seek/Avoid` button creates a starter network for the main intended behavior:

- Move toward the synthesized food field.
- Multiply spike direction by spike closeness.
- Send that gated spike signal negatively into acceleration.

This makes the creature primarily seek food, but begin avoiding spikes as they enter close visual range.

## Persistence

The game stores graph state in `localStorage`, including:

- Saved connections.
- Optional nodes that have been added.
- Node positions.
- Brain pan/zoom state.

The arena itself resets with the page or reset button, but the brain design persists.
