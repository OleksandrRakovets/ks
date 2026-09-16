# App Shell And Pages

Status: prerequisite App Shell pages implemented. Result remains deferred with the Match Shell.
Reference renders: `.tracker/app-shell-and-pages/`.

**Everything in this document can be built today.** No contract change, no new use case, no new
data. Work that needs plumbing first is in `.tracker/app-shell-and-pages-additions-spec.md`, and
the two are ordered so this one lands first and the additions layer on without rework.

`.tracker/match-control-shell-spec.md` owns everything inside a live match.

## 1. Rebuild or port

Rebuild the composition, keep the plumbing. The two are cleanly separable here, and conflating
them would either throw away correct work or preserve the exact thing that is wrong.

**Rebuild from scratch** — every one of these renders the wrong shape, and porting would carry the
shape across:

- `apps/play/web/components/AppHeader.tsx`. Below `lg` it shows no wordmark at all: two text links
  and a burger that leads to the same two links. The brand is invisible on the only viewport that
  matters, and the navigation is duplicated.
- `apps/play/web/components/BurgerMenu.tsx`. Flat one-module list with no room for the modules that
  are coming, `text-xs` section labels, and two different idioms for the same kind of choice
  (`ToggleGroup` for theme, a pair of `Button`s for language).
- The page bodies of `sparring.tsx`, `sparring-matches.tsx`, and `sparring-init/route.tsx`,
  including the repeated "`<h1>` on the left, outline button on the right" header they each
  reinvent.
- `handle.headerConfig` in all four files that export it. It has no consumer. Delete, do not port.

**Keep** — none of these contribute to the problem, and replacing them would be churn:

- `apps/play/web/components/ui/*`. These were migrated to Base UI recently (`061c34d`) and are
  sound. They need a size and typography pass for §9, not replacement.
- `BrandWordmark.tsx`.
- Every loader, action, and validator: `sparring-init/{fields,validation,recent-players,profile,
first-breaker-toss}`, the matches loader, `createMatch`.
- The setup flow's behaviour. Progressive disclosure once both names are valid, the recent-player
  suggestions, and the first-breaker toss are good and stay exactly as they are. Only their
  presentation changes.

**One belief to correct before anyone starts.** The game list does not come from the package
catalogue. `SPARRING_GAMES` is already a hand-written literal at the top of `sparring.tsx`. It
reads like a database dump because every entry is forced into the same `{title, description}` shape
and rendered through an identical `Card`. The fix is not extraction — there is nothing to extract —
it is letting entries differ from each other. See §6.

## 2. Two shells

The app has exactly two chrome types. Nothing else may introduce a third.

|            | App Shell                   | Match Shell                          |
| ---------- | --------------------------- | ------------------------------------ |
| Used by    | Game index, Matches, Setup  | Control, Protocol, Result            |
| Top        | Wordmark left, burger right | ✕ left, match context, ⋯ right       |
| Bottom     | none                        | Task tabs                            |
| Global nav | Burger only                 | **None**                             |
| Scrolls    | Yes                         | No (control), yes (protocol, result) |

A live match is a focus surface: one exit, no global navigation, no wordmark. The App Shell is
constant across every module that ever gets added, so it never needs to grow when Clubs or
Tournaments arrive.

The Match Shell is specified in the companion document. §8 here covers only the Result tab, which
is new.

## 3. App Shell

Single component replacing `AppHeader`, used by `layout-construction.tsx` (rename it; the name is
vestigial and it is now the app layout).

- Height 60px, no bottom border, not sticky.
- Wordmark left at 34px tall, always visible, at every width. It links to the game index. The
  wordmark carries the brand and the production domain is `play.ks.ua`, so it does the work that
  `nav.newMatch` and `nav.allMatches` were doing badly.
- Burger right, 44×44.
- **No navigation links in the bar at any width.** One consistent burger for v1. Revisit surfacing
  links only once there is more than one module.

