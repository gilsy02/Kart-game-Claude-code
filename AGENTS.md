# Mario Kart 3D Project Context

- Project Home: `C:\Users\길상연\OneDrive\바탕 화면\Claude Code\Kart game(Claude code)\mario-kart-3d`
- Developed with: Claude Code (GitHub: `gilsy02/Kart-game-Claude-code`)
- Core Entry: `index.html` (the whole game is this one file)
- Assets:
  - 3D Car Kit: `kenney_car-kit/`
  - Audio: `sounds/`
  - Custom GLB Models: `models/`
  - Environment (Poly Haven CC0): `assets/hdri/`, `assets/textures/`, `assets/models/` — sources in `assets/CREDITS.md`
- Target Environment: Three.js, WebGL, Web Audio API, Responsive (Desktop/Mobile)
- Tests: `npm test` = `tests/touch-test.js` (mobile touch, 3 languages) + `tests/track-test.js` (both tracks: start, AI lap 2, elevation, all themes). Headless Chrome with software GL is slow: run one test at a time, use DOM `el.click()` not Playwright clicks, and dump the minimap canvas instead of full-page screenshots.
  Env overrides: `PW_CHROME=<chromium path>` when Google Chrome is not installed, `THREE_LOCAL=<unpacked three@0.160.0 package dir>` when the jsDelivr CDN is unreachable (`npm pack three@0.160.0`).
- Touch layout (`#mobile-touch-layer` media query: coarse pointer or width <= 900px) has no pedals: `updatePlayer()` forces gas on, and holding
  DRIFT with no steering for `TOUCH_REVERSE_HOLD` frames brakes then reverses (`.reversing` on the DRIFT button) until released.

All kart game enhancements, bug fixes, and feature additions belong in this directory.

## Track system (index.html)

- **Registry** `TRACKS` (near the top, after `BOOSTER_DURATION`). Each entry:
  `{ id, controlPoints: [[x, z, y], ...], numWaypoints, defaultTheme, laps, podium: [x, z], roadWidth? }`.
  Control points form a **closed loop**; the curve is `THREE.CatmullRomCurve3(points, closed, 'centripetal')`.
  Coordinate system: **x right, z down on the minimap, y = road height**. Start/finish line is `t = 0`
  (the first control point); karts start facing the second point.
- **Adding a track** = one `TRACKS` entry + one `.theme-card[data-track="<id>"]` on the start screen +
  `I18N.<lang>.tracks.<id> = { name, desc }` for kr/us/mx. Everything else (road mesh, curbs, finish line,
  podium, minimap, theme props, lap/checkpoint thresholds) derives from the registry.
- `numWaypoints`: keep waypoint spacing at ~6–7 units (length / count). `oval` = 100, `village_highway` = 220.
- `getTrackPoint(t)` samples the curve by arc length (`getPointAt`) and clamps `y >= 0`.
  `rebuildWaypoints()` fills `waypoints[]` (same array object, do not reassign) and `wpSlope[]`, and
  auto-detects the steepest downhill run for the sidewalk (`currentTrack.sidewalk = { from, to }`).
- `applyTrack(id)` rebuilds curve/waypoints/road meshes/finish line; `selectTrack(id)` (UI) also moves
  the podium, resets kart grid, picks the track's default theme and re-applies it.
- Lap logic (`Kart.updateDistanceToTrack`) is ratio based: checkpoints at 20–35 %, 45–60 %, 70–85 % of the
  waypoint index; lap wraps from the last 12 % into the first 10 %.

## Elevation / slope physics

- `TRACK_ELEVATION_SCALE` (1 = use control-point y, 0 = flat for debugging).
- `groundAt(pos, idx)` interpolates road height between neighbouring waypoints (XZ projection).
  `kart.pos.y` lerps toward it (`GROUND_FOLLOW`); `kart.groundSlope` is the slope along the heading.
- Tuning constants live together near `TRACK_ELEVATION_SCALE`: `SLOPE_GRAVITY_DOWN` / `SLOPE_GRAVITY_UP`
  (per-frame speed change), `SLOPE_TOP_BONUS` (extra top speed downhill), `SLOPE_GRIP_DOWN`, `KART_PITCH_MAX`.
- Kart meshes use `rotation.order = 'YXZ'` (yaw, pitch, roll). Camera y is clamped above the road behind the kart.

## Track structures (per track, theme independent)

Built in `buildTrackMesh()` into `trackStructures`; constants `BRIDGE_MIN_Y`, `BRIDGE_PILLAR_GAP`, `RAIL_H`,
`SIDEWALK_W`, `SIDEWALK_H`, `SLOPE_STEEP`:
- road height `> BRIDGE_MIN_Y` → concrete parapets + two guardrail tubes per side + pillars under the deck;
  the minimap draws these sections brighter.
- slope crossing `±SLOPE_STEEP` → yellow/black warning blocks on both sides.
- steepest downhill run → raised cobblestone sidewalk on the left (grip 0.7, top speed 90 %).
- Theme props (`forEachRoadside`) skip slots where the road is elevated.

## Themes

`applyTheme(themeKey)` in index.html: `witch`, `nyc`, `joseon`, `village`. A theme sets sky (`HDRI`/`SKY_GAIN`),
fog, lights, ground texture (`setGround`), road tint and roadside props; it never changes the track shape.
`village` props are generated in `buildVillageProps()` with the `VILLAGE` constants (building slots, tree gap,
bunting gap/length, curve-sign threshold, hill gap, `maxProps` cap of 250).

## Debugging

- `?debugTrack=1` → 300 px minimap with waypoint numbers every 10 (use it when moving control points).
- `window.__game`: `tracks`, `allKarts`, `waypoints`, `selectTrack(id)`, `getState()`, `getTrack()`,
  `step(n)` (advance n physics frames while racing), `elevation`.
