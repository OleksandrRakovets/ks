# Play UI Design Rules

Durable direction for `worker/play/src/web`. The code shows sizes and structure; this file records the
rules and reasons the code does not. Game rules and terminology remain in [GLOSSARY.md](../GLOSSARY.md);
implementation ownership belongs to [Play guidance](../worker/play/AGENTS.md).

## Shells

The app has two chrome types. Do not add a third.

- **App Shell** (game index, Matches, Setup, Result, finished Protocol): wordmark left at every
  width, burger right, no navigation links in the bar. The burger holds navigation and preferences
  and has the same content at every width through `ResponsiveMenu`. Do not show placeholders for
  future modules. Revisit links in the bar only when there is more than one module.
- **Match Shell** (Control, active Protocol): ✕ is the only exit and always returns to the live
  list, so operators at the table are not distracted. It has no global navigation and no wordmark.
  Finished pages keep the match surface and tabs below the App Shell header; the game and target
  move to a caption under the scores. The match surface width is capped at `--container-match`
  because it is a phone-shaped surface used at the table. A wide desktop variant needs its own
  interaction study first.
- Control uses a fixed viewport layout. Result and both active and finished Protocol pages share a
  reading layout: the Board, page content, and any page action scroll together between the fixed
  header and bottom tabs. Do not give Protocol rows their own scroll region.
- App Shell list and form pages compose `Page`. The page owns its title from its own loader data.
  `Page` has no subtitle slot: a line under a heading either restates it or makes claims the data
  cannot back.
  Back links sit above the title because long game names wrap.
- Copy must not claim ownership the data lacks. Match lists are global until identity exists, so
  use `Матчі`, not `Мої матчі`.

## Control screen

- It never scrolls or clips, from 375×667 through 430×932, in every phase. Game-supplied rule notes
  count toward that budget. If a phase does not fit, move rare Controls to the Overflow Sheet or
  shorten the note. Do not add a scrollbar or shrink text.
- The Board is pinned to the top and the Control Stack to the bottom. Slack between them absorbs
  height, so controls stay in the same thumb region on every phone and in every game.
- Placement comes from Control `prominence`, not from game-specific UI: `primary` and `secondary`
  go to per-seat Zones, `tertiary` goes only to the Overflow Sheet, and seatless `neutral` Controls
  go to a Takeover. A new rare Command declares `tertiary` and needs no UI change.
- Use a Takeover only for a choice that must be resolved before scoring continues. Controls that
  belong to one seat do not make a Takeover; one empty lane is normal.
- A game's selector, such as the Strila ball tray, sits directly above the Primary Zone. Nothing may
  sit between step one and the button that consumes it, and selecting must not change copy or shift
  layout.
- Sizing is deterministic: no text auto-fitting and no measured fallbacks. Labels wrap to two lines.
  Participant names always wrap and never truncate or collapse to initials. The only size change is
  the one numeral step-down for three-digit scores.
- Surfaces carry structure; lines almost never do. The lane spine is the only rule on the screen.
  Do not add dividers between the Board, Zones, Last Command Bar, or top bar. Keep the tonal steps
  far enough apart to read on a dim phone at an angle. The owner checks tonal changes on a real
  phone; agents report them as needing that check.

## Last Command Bar and Correction

- It shows the latest uncorrected player-authored Accepted Command and its outcome. System entries
  caused by that Command do not displace it. Commencement, award, and concession are not correction
  targets. Always name the actor. The error it exists to catch is scoring against the wrong seat,
  and position is too weak a signal for that.
- Do not mirror the button by seat, and never move `Скасувати`. After a Correction, show the
  preceding uncorrected Command so consecutive mistakes can be undone one by one. Hide the button
  when no correction is available; disable it only while submitting.
- Use Undo/Скасувати on the button and Corrected/Виправлено in Protocol. Preserve the original
  Command and its system outcomes with linked correction entries, following the domain's Correction
  semantics. Present them as one atomic Undo step, not separate correction targets.

## Protocol

- Rows read oldest first on active and finished pages. Seat A's lane, the score spine, and seat B's
  lane share one grid; names appear once above the lanes, never in rows. The spine colon stays in a
  fixed column with negative and two-digit scores, and the seat whose points changed is emphasized.
- Labels stay short and wrap rather than truncate: `+N`, Strila ball visuals, and plain `Фол` in every
  game, because the next score already shows the penalty.
- A corrected Command stays in its lane, struck through with ↶; its system outcomes disappear. Tapping a
  row reveals its exact time and any correction time. Five-minute markers sit in the gaps between rows.
- One band closes each frame with the match score as the Board shows it, at 24px, not larger. Long
  pyramid never presents frames: its band shows final points, and blue bands list its racks.

## Setup

- The coin toss is mandatory and has two steps: the coin decides who chooses, and the winner may
  hand the break to the opponent. Never flatten it into `A / B / Random` or add a direct breaker
  choice. In practice, throwing here is faster than the informal alternatives.
- Per-seat point targets are one field in every game. Lopsided targets such as 50:15 are the reason
  it exists, so there is no separate handicap concept or equal-targets summary.
- Settings appear only after both names are valid and different. Do not preview them in a disabled
  state. Recent players use the native `<datalist>`; do not add suggestion chips.
- The form prevents invalid states. The action repeats those checks and returns one generic 400,
  with no localized messages for states the form cannot produce.
- Rematch preserves seats, names, and settings but always starts with a fresh, unthrown toss. A
  malformed rematch payload falls back entirely to defaults.

## Game index

The shelf is curated per locale, not generated from the registry. Its editorial copy and game names
must be independently editable; Setup uses registry names. Play guidance identifies the owning route.

## Matches and Result

- Times shown in lists are the match start (`createdAt`), which every row has. Grouping uses the
  local start day, so an overnight match stays with the evening it began.
- Winner and loser styling on list rows and Result echoes the Board so the surfaces read as one
  product.

## Colour and type

- Green commits, amber marks a pending unrecorded selection, red is failure or foul, and blue-dim
  holds rulebook notes. Seats have no hue; lanes, names, and the spine attribute them. Do not add
  per-seat or generated colours without a separate decision.
- A demoted control stays demoted: `Фол` is red text on a recessed surface, not an outlined button.
- Dark is the reference theme. Light must stay legible but is not a separate visual design.
- The minimum font size is 16px. 14px is allowed only for a numeral or unit beside larger text and
  for the named control-screen annotations (spine label, selector hint, Takeover effect, Last Command
  score). Headings do not use small uppercase labels.
- Use the system font stack. No webfont, for club connections.