## 4. Burger

Same content at every width. Below 768px, use the existing `Sheet` primitive as a bottom sheet
with a vertical entrance. On desktop, use a compact popup anchored below and right-aligned to
the burger. Do not combine horizontal centering transforms with entrance translation. The mobile
handle closes on tap and supports downward drag-to-dismiss; an incomplete drag snaps back. The
desktop close control is absolutely positioned at the popup's top right rather than consuming a
row. The burger trigger does not use the standard button's pressed translation.

Structure, top to bottom:

1. **Sparring section**, at 16px/600: `Нова гра` and `Матчі`. Do not show placeholders for Clubs or
   Tournaments. Active navigation uses a filled surface, not the old navigation underline.
2. Separator.
3. **Тема** — label left, `ToggleGroup` right, on one row.
4. **Мова** — label left, `ToggleGroup` right, on one row. Language currently uses two `Button`s;
   make it the same control as theme. Same kind of choice, same idiom.

Section headings are 16px, not `text-xs` uppercase. `SheetDescription` currently reads `Меню`,
which repeats the title; give it something that describes the content or drop it and label the
sheet with `aria-label`.

**Naming caution.** `listMatches` takes no owner and `listMatchRecords()` has no filter, so the
list is every match ever created by anyone. Call the entry `Матчі`, not `Мої матчі`, until identity
exists. Do not show a global count in the menu.

## 5. Page frame

One `Page` component the three App Shell pages compose. No page reinvents its header.

- Use one 704px maximum outer width, shared by the header, pages, and pinned Setup submit.
  Do not nest additional independently sized page containers.
- Title `<h1>`, 32px/700, `letter-spacing: -0.025em`, wraps freely.
- **No subtitle slot.** The component must not offer one. A line of prose under every heading is a
  tic, not information: `Новий спаринг.` restates the title, and `Усі спаринги цього пристрою.` was
  actively false, since the list is global. If a page has something to say, it says it where the
  thing is, not under the heading.
- Optional back link **above** the title, 17px `--t-secondary` with a chevron and a 44px target.
  Used by child pages, currently only Setup. It goes above rather than opposite the title because
  the title wraps — `Вільна піраміда з продовженням` takes two lines on every phone.
- Content below at 16px horizontal padding.
- Pages scroll normally. Only the control screen is height-constrained.

Titles are owned by the page, from its own loader data. This is what replaces `headerConfig`.

## 6. Game index

**Sasha owns this page's content and will tune it himself.** What follows is the structure and the
constraints on the copy, not finished copy.

The page is a curated shelf, not a rendered collection. Entries are authored in JSX and are free to
differ in shape. Adding a game means writing its entry, not adding a row to an array.

Registered game names still come from `registry[gameKey].meta.title`; only each entry's description,
availability, links, and layout are authored here. Setup and the shelf must not maintain parallel
localized names for the same game.

**Strila and Baraban** each get a full card: the badge from strila.pro, the name at 22px/700, a
short description, a link out to the rules on strila.pro, and a primary `Грати` action. Baraban is
present but dimmed, with `Незабаром` in place of the action, because a game we are about to support
is worth showing.

**The Pyramid family** gets one section, not four peer cards. A heading, one sentence of family
context, then the four variants as rows in a single grouped card. The whole row is the link; there
are no four repeated `Грати` buttons.

Family sentence: `Чотири варіанти однієї гри. Куля скрізь коштує одне очко — різниться решта.`

Per-variant copy must not present pot values as scoring differences. Every game scores one ball as
one point; `shotPointOptions` describes how many balls one button records, which is a control
convenience, not a rule. The current descriptions in `sparring.tsx` violate this — `Удари по
будь-якій кулі: +1, +2 або +4 очки` and `Вільна піраміда до 30 очок` (30 is one club's default, not
the game). Rewrite all five.

