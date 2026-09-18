# App Shell And Pages — Additions

Status: design approved, blocked on data or flows that do not exist yet.
Reference renders: `.tracker/app-shell-and-pages/`.
Prerequisite: `.tracker/app-shell-and-pages-spec.md`, which is buildable today and must land first.

Each item below states exactly what it is waiting on, so it can be picked up the moment that
arrives. Nothing here is speculative design — all of it is drawn in the reference renders. It is
separated only because the plumbing is missing.

## 1. Matches rows

**Implemented.** `MatchListEntry.score` carries the compact score projection and `latestSeq` carries
its Accepted Command version. Active projections come from MatchRoom; finished projections are
stored on the D1 Match row.

Today the list can print two names and a game title, which is exactly why it reads as a database
dump. The redesign turns each row into a small scoreboard, and that needs a score.

```ts
readonly latestSeq: NonNegativeInteger
readonly score: {
  readonly framesWonBySeat: BySeatNumber
  readonly singleFramePointsBySeat: BySeatNumber | null
  readonly matchTargetFrames: PositiveInteger
  readonly activeFrame: { readonly frameIndex: PositiveInteger; readonly pointsBySeat: BySeatNumber } | null
}
```

The route picks which score to show — frames when `matchTargetFrames > 1`, current frame points
when it is 1, since `free-pyramid-long` is one frame to a point target. That decision stays in the
route rather than being resolved in `@ks/application`, following the documented boundary that
routes own presentation adaptation.

Row shape, based on the `matches.png` render:

- Two stacked names with their scores right-aligned, then a meta line with the game and start
  timestamp. In the browser's current time zone, the timestamp is `HH:mm` today, `DD.MM` on another
  day in the current year, and `DD.MM.YYYY` in another year.
- Winner's name and numeral in `--hi` / `--bone` at 600; loser's in `--t-secondary` / `--t-muted`.
  This deliberately echoes the match Board so the two surfaces read as one product.
- Active matches first under `Зараз грають`, with a green dot, a green-tinted border, and the
  current frame in place of a time.

**The time is the match start (`createdAt`)**, not the end. It is the only timestamp every row has,
so the column never changes meaning between an active and a finished row, and a match running past
midnight stays with the evening the players sat down.

## 2. Day grouping on Matches

**Waiting on:** a decision about time zones.

Grouping finished matches under `Сьогодні` and dated headings needs a local zone, and the app has
none — `loadMatchProtocol` hardcodes `'UTC'`. Two workable routes:

- Plumb a zone the way `readMatchProtocol` already accepts one, sourced from a cookie set on first
  client render.
- Group after hydration on the client, accepting that the first paint is ungrouped.

Until this is settled the list ships ordered but ungrouped. **Do not print a local day derived from
`'UTC'`** — a wrong date is worse than no date, and this one would be wrong for every Ukrainian
user for two to three hours of every day.

## 3. Result closing line

**Waiting on:** `endedAt` reaching the finished control result.

Per AGENTS.md the match-completing Accepted Command already stores `endedAt` alongside Final Match
State, so the value exists in D1. It is simply not on `MatchState` or on the `controlState:
'finished'` variant of `ReadMatchControlResult`.

Once exposed, add one centred line below the frame list: `Завершено сьогодні о 19:42`. It shares
the time zone problem in §2 and should not ship before that is settled either.

## 4. Rematch

**Waiting on:** a way to open Setup with players and settings prefilled.

`Реванш тим самим складом`, pinned above the tabs on the Result screen, linking to Setup for the
same game with both names already filled in. It is the thing players predictably want next, and the
lower half of the Result screen is otherwise empty.

The Setup route currently takes only `:gameKey` and holds names in component state, so this needs
either query parameters the route reads into its initial state, or a dedicated entry point. Whoever
implements it should decide which, and keep in mind:

- Seats should probably swap, since the loser breaking or choosing is the usual courtesy. Worth
  asking rather than assuming.
- Per-seat targets and race length should carry over — a 50:15 handicap is a property of the pair,
  not of one match.
- The toss must still be thrown. It is mandatory by design and a rematch is not an exception.

This was my proposal rather than a request, so it is the easiest item here to cut.

## 5. Acceptance

Once the blockers clear, verify at 390×844 and 1280×900:

1. Matches with an active match, two finished matches, and the empty state.
2. Matches where one entry is `free-pyramid-long`, showing points rather than frames.
3. Matches where a match started yesterday and finished today, confirming it groups under
   yesterday.
4. Result with the closing line, in a zone other than UTC.
5. Rematch landing on Setup with both names present and the toss unthrown.
6. `Костянтин Кулик` and `Владислав Косогов` throughout.

**Do not add test files or expand coverage.** Update existing tests only where a change breaks them.
