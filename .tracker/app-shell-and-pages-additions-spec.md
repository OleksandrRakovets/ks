# App Shell And Pages — Additions

Status: implemented.
Reference renders: `.tracker/app-shell-and-pages/`.
Prerequisite: the implemented `.tracker/app-shell-and-pages-spec.md`.

These additions were separated from the App Shell slice because they originally required missing
data or flows. The implementation status and durable behavior are recorded below.

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
  readonly frameTargetPointsBySeat: BySeatNumber
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

**Implemented.** Request-scoped time zones format and group completed matches by their local start
date. Finished rows are ordered by `createdAt`, so groups remain contiguous and an overnight match
stays under the day when play began.

Groups use `Сьогодні` / `Today` for the current local day and `DD.MM.YYYY` otherwise.

## 3. Result closing line

**Implemented.** The finished control result carries D1's canonical `endedAt`, formatted in the
requester's time zone, and the Result renders the centred completion line below the frame list.

Same-day copy reads `Завершено сьогодні о 19:42`; other days include `DD.MM.YYYY`.

## 4. Rematch

**Implemented.** `Реванш тим самим складом` opens Setup through a validated all-or-nothing query
payload. It preserves seats, names, race length, per-seat targets, and Long Pyramid rack rollover.
The mandatory toss remains fresh and unthrown.

`Реванш тим самим складом`, pinned above the tabs on the Result screen, linking to Setup for the
same game with both names already filled in. It is the thing players predictably want next, and the
lower half of the Result screen is otherwise empty.

Malformed, incomplete, or wrong-game query payloads fall back entirely to ordinary Setup defaults.

## 5. Acceptance

Verify at 390×844 and 1280×900:

1. Matches with an active match, two finished matches, and the empty state.
2. Matches where one entry is `free-pyramid-long`, showing points rather than frames.
3. Matches where a match started yesterday and finished today, confirming it groups under
   yesterday.
4. Result with the closing line, in a zone other than UTC.
5. Rematch landing on Setup with both names present and the toss unthrown.
6. `Костянтин Кулик` and `Владислав Косогов` throughout.

**Do not add test files or expand coverage.** Update existing tests only where a change breaks them.