`Комбінована піраміда` has no distinguishing description that anyone has written. Render it as a
**visible dashed placeholder** rather than inventing rules copy or repeating a neighbour. An
obvious gap gets filled; a plausible-sounding invention does not.

The game author has granted permission to use and adapt the official Strila and Baraban badges.
Preserve their full-colour ball artwork in both themes and use a subtle neutral shadow to separate
the pale discs from light cards. Keep Baraban's badge legible while the surrounding unavailable
card carries the subdued treatment.

## 7. Matches

**Split across both documents.** The row redesign needs score data that `MatchListEntry` does not
carry, so it lives in the additions document. What is buildable now is everything the shell change
touches:

- The page adopts the App Shell and the `Page` frame: title `Матчі`, no subtitle, `headerConfig`
  deleted.
- The empty state and the existing rows get the §10 typography floor, so nothing renders below
  16px.
- Rows stay as they are otherwise. Do not half-build the scoreboard row against missing data.

`listMatchRecords()` is unfiltered and unpaginated, so this page shows every match anyone ever
created and grows without bound. Out of scope to fix, but it constrains the copy here and the
burger entry in §4: neither may claim the matches belong to the viewer or the device.

## 8. Setup

Same flow and the same fields. Presentation only.

- The **game's name is the page title**, with `‹ Інша гра` as the back link above it.
- Player names: two full-width inputs at 54px with 18px text. **Keep the existing `<datalist>`**
  in `RecentPlayerDatalist`; the browser renders recent players natively as the field is typed
  into. Do not add visible suggestion chips — they duplicate a control the platform already gives
  us and they take a row each.
- Settings appear only once both names are valid and differ, exactly as today.
- Do not preview those later controls in a dimmed or disabled state; the sparse pre-validation
  state is intentional.
- `До скількох перемог` is a stepper with 54px targets. Absent for `free-pyramid-long`, which is
  fixed at one frame. The existing `longFreePyramidFrameHelp` box can go: the label on the targets
  field says `Гра до` instead of `Партія до`, and there is no race field, which together say it.

**Per-seat point targets are one field, present in every game.** `frameTargetPointsBySeat` is
per-seat precisely so the two players can have different targets, and the real case is lopsided:
a European champion against a rookie plays 50:15. There is therefore no separate "handicap"
concept and no collapsed summary — equal targets are just the common default of the same field.

Render it as two compact cards side by side, each with the player's **first name** at 15px above a
26px tabular numeral input. The current `FrameTargetFields` is right in structure and only too
heavy visually — a full `Label` and `NumberInput` stack each.

Numeric Setup inputs select their existing value on focus or click so a table-side edit can replace
it immediately; player-name inputs retain normal caret behaviour. Focus on a per-seat target uses
one bright green ring and glow around the whole card, with no second outline around the nested
input. Keep the 26px numeral on a normal 31.2px single-line height rather than forcing line-height
to `1`.

Label: `Партія до` for multi-frame games, `Гра до` for `free-pyramid-long`.

**Keep the coin toss.** `FirstBreakerToss` is not a breaker picker and must not be flattened into
one. It encodes two steps: the coin decides **who chooses**, and the winner may then hand the break
to their opponent. A three-option `A / B / Жереб` control would silently delete that rule. Restyle
only:

- Coin at 82px, amber ring, holding the player's initial; muted with `?` before the throw.
- The two lines beside it move from 14px to 17px and 16px.
- Drop the `fieldset`/`legend` chrome for a normal section heading.
- After the toss, the winner's choice is two buttons labelled with first names.

`Переставка` for `free-pyramid-long` becomes a two-option segmented control, keeping the existing
`звично` / `новіше` sub-labels from the current radio descriptions.

Section order: players, race length, per-seat targets, rack rollover, then the toss last — it is
the ritual immediately before starting.

Submit is **pinned to the bottom**, full width, 60px. Full width is what fixes `Розпочати матч` not
fitting; the label was only ever too long for a narrow button.

