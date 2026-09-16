# Match Control Shell And Zone Contract

Status: implemented. Correction behavior and finished-match presentation remain deferred.
Reference renders: `.tracker/match-control-shell/`.

## 1. Purpose

Replace the layout of the Sparring match control screen with a shell and a three-zone action
contract shared by every game runtime.

Problems being fixed, all observed during real play:

- Uniformly sized control buttons no longer fit the control set, and Ukrainian labels stopped
  fitting one line at that size.
- The Strila ball tray sits two rows below the button that consumes a selection, with `Фол`
  in the tap path between them.
- After a misclick there is no affordance on the control screen; players hunt for one.
- `frame.concede` occupies the play surface although it is used in well under 1% of matches.
- Strila's penalty selection is treated as extra rows, so the screen threatens to scroll.

Scope is `apps/play/web` presentation, one `@ks/application` contract addition, and the gameplay
presentation metadata needed to render the shell. Gameplay rules and machines do not change.

The active Protocol page shares the Match Shell and Board. Further Protocol polish, the
finished-match result view, the app shell and burger used by non-match pages, `/`, and the
Correction command itself are out of scope and tracked separately.

## 2. Vocabulary

CONTEXT.md remains authoritative. This document adds presentation-only terms.

| Term            | Meaning                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| Match Shell     | Chrome wrapping both match tabs: top bar and bottom tabs.                               |
| Board           | Non-interactive scoreboard pinned to the top of the shell.                              |
| Action Stack    | Interactive region anchored to the bottom of the shell.                                 |
| Zone            | One horizontal band of the Action Stack: Selector, Primary, or Secondary.               |
| Takeover        | Single decision surface that replaces all three Zones.                                  |
| Last Action Bar | One-line confirmation of the latest potentially correctable player action, and its Correction affordance. |
| Overflow Sheet  | Bottom sheet holding every tertiary Control.                                            |

"Undo" must not appear in code, copy, or key names. A Correction compensates for an earlier
Accepted Command without removing it from the record, so the Ukrainian label is `Виправити`.

## 3. Layout model

```
┌──────────────────────────────────────┐
│ ✕   Партія 2        до 3 перемог   ⋯ │  Top bar        52px, fixed
├──────────────────────────────────────┤
│ Костянтин Кулик    Владислав Косогов │
│    6 /9    1:1    /9 4               │  Board          fixed, content-sized
│    ● ● ●            ● ●              │
├──────────────────────────────────────┤
│                                      │
│                                      │  Slack          flex: 1, may reach 0
│                                      │
├──────────────────────────────────────┤
│ Обери забиті кулі                     │  Selector zone  optional
│ ○ ○ ○ ○ ○ ● ● ○                      │
├──────────────────┬───────────────────┤
│    Забити ● ●    │    Забити ● ●     │  Primary zone
├──────────────────┼───────────────────┤
│       Фол        │        Фол        │  Secondary zone
├──────────────────┴───────────────────┤
│ Костянтин Кулик                      │  Last Action Bar
│ Забиття (зелена) 6:4    [ Виправити ]│
├──────────────────────────────────────┤
│      Керування    │     Протокол     │  Tabs           fixed
└──────────────────────────────────────┘
```

Invariants:

- The shell is `100dvh` with `overflow: hidden`. **The control screen never scrolls.** If a
  future control set cannot fit, that is a signal to move controls to the Overflow Sheet, not to
  add a scrollbar.
- Board is pinned top, Action Stack is pinned bottom, slack absorbs the difference. Controls
  therefore land in the same thumb region on every screen size and in every game.
- Within each responsive spacing tier, slack absorbs all remaining height before controls. The
  Action Stack uses a consistent 14px rhythm below 740px, 16px from 740px, and 20px from 820px.
  This rhythm applies between controls and at the top and bottom of the raised section.
- Must fit 375×667 through 430×932 in every state listed in §12.
  **Surfaces carry the structure; lines almost never do.** Three tones, no dividers between them:

| Region                                                        | Surface       |
| ------------------------------------------------------------- | ------------- |
| Top bar, Board, slack, Last Action Bar, tabs                  | `--c-deep`    |
| Action Stack — Selector, Primary, Secondary, and any Takeover | `--c-raised`  |
| Controls sitting on the raised surface, and the active tab    | `--c-overlay` |

The raised block running from the Selector zone down through the Secondary zone is what says _this
is the part you touch_, and it does that job better than the six hairlines it replaces. Keep the
tonal steps far enough apart to survive a dim screen at an angle in a club; the values were pushed
apart once already for exactly this reason, and they need checking on a real phone.

