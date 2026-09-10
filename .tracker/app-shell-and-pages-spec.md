# App Shell And Pages

Status: design approved except where marked. Not yet implemented.
Reference renders: `.tracker/app-shell-and-pages/`.
Companion document: `.tracker/match-control-shell-spec.md`, which owns everything inside a live match.

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

- Height 60px, bottom hairline, not sticky.
- Wordmark left at 34px tall, always visible, at every width. It links to the game index. The
  wordmark carries the brand and the production domain is `play.ks.ua`, so it does the work that
  `nav.newMatch` and `nav.allMatches` were doing badly.
- Burger right, 44×44.
- **No navigation links in the bar at any width.** One consistent burger for v1. Revisit surfacing
  links only once there is more than one module.

## 4. Burger

Bottom sheet, reusing the existing `Sheet` primitive. Same content at every width.

Structure, top to bottom:

1. **Module sections.** One heading per module, at 16px/600. Sparring is the only live module:
   `Нова гра`, and `Матчі` with a count. Clubs and Tournaments appear as headings with a
   `Незабаром` badge and no links, so the shell visibly has room for what is coming. Do not build
   routes for them.
2. Separator.
3. **Тема** — label left, `ToggleGroup` right, on one row.
4. **Мова** — label left, `ToggleGroup` right, on one row. Language currently uses two `Button`s;
   make it the same control as theme. Same kind of choice, same idiom.

Section headings are 16px, not `text-xs` uppercase. `SheetDescription` currently reads `Меню`,
which repeats the title; give it something that describes the content or drop it and label the
sheet with `aria-label`.

**Naming caution.** `listMatches` takes no owner and `listMatchRecords()` has no filter, so the
list is every match ever created by anyone. Call the entry `Матчі`, not `Мої матчі`, until identity
exists. The count is similarly global.

## 5. Page frame

One `Page` component the three App Shell pages compose. No page reinvents its header.

- Title `<h1>`, 32px/700, `letter-spacing: -0.025em`, wraps freely.
- Optional subtitle, 17px, `--t-secondary`.
- Optional inline action rendered as a link inside the subtitle line, not as a button floating
  opposite the title. The current pattern breaks as soon as a title wraps, and
  `Вільна піраміда з продовженням` wraps on every phone.
- Content below at 16px horizontal padding.
- Pages scroll normally. Only the control screen is height-constrained.

Titles are owned by the page, from its own loader data. This is what replaces `headerConfig`.

## 6. Game index

The page is a curated shelf, not a rendered collection. Entries are authored in JSX and are free to
differ in shape. Adding a game means writing its entry, not adding a row to an array.

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

Badge licensing with strila.pro is unresolved, and the badges need checking against the light
theme.

## 7. Matches

Rows read as scoreboards, because that is what they are. Two stacked names with their scores
right-aligned, then a meta line with the game and the time. The winner's name and numeral take
`--hi`/`--bone` at 600; the loser's take `--t-secondary`/`--t-muted`. This deliberately echoes the
match Board so the two surfaces feel like one product.

Active matches come first under `Зараз грають`, with a green dot, a green-tinted border, and the
current frame instead of a time. Finished matches follow, grouped by day.

**This page is blocked on a contract change.** `MatchListEntry` carries no score and no end time,
so today it can only print names and a game title — which is exactly why it looks like a database
dump. It needs:

```ts
readonly framesWonBySeat: BySeatNumber
readonly currentFramePointsBySeat: BySeatNumber
readonly matchTargetFrames: number
readonly endedAt?: UnixEpochMilliseconds
```

The route decides which score to show — frames when `matchTargetFrames > 1`, current frame points
when it is 1, since `free-pyramid-long` is a single frame to a point target. Keeping that decision
in the route rather than resolving it in `@ks/application` follows the documented boundary that
routes own presentation adaptation.

**Two open questions, both needing a decision before this page is built.**

Day grouping needs a time zone and the app has none — `loadMatchProtocol` hardcodes `'UTC'`. Either
plumb a zone the way `readMatchProtocol` already accepts one, or group after hydration on the
client. Until that is settled, ship the list ordered but ungrouped; do not print a wrong local day.

`listMatchRecords()` is unfiltered and unpaginated, so this page grows without bound and shows
strangers' matches. Out of scope to fix here, but it constrains the copy: the subtitle cannot claim
the matches belong to the viewer or the device.