The toss is mandatory by design. There is no way to name a breaker directly and none should be
added: the informal alternatives are slower than throwing here.

## 9. Result

Replaces the redirect from a finished match to Протокол. The control route already receives
`controlState: 'finished'` with full `state` and `participants`, so this needs **no contract
change**: the route renders a result instead of the Action Stack, and `matchUrlForStatus` stops
sending finished matches to Протокол.

Lives in the Match Shell, so the tabs read `Результат` / `Протокол` and ✕ exits to Matches.

- Winner chip in green: `{name} переміг`.
- Both names, winner at full strength and loser in `--t-secondary`, then the match score at 62px
  with the loser's numeral in `--t-muted`, from `state.framesWonBySeat`.
- `Партії`: one row per frame — index, then the frame's points with the frame winner's numeral at
  700, from `state.frames[].pointsBySeat`.

Two elements in the reference render belong to the additions document and must be left out here:
the closing line with the finish time, and the `Реванш` button. Without them the screen ends after
the frame list, which is complete and correct on its own.

## 10. Typography and colour

Minimum font size is **16px**. 14px is allowed only where a companion numeral or unit sits beside
larger text. The audit found the app currently bottoms out at 12px in `Badge`, `Button size="sm"`,
`ToggleGroupItem`, `CardDescription`, burger section labels, and the matches list, and at 14px in
`NavigationLink`, `Button size="md"`, and `Label`. There are only 17 `text-xs` and 27 `text-sm`
occurrences across 11 files, so this is a mechanical pass over `components/ui`, not a redesign.

Colour follows the control screen: green commits, amber is reserved, red is failure, and there are
no per-seat hues. Dark remains the reference; light must preserve legibility and contrast but does
not need a separate visual reinterpretation.

No webfont. System stack, for club connections.

## 11. Removals

`AppHeader.tsx`, `BurgerMenu.tsx` internals, `handle.headerConfig` from `sparring.tsx`,
`sparring-matches.tsx`, `sparring-init/route.tsx`, and `preview/ui.tsx`, plus the now-unused
`keys.nav.newMatch` / `keys.nav.allMatches` header links and any i18n keys orphaned by the rewrite.
Run `bun run lint` for knip's dead-export check afterwards.

## 12. Acceptance

At 390×844 and 1280×900:

1. Wordmark visible on every App Shell page at every width.
2. Burger has the same Sparring links and preferences at both widths, with no future-module
   placeholders: bottom sheet on mobile, anchored popup on desktop.
3. Game index with the Strila and Baraban cards and the four-row Pyramid group; the Комбінована gap
   is visibly a gap.
4. Matches under the new shell, including the empty state.
5. Setup for Strila and for `free-pyramid-long`, the latter with the longest title in the registry,
   confirming the title wraps without colliding with anything.
6. Setup before names are valid, and after; the toss before and after it is thrown, including
   handing the break to the opponent.
7. Setup with lopsided targets such as 50 and 15.
8. Result for a completed race, and for a match decided by concede.
9. No computed font size below 16px anywhere except the cases named in §10.
10. `Костянтин Кулик` and `Владислав Косогов` throughout.

**Do not add test files or expand coverage.** Update existing tests only where this change breaks
them.

## 13. Review status

Approved: the two shells, the constant wordmark, the module-shaped burger, one consistent burger
for v1, page-owned titles, deleting `headerConfig`, the game index structure, the Matches row
shape, the Result screen, and the rematch action. The coin toss is deliberately mandatory — when
players reach for the app, throwing here is faster than the informal alternatives.

Revised after review: no subtitles anywhere (§5, §7), the back link replacing the top-right button
(§5, §8), native `<datalist>` instead of suggestion chips (§8), per-seat targets as a single
always-present field (§8), and keeping the coin toss intact (§8).

Still open: the unbounded, unfiltered match list (§7). Everything else open moved to the additions
document.