The **only** rule on this screen is the lane spine. It divides two otherwise identical halves,
which is what a line is for. Do not reintroduce borders between the Board and the stack, above the
Secondary zone, above the Last Action Bar, or under the top bar.

- At `≥768px` the shell content is capped at `560px` and centred. This is deliberate: the screen
  is a phone-shaped task surface used at the table, and a wide desktop variant would need its own
  interaction study. Revisit only with evidence.

## 4. Top bar

| Slot    | Content                       | Notes                                                                              |
| ------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Left    | ✕ icon button, 44×44          | Navigates to `/sparring/matches/`. The only exit. No global nav here.              |
| Context | 17px/600, nowrap              | Multi-frame games: `Партія {n}`. `free-pyramid-long`: `Піраміда {rackNumber}`.     |
| Rule    | 16px, `--t-primary`, nowrap   | Multi-frame: `до {n} перемог`. `free-pyramid-long`: `нова з {rackRollover}`.       |
| Right   | ⋯ icon button, 44×44          | Opens the Overflow Sheet. Rendered only when tertiary Controls exist.              |

The Rule slot holds the match-level rule that the numerals do not already show. It has roughly
180px, about **17 characters at 16px**, once ⋯ is present. Copy exceeding that must be shortened,
never truncated or auto-shrunk.

## 5. Board

Four slots, top to bottom. Slots 3 and 4 are optional and supplied by the game.

**1. Names.** Both participants' `displayName`, 18px/600, `line-height: 1.22`, seat B
right-aligned. Wraps at spaces to as many lines as needed; the two names bottom-align so the
numerals below stay on one line. Keep 8px between the names and scores. No ellipsis, no initials,
no measurement-based fallback.

**2. Scores.** Three columns.

- Frame points: 66px/800, `tabular-nums`, `--bone`, outer-aligned per seat.
- Target suffix `/{frameTargetPointsBySeat[seat]}`: 20px/500, `--t-muted`, inboard of the points.
  Always shown; per-seat handicaps therefore display correctly with no extra work.
- Step-down: if either seat's points or target renders three or more digits, points drop to 56px.
  This is one deterministic step, not text auto-fitting. Auto-fitting is prohibited anywhere in
  this screen because it makes size stop meaning importance.
- Spine slot, 52px minimum, centred. The shell derives it: when
  `state.targets.matchTargetFrames > 1`, render `{framesWonBySeat.A}:{framesWonBySeat.B}` at
  22px/700 with the label `партії` at 14px beneath. Otherwise render nothing.
  `free-pyramid-long` is fixed at one frame, so its spine is empty and its numerals get the width.

**3. Reconciliation row.** Optional. Two columns spanning the full width with no spine slot, so
the dots get the width the numerals do not need. Dots are 13px circles with the ball shadow
treatment, outer-aligned per seat, wrapping when needed.

- `strila-v2`: `details.pottedBallsBySeat`, coloured to the physical balls.
- `free-pyramid-long`: `details.currentRack.scoreBySeat`, cream (`#F2EDE1`), **chunked into groups
  of five** with an 11px gap between groups and 4px within.
- Pyramid variants: absent.

The chunking is the point of the feature. Long Pyramid runs long enough that shelf counts drift —
a player forgets to shelf a ball, or miscounts — so this row exists to be compared against the
physical shelf. Chunking makes the app side readable at a glance so only the shelf needs counting.

**4. Aux row.** Optional, centred, 16px `--t-secondary`, separated by spacing only. It reads as part
of the reconciliation block above it, which is correct: potted plus on-table is the whole rack.

- `free-pyramid-long`: `на столі {ballsOnTable}` with the numeral in `--t-primary`/600.
- All others: absent.

## 6. Action Stack zones

Populated from `groupControlsIntoSections(controls)`.

| Bucket      | Destination                                           |
| ----------- | ----------------------------------------------------- |
| `primary`   | Primary zone, per seat                                |
| `secondary` | Secondary zone, per seat                              |
| `tertiary`  | **Overflow Sheet only. Never rendered in the stack.** |
| `neutral`   | Takeover (see §7)                                     |

The tertiary rule is structural, not a special case for concede: `frame.concede` already declares
`prominence: 'tertiary'` in `packages/competition/src/sparring-match.ts`. Any rare Command encoded
later inherits the placement by declaring its prominence, with no UI change.

**Selector zone.** Optional, game-supplied, full width, immediately above the Primary zone with no
intervening element. Only `strila-v2` uses it today, for the shared eight-ball tray. Adjacency to
the Primary zone is a hard requirement: the tray is step one of a two-step action and nothing may
sit in the path between them. Its hint remains `Обери забиті кулі`; selecting balls must not change
the copy or shift the layout. Object balls use the full 48px selector cell while the cue and black
balls remain at most 38px, preserving the object treatment.