## 8. Setup

Same flow, new presentation.

- The **game's name is the page title**. `Новий спаринг.` is the subtitle, with `Змінити гру` as an
  inline link beside it.
- Player names: two full-width inputs at 54px with 18px text, recent-player suggestions as chips
  below the first.
- Settings appear only once both names are valid and differ, exactly as today.
- `До скількох перемог` uses a stepper with 54px targets. For `free-pyramid-long` it becomes
  `До скількох очок`, and `Переставка` appears as a two-option segmented control (`з 14` / `з 15`).
- `Хто розбиває` is a three-option segmented control using **first names only**, so two long names
  and `Жереб` fit one row.
- Handicap is collapsed to a summary row — `Обидва до 9 очок` with a `Змінити` link — and expands
  to the two number fields. It is unusual, and two number inputs are noise on the common path.
  This is a behaviour change from today, where the fields are always visible.
- Submit is **pinned to the bottom**, full width, 60px. Full width is what fixes
  `Розпочати матч` not fitting: the label was only ever too long for a narrow button.

## 9. Result

New tab replacing the redirect from a finished match to Протокол. Lives in the Match Shell, so the
tabs read `Результат` / `Протокол` and ✕ exits to Matches.

- Winner chip in green: `{name} переміг`.
- Both names, winner in full strength and loser in `--t-secondary`, then the match score at 62px
  with the loser's numeral in `--t-muted`.
- `Партії`: one row per frame — index, then the frame's points with the frame winner's numeral at 700. All of this is already in `MatchState.frames[].pointsBySeat`, so **no contract change is
  needed**.
- Closing line with when the match finished.
- Pinned at the bottom, above the tabs: `Реванш тим самим складом`, linking to setup for the same
  game with both names prefilled.

The rematch action is **my proposal, not something you asked for**. It is the one thing players
predictably want next, and the space is otherwise dead, but it is a new flow and easy to cut.

## 10. Typography and colour

Minimum font size is **16px**. 14px is allowed only where a companion numeral or unit sits beside
larger text. The audit found the app currently bottoms out at 12px in `Badge`, `Button size="sm"`,
`ToggleGroupItem`, `CardDescription`, burger section labels, and the matches list, and at 14px in
`NavigationLink`, `Button size="md"`, and `Label`. There are only 17 `text-xs` and 27 `text-sm`
occurrences across 11 files, so this is a mechanical pass over `components/ui`, not a redesign.

Colour follows the control screen: green commits, amber is reserved, red is failure, and there are
no per-seat hues. The light theme is unresolved and unloved; treat dark as the reference and do not
tune light beyond legibility in this work.

No webfont. System stack, for club connections.

## 11. Removals

`AppHeader.tsx`, `BurgerMenu.tsx` internals, `handle.headerConfig` from `sparring.tsx`,
`sparring-matches.tsx`, `sparring-init/route.tsx`, and `preview/ui.tsx`, plus the now-unused
`keys.nav.newMatch` / `keys.nav.allMatches` header links and any i18n keys orphaned by the rewrite.
Run `bun run lint` for knip's dead-export check afterwards.

## 12. Acceptance

At 390×844 and 1280×900:

1. Wordmark visible on every App Shell page at every width.
2. Burger identical at both widths, showing Sparring plus the two `Незабаром` modules.
3. Game index with the Strila and Baraban cards and the four-row Pyramid group; the Комбінована gap
   is visibly a gap.
4. Matches with an active match, two finished matches, and the empty state.
5. Matches where one entry is `free-pyramid-long`, showing points rather than frames.
6. Setup for Strila and for `free-pyramid-long`, the latter with the longest title in the registry,
   confirming the title wraps without colliding with anything.
7. Setup before names are valid, and after.
8. Result for a completed race, and for a match decided by concede.
9. No computed font size below 16px anywhere except the cases named in §10.
10. `Костянтин Кулик` and `Владислав Косогов` throughout.

**Do not add test files or expand coverage.** Update existing tests only where this change breaks
them.

## 13. Review status

Approved in discussion: the two shells, the constant wordmark, the module-shaped burger, one
consistent burger for v1, page-owned titles, deleting `headerConfig`, and the game index including
the Pyramid grouping and the corrected copy.

**Designed in this session and not yet reviewed: §7 Matches, §8 Setup, §9 Result.** Read those
three against their renders before an agent starts on them.
