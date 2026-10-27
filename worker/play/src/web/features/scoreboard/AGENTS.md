# Scoreboard

The stream **Scoreboard** (see `worker/play/GLOSSARY.md`) is the public, read-only score display of one match, composited over the camera picture. Visual rules live in `worker/play/docs/design.md` (Stream scoreboard); this file covers intent, structure, and the vocabulary used to discuss its parts.

## Consumers

- **OBS browser source** (now): `/sparring/match/<game>/<matchId>/scoreboard/?layout=compact|wide&theme=default&names=full|short`, with the usual `/en` prefix for English copy. The route stays with the sparring match routes; this feature owns everything it renders.
- **Scoreboard entity page** `/scoreboard/<id>/` (BIL-12) reuses `ScoreboardPage` with a different loader.
- **Streamer** (BIL-100) rasterizes the same artwork from a server-rendered SVG, so the artwork must render without a browser page.

Design for a 1080p canvas: the stage is 1920×1080 and each layout's page shows only its source area of it. Scaling to other canvas sizes is a consumer concern.

## Structure

```text
values.ts   ScoreboardValues: the only input the artwork accepts
present/    match read → values; the only place games differ
artwork/    pure SVG: geometry (layouts, boxes, bar outline) and one module per part
themes/     palettes and their registry
page/       document CSS, fetcher reads, recovery, live revalidation, scaling to the source area
```

- `present/` has one presenter per gameplay machine, named after it: `strila-v2`, `pyramid` (free, combined, old rules), and `long-free-pyramid`. A presenter resolves a game's size and the values only its games show (targets, centre, balls, tips). `presentScoreboard` resolves the values every game shares and picks the presenter for each game key.
- The artwork never reads a game key. Parts draw from the shape of the values: a centre kind, a non-null ball row, tips, and targets. When a game needs something new, add a value shape and a part, not a game check in the artwork.
- The artwork is a pure function of its props: no hooks, no context, and inline presentation attributes only. Copy is resolved in `present/`.
- Themes change paint only: colours and opacities. Layouts own geometry, font sizes, and radii. The digit advances in `geometry.ts` are measured for the system UI font stack, so a different font needs its own measurements. To add a theme, add a palette file and its key to `ScoreboardTheme` and `SCOREBOARD_THEMES`; to add a layout, extend `ScoreboardLayout` and `LAYOUTS`. The route validates the URL against these lists.
- Ball colours are physical and shared with the app's balls (`STRILA_BALL_PALETTE`), not themed.

## Document

Stream pages are not part of the app's look. `routes/layout-scoreboard.tsx` is a sibling of `layout-base` and imports no app stylesheet, so Tailwind, app themes, and the app's colour scheme never reach the stream document. The page's own `<style>` is its whole document CSS. Keep scoreboard routes under that layout, and never style the scoreboard through app CSS, Tailwind classes, or the theme cookie. The root layout still sets the app theme class on `<html>`, which has no effect without the stylesheet.

Reads keep the last good state and never show an error; see the stream scoreboard exception in `worker/play/AGENTS.md`.

## Vocabulary

Use these names when discussing or changing a part. Rendered parts carry the matching `data-part` attribute (plus `data-seat`, `data-kind`, `data-ball`, or `data-status` where relevant), so a part can be found in devtools or a browser test. Left is seat A and right is seat B. The **inner edge** faces the centre; the **outer edge** faces the stage edge.

| Term | `data-part` | What it is |
| --- | --- | --- |
| Stage | | The 1920×1080 design canvas. |
| Source area | | The part of the stage a layout's page shows: the union of its boxes across games, so one OBS source size fits every match. |
| Box | | The artwork's fixed size and anchor for one layout and game, the same in every state. |
| Ball row | `ball-row` | Strila's balls above the bar, on the **ball tray** (`ball-tray`). Each **ball** (`ball`) is enlarged when on and dimmed when potted. |
| Bar | `bar` | The dark background shape: a centred bar in compact and a full-width band in wide. It extends down under the parts that use the secondary row. |
| Primary row | | The top row of the bar: name plates, points boxes, centre. |
| Secondary row | | The bottom row of the bar, shown only with content: tips, the target row, and the handicap label. |
| Seat side | `data-seat` group | One player's name plate, points box, target, and tip. |
| Name plate | `name-plate` | The player's name, aligned to the inner edge and clipped, never fitted. |
| Breaker slot | | Reserved space between a name plate and its points box for a breaker/shooter marker. Not drawn yet. |
| Points box | `points-box` | Current frame points, or the match score in long pyramid. |
| Target | `target` | A per-seat target under the points box; together they form the **target row**. |
| Centre | `centre` | The block between the points boxes. Its kinds (`data-kind`) are: **frames** (**frames won** `frames-won` around the **race** `race`, as in `1 (3) 0`), **target** (long pyramid's bare target), and **separator** (a colon when long pyramid's targets differ). |
| Handicap label | `handicap-label` | "Handicap" under a frames centre when the target row shows. |
| Tip | `tip` | One viewer tip under a name plate, aligned to the inner edge. |
| History slot | | The free centre of the secondary row, reserved for frame history. Not drawn yet. |

Keep this table in step with the code when adding, renaming, or removing parts.

## Tests

- `present/present.test.ts` asserts presentation decisions as semantic values (centre kind, targets, tips, sizes); keep game-rule matrices in gameplay.
- `packages/play-e2e/test/scoreboard.e2e.ts` covers live wiring, failed-read recovery, the document's lack of app CSS, and standalone rasterization. Inspect visual changes in a browser; do not unit-test JSX.