**Primary zone.** Two lanes split by a 1px spine. Filled `--a-green`, 18px/600, `min-height: 60px`.

**Secondary zone.** Two lanes on `--c-overlay`, 18px/600, `min-height: 50px`. It follows the same
responsive 14/16/20px rhythm as the other controls and section edges; equal prominence does not
imply different spacing. Its recessed surface keeps `Фол` distinct from the Primary zone.
`foul.commit` takes red text on the same recessed surface; every other secondary Control takes
`--t-primary`. No outlines — a red-outlined button reads louder than a filled recessed one, which
is backwards for a control we deliberately demoted.

**Arity within a lane.** Deterministic, no measurement:

- Every label in the lane is three characters or fewer: two-column grid inside the lane. An odd
  final item spans both columns. Long Pyramid's four pot Controls therefore render 2×2, which is
  roughly 80×58 per key instead of the 40px-wide single row.
- Otherwise: one Control per row, full lane width.

**Labels wrap to two lines** with a fixed `min-height` rather than shrinking. `Визнати поразку`
and similar must be allowed to wrap.

## 7. Takeover

A Takeover replaces the Selector, Primary, and Secondary zones entirely. It is not an additional
band, so it costs no extra height.

Rendered when either:

- `controlState === 'between-frames'`, i.e. the projection offers seatless `neutral` Controls; or
- the game renderer returns one.

Strila returns one for phase `foul-committed.penalty-selection`. This is safe and verified: that
phase's projection in `packages/gameplay/src/strila-v2/projections/control.ts` returns **only** the
three `penalty.select` Controls, all belonging to the chooser. No pot or foul Control coexists with
them, so nothing is hidden by the swap.

Guidance for future games: use a Takeover when the projection presents a choice that must be
resolved before scoring can continue. Do not use one merely because Controls belong to a single
seat — a frame-point state, where one lane offers `frame.award` and the other offers nothing, stays
in the normal zones.

Structure:

- Title, 17px/600. Two clauses: who acted, then who must respond, the second in `--t-secondary`.
  `Владислав Косогов зробив фол.` / `Костянтин Кулик обирає продовження.`
- Optional note: rulebook guidance on the borderless `--a-blue-dim` surface at 16px. Strila
  supplies this from its existing rule notes; other games omit it.
- Buttons: full width, stacked, `min-height: 62px`, raised surface with a border. Primary label
  18px/600, with the `control.effect` rendered beneath at 14px via `match.control.effects.*`.

Use the existing i18n strings for penalty labels — `Прийняти позицію`, `Передати позицію`,
`Куля з руки`. The reference renders show earlier draft wording; the resource file wins.

This replaces `BetweenFrameControls` in `apps/play/web/routes/match/shared.tsx`.

## 8. Last Action Bar

Present once the match has a player-authored Protocol entry that a future Correction could
compensate for. Select the latest such entry at or before the Control read's Accepted Command
cursor; later system-authored entries do not replace it. The bar sits between the Action Stack and
the tabs, in both normal and Takeover states.

- Line one: actor `displayName`, 16px/600.
- Line two: the rendered Protocol message, 16px, with the resulting score at 14px `--t-muted`.
  Two lines maximum.
- Right: `Виправити` on `--c-overlay`, `min-height: 44px`, 16px, with a counter-clockwise arrow
  icon.

The bar sits on `--c-deep`, dropping back out of the raised Action Stack. That tonal break is
load-bearing: while the bar shared the stack's surface and left padding, it read as belonging to
seat A's lane, so an entry about seat B looked misfiled.

**Always name the actor, and never let position carry it.** The single most likely mistake this bar
exists to catch is recording an action against the wrong player, and position is the weakest
possible signal for precisely that error — a wrong-seat tap would show up only as a subtle shift,
while a name states it in words. This is not duplication of the Board: the name above labels a lane
in the live state, the name here labels a past event.

**Do not mirror the bar for seat B, and never move `Виправити`.** A fix button that changes sides
depending on who last acted is a moving target for a control pressed under time pressure, sometimes
twice in succession.

This is the confirmation loop. The observed failure was a player mis-tapping and then searching for
a fix, so the record of what was just accepted and the control that corrects it are deliberately
the same object.

**Sequencing.** The Correction Command does not exist yet. Ship the bar's confirmation line with
this work and leave the button to the Correction task, which owns its behaviour, its rejection
handling, and its Protocol representation. This document owns only its placement and label.

## 9. Overflow Sheet

