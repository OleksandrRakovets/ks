# Match List Live Scores Frontend Specification

## Status and Scope

Implemented and browser-verified with the redesigned Match list.

The backend contract is specified in `match-list-live-scores-backend-spec.md`. This document owns list presentation, route-local state, and browser polling behavior. The first slice displays one page under the backend's active-first, newest-first ordering, defaulting to 10 Matches and permitting at most 20. “Displayed” means included in the rendered page, not intersecting the browser viewport.

The Match list polls compact score projections approximately every 30 seconds. It does not subscribe to every Match or update for every accepted ball. Individual Match pages retain their separate live transport.

## Presentation Semantics

Each Match row presents:

- both participant names and the game title;
- frames won by seats A and B for multi-Frame Matches, plus the target number of wins while Active;
- current or final points by seat for a single-Frame Match;
- the active Frame number when a Frame is prepared or in progress;
- Active or finished lifecycle presentation.

Finished rows omit the target number of wins because their final score already communicates the result.
Their start timestamp uses the browser's current time zone: `HH:mm` when the Match started today,
`DD.MM` on another day in the current year, and `DD.MM.YYYY` in another year. It does not use
relative dates.

Sections use one column on narrow screens and two columns on desktop. Active cards retain a green
status dot and restrained green border without a tinted fill; their player names use regular weight.
Finished cards continue to emphasize the winner and mute the loser.

`activeFrame` is absent before the first Frame is prepared, between Frames, and after the Match finishes. The most recently completed Frame must not be presented as though it were still active. A prepared but not yet commenced Frame is active and displays its initial score.

The route chooses the score representation. It uses `framesWonBySeat` when `matchTargetFrames` is greater than `1`; otherwise it uses `singleFramePointsBySeat`, falling back to the initial 0–0 Match score before the first Frame exists.

The lifecycle badge and link destination must use the same merged row state. The UI may indicate that scores refresh periodically, but it should not commit unchanged score overrides, animate every unchanged response, or announce all rows to assistive technology every cycle.

## Browser State Ownership

Loader data owns the current page, row membership, ordering, participants, game metadata, and the initial score. Polling may override only the score and lifecycle of a retained row. Page navigation replaces loader membership and therefore the polling batch.

Keep polling overrides in route-local reducer state keyed by `MatchId`. Render by mapping the current loader entries and merging any newer override; an override never creates a row absent from current loader membership. Later loader data is authoritative for added, removed, or reordered rows without discarding a newer polled score for a retained row.

Merge rules are exhaustive:

- a higher `latestSeq` replaces score and lifecycle;
- a lower `latestSeq` is ignored;
- at equal sequence, `finished` replaces the entire active projection;
- finished lifecycle is absorbing, so an active response never reactivates a finished override.

New loader IDs start from loader data. Removed IDs are no longer rendered or polled; stale overrides may be pruned as ordinary reducer housekeeping. A response from an effect instance that has already been cleaned up is ignored.

`useSyncExternalStore` is not needed for this route-local state. It would require introducing an external store while still needing subscription setup and cleanup to own polling. A reducer plus an effect follows React's ownership model with fewer layers. Reconsider an external store only if multiple independently mounted consumers need the same polling snapshot.

## Poll Request and Response

On each poll, collect the IDs whose merged lifecycle is active and request:

```text
GET /api/sparring-matches/scores/?matchId=:id&matchId=:id...
```

Validate successful JSON with the backend's exported `MatchScorePollResponse` schema. Then compare the response IDs with the IDs captured for that request. It must contain exactly one entry per requested ID, in request order, without duplicates or additional IDs. A mismatch fails the response and applies no entries. This check needs no additional schema or partial-result model.

A successful response is a replacement projection for every requested row, not a sequence of scoring deltas. It is safe to skip any number of intermediate ball-level changes.

## Browser Polling Behavior

The list route owns one polling effect for the batch, not one effect per row. The effect keeps its timeout, current request, event handlers, and disposed flag in its setup closure. Cleanup symmetrically cancels those resources. It does not use refs to suppress React Strict Mode's development setup-cleanup-setup cycle; each setup is independently valid and each cleanup fully disposes its setup.

- Start the first timer from complete loader data; do not issue an immediate duplicate poll after hydration.
- Poll approximately every 30 seconds while at least one displayed Match remains active.
- Add per-cycle jitter, for example ±10%, so clients do not remain synchronized.
- Schedule the next timeout after the current request settles rather than using `setInterval`.
- Permit at most one request in flight. Visibility or focus triggers do nothing while that request is active.
- Abort the in-flight request and cancel timers when the route unmounts.
- Pause timers while `document.visibilityState` is `hidden`.
- Poll when the document becomes visible or the focused window is visible. The shared in-flight guard coalesces adjacent browser events without a separate deduplication mechanism.
- Keep the last successful score and lifecycle presentation after network, server, or response-validation failure.
- Retry on a later scheduled or visibility-triggered poll; do not clear scores or reload the document.
- Stop polling after every displayed Match is finished.

Finished rows are removed from subsequent poll URLs. Their final score remains rendered from the successful poll result. New Matches created after initial navigation are outside polling membership; normal navigation or an explicit list refresh discovers them. Polling does not re-fetch full list metadata merely to discover membership.

The initial slice adds no separate application request deadline or focus-event debounce. Browser request behavior, the in-flight guard, and effect cleanup are sufficient until observed failures justify more machinery.

## Browser Call Stack

```text
30-second poll becomes due
  -> collect displayed IDs whose merged status is active
  -> GET compact batch score endpoint
  -> check HTTP success
  -> validate MatchScorePollResponse
  -> verify exact requested ID sequence
  -> dispatch one reducer action for the complete response
  -> reducer applies sequence and absorbing-finished rules
  -> finished rows leave the next poll's ID set
```

Visibility catch-up uses the same path:

```text
document becomes visible or focused while visible
  -> if no request is active and active membership is nonempty
     -> clear the scheduled timeout
     -> run one compact batch poll
     -> schedule the next jittered timeout after settlement
```

## Failure and Consistency Behavior

- Polling provides bounded staleness, not command-by-command delivery. Under normal visibility and connectivity, the list converges within approximately one polling interval plus request latency.
- A lower sequence cannot regress a row.
- Hiding a tab permits temporary staleness; visibility-triggered polling catches up.
- A failed batch leaves all rows at their last successful state. No row resets to zero or becomes finished by omission.
- Malformed, incomplete, duplicate, reordered, or unrelated response entries fail the whole browser application of that response.

## Implementation and Verification

The route implements the redesigned score rows, page navigation, route-local score overrides and merge rules, and one batched polling effect with sequencing, visibility, focus, jitter, cancellation, and terminal removal behavior.

Browser verification covered:

- 20 simultaneous Active Matches in one maximum-size polling batch and navigation to the following page;
- asymmetric multi-Frame and single-Frame scores;
- mobile 390×844 and desktop 1280×900 layouts;
- a completion transition that retained final single-Frame points, changed lifecycle and destination together, and removed the finished Match from later poll requests;
- hidden-tab and focus catch-up;
- failed-poll retention;
- the finished-only second page and empty presentation.

New automated coverage remains subject to `AGENTS.md`: update existing tests required by the changes, and seek approval before adding focused regression test files or materially expanding a suite.