Opened by ⋯ in the top bar — the farthest point on the screen from the thumb region, which is the
correct distance for controls used in under 1% of matches.

- Reuse the existing `Sheet` primitive from `@/components/ui`, bottom-anchored.
- Title `Інші дії`, 19px/600, with a ✕ dismiss.
- One group per participant, headed by their `displayName` at 16px/600 `--t-secondary`, separated
  by spacing rather than a rule. Within a group, one button per tertiary Control on `--c-overlay`,
  full width, `min-height: 56px`, 18px/600.
- Groups render in seat order A then B, and a group with no Controls is omitted.

## 10. Tokens

Colour, on the existing Club Terminal variables. **No per-seat hue.** Seat attribution comes from
the lane, the name above it, and the spine; a tinted comparison was rendered and made both buttons
worse. Do not introduce generated or per-player colours without a separate decision.

| Role                                | Token                                  |
| ----------------------------------- | -------------------------------------- |
| Commit / primary action             | `--a-green`                            |
| Pending selection, not yet recorded | `--a-amber` (tray selection ring only) |
| Foul                                | `--a-red` text on `--c-overlay`        |
| Rulebook note                       | `--a-blue-dim`, no border              |
| Score numerals                      | `--bone`                               |

Typography uses the system stack. No webfont: the app must stay usable on club connections.

**Minimum font size is 16px.** 14px is permitted only for these, and nothing else on this screen:
the spine label `партії`, the Selector zone hint line, the Takeover effect subtitle, and the score
suffix in the Last Action Bar. The score target suffix is 20px and is not an exception.

## 11. Required changes

**`@ks/application`** — one contract addition. `ReadMatchControlResult`'s `frame-active` and
`between-frames` variants gain the latest player-authored, potentially correctable Protocol entry
at or before the Control cursor:

```ts
/** Latest potentially correctable player entry for the control surface's confirmation line. */
readonly lastEntry?: Pick<ProtocolRow, 'key' | 'message' | 'score'>
```

`timeLabel` is deliberately excluded so `readMatchControl` does not need a time zone parameter; the
bar shows no timestamp.

**`packages/i18n`** — new keys for the Overflow Sheet title, the Correction label, the Takeover
titles, and the Aux row. Pyramid scoring keys show `+{{pottedBallCount}}`; the plus identifies the
score change while the separate accessible-name key states the full action and participant.

**Gameplay presentation** — Long Pyramid exposes `rackRollover` in its presentation state and
declares all four pot Controls primary so the renderer can place them together in the 2×2 keypad.
These are presentation projection changes, not gameplay rule or machine changes.

**New** — `apps/play/web/features/match-control/shell/`: `MatchShell`, `Board`, `ActionStack`,
`Zone`, `Takeover`, `LastActionBar`, `OverflowSheet`. Consumers import components directly from
their files; the directory has no export bundle. Primary export first, private helpers below.

**Removed** — `MatchNavigation` (`apps/play/web/features/match-navigation.tsx`), `ScoreBox`
(`apps/play/web/routes/sparring-match/score-box.tsx`), `BetweenFrameControls` in `shared.tsx`, and
the `showMore`/`showLess` tertiary disclosure in both the Strila and Long Pyramid renderers. Their
i18n keys go with them.

**Adapted** — the five concrete, game-keyed control routes under `apps/play/web/routes/match/`
compose the shell instead of `MatchNavigation` + `ScoreBox`. The five concrete Protocol routes use
the same shell and Board so the tabs and exit stay identical across both tabs while preserving each
route's concrete schema and types. Per-game renderers keep
`MatchControlRendererProps` and return zone content rather than their own sections.

## 12. Acceptance

Verify at 390×844 and at 375×667. No scrollbar and no clipped content in any state:

1. Strila open play, with and without `miss.record` offered.
2. Strila open play with a two-ball selection pending.
3. Strila penalty selection, including the rulebook note.
4. Strila ball-in-hand and respotted-black phases.
5. Long Pyramid open play, 2×2 keypad, both `rackRollover` values.
6. Long Pyramid with a three-digit target, confirming the numeral step-down.
7. A pyramid variant at frame point, where one lane offers `frame.award` and the other is empty.
8. Between frames.
9. Overflow Sheet open, with both participants listed.
10. Both participants named `Костянтин Кулик` and `Владислав Косогов` throughout — full names must
    wrap and never truncate.

Existing tests: `long-free-pyramid-control-renderer.test.ts` and
`apps/play/web/routes/match/shared.test.ts` will need updating where this change breaks them.
**Do not add new test files or expand coverage**; new coverage is opt-in and has not been approved
for this work.
