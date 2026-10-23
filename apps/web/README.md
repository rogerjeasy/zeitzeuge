# ZEITZEUGE — web

Next.js 16 (App Router) front end for ZEITZEUGE. Implemented so far:

| Route | Screen |
|---|---|
| `/[locale]` | Landing (§9.2 #1) |
| `/[locale]/auth/login` | Sign in |
| `/[locale]/auth/signup` | Create account, with an in-place verify state |
| `/[locale]/auth/forgot-password` | Password reset request |
| `/[locale]/dashboard` | Dashboard overview (§9.2 #3) |
| `/[locale]/settings{,/appearance,/notifications,/cataloguing,/export,/security,/api,/archive}` | Settings, one route per section |
| `/[locale]/profile` | Contribution record |
| `/[locale]/upload` | Upload (§9.2 #4) |
| `/[locale]/queue` | Triage queue (§9.2 #7) |
| `/[locale]/records/[id]` | **Labelled placeholder** — the editor (§9.2 #6) |
| `/[locale]/{history,collections,evaluation,help-identify,admin}` | **Labelled placeholders** inside the real shell |

Everything under `(app)` shares the sidebar + header shell.

```bash
npm run dev     # http://localhost:3000 → redirects to /de
npm run build
npx tsc --noEmit
npx eslint src
```

## Conventions

- **Locales** — `de` (default), `en`, `fr`, always route-prefixed. Copy lives in
  `messages/*.json` and nothing user-facing is hardcoded in a component. The
  three catalogues are kept at exact key parity.
- **Theme** — `next-themes` with a `class` strategy and a three-state control
  (light / dark / system). Every colour is a semantic token in
  `src/app/globals.css`; components never name a raw hex except inside the
  deliberately "photographic" surfaces (the plate furniture, the verso paper).
- **Domain data** vs **copy** — anything translatable is in `messages/`;
  everything factual (agent roster, model names, coordinates, reliability bins)
  is in `src/lib/data/`. Components join the two by key.
- **Sections** — one file per section under `src/components/sections/`, built
  from primitives in `src/components/ui/`. `Section` owns the single horizontal
  page gutter so no inner component can let content touch a phone's edge.
- **Motion** — CSS transitions driven by a one-shot `IntersectionObserver`
  (`useInView`). `prefers-reduced-motion` collapses every transition globally
  and the hero renders its final frame directly.

## Notable details

- `src/lib/data/horizon.ts` — the hero's horizon curve is **not** hand-drawn. It
  is the output of a per-column sky-reference segmentation of the actual scan,
  median-filtered and trimmed to the printed picture area. Only the two summits
  that resolve to a distinct silhouette from this bearing are labelled.
- `src/components/sections/calibration/` — the reliability diagram's two series
  colours were checked with the palette validator against both surfaces
  (lightness band, chroma floor, CVD separation, normal-vision floor, contrast).
  Light `#0f6cb4`/`#a9701a`, dark `#2f96cc`/`#c08334`.
- **Ink panels.** The three dark, inverted panels (CTA, governance quote,
  invariant block) use the `ink-panel*` tokens, which stay dark in *both*
  themes and carry their own foreground scale. Never paint them with
  `bg-foreground-strong` + `text-white/xx`: `--foreground-strong` is near-black
  in light mode and near-WHITE in dark, so the whites became white-on-white.
  Nothing on an ink panel should ever use a hardcoded white.
- **Status colours must pass on their own soft tint.** They are used as text on
  `*-soft` backgrounds (pills, delta chips), which darken the ground — values
  tuned against plain paper measured 3.29–4.26:1 there. The light-mode
  `corroborated`/`review`/`abstain` and the dark-mode `refuted` are solved so
  each clears 4.5:1 on its own 16 % tint *and* on every plain surface. Re-solve
  if you add a status colour.
- **Status tokens are re-pointed inside `.bg-ink-panel`.** `DecisionPill` and
  `ConfidenceMeter` are built against the page surface; dropped on a dark panel
  in light mode their tokens resolve to the dark variants and land dark-on-dark
  (~3.4:1). Custom properties inherit, so the panel root overrides them once and
  every descendant is fixed. Add new status colours there too.
- **axe cannot see those panels.** Its contrast rule bails out ("background
  could not be determined") on gradients, image children and overlapping
  elements, and files the result under `incomplete`, not `violations` — which is
  exactly how the white-on-white shipped past a clean axe run. ~44 nodes land in
  that bucket. When changing colour on any layered surface, check contrast
  against the *rendered* background rather than trusting a clean axe report.
- **Locale switching is a document navigation, not a soft one.** `<html>`/
  `<body>` live inside the `[locale]` segment, so a client-side transition
  between locales remounts the whole document subtree — React rebuilds the DOM
  and re-renders next-themes' inline theme script, which it cannot execute on
  the client. The switcher therefore renders real `<a href>` links (position in
  the page is carried over via the hash). Verified: the body node is replaced
  on a soft locale nav; it is not on a document nav, and the theme survives.
- **Next 16 deprecated `<Image priority>`** and it no longer implies
  `loading="eager"` — the hero image was silently lazy-loading. Use
  `loading="eager"` + `fetchPriority="high"`. In dev, Next still warns that this
  image is an un-eager LCP: its warning registry is keyed by resolved URL and
  the case-file plate shared the same source, so its later lazy registration
  overwrote the hero's. Resolved by giving the two contexts the files they
  actually want: the hero renders `brunnen-mythen-access.jpg` (a lighter display
  derivative — it is filtered, overlaid and animated) while the case file keeps
  the master scan, which is the surface where evidence regions are inspected.
  That is the archival master/access-copy split, and it drops the hero's LCP
  payload from 626 KB to 270 KB.
- **Breakpoints** — the hero splits into two columns at `xl` (1280), not `lg`.
  At 1024 neither column has room: the headline hyphenates hard and the readout
  labels collide. 1024–1279 gets the stacked tablet layout.
- Verified: production build clean, `tsc` clean, `eslint` clean, zero horizontal
  overflow at 320/375/430/640/768/900/1024/1180/1280/1440/1920, and **zero**
  axe-core WCAG 2.1 AA violations across DE light, DE dark, EN and FR at mobile,
  tablet and desktop widths.

## App shell

- **`src/lib/data/nav.ts` is the single nav definition** — it drives the
  sidebar, the mobile drawer and the ⌘K palette. Adding a screen is one entry.
- The sidebar collapses to a 64 px rail and the choice persists. State lives in
  `src/lib/sidebar-store.ts` behind `useSyncExternalStore`, not in an effect:
  the server cannot know the stored value, and React's server→client snapshot
  swap handles it during hydration with no mismatch and no flash.
- **Appearance and language live in the user menu, not the header.** They cost
  ~150 px at exactly 1024 px — the width where the sidebar first appears — which
  overflowed the header by 34 px. Worse, the locale switcher was `xl:` only, so
  between 1024 and 1279 the language could not be changed at all: the drawer
  that also carried it is hidden from `lg` up. The user menu is reachable at
  every width.
- The ⌘K palette navigates for real (nav + recent runs). A search box that
  looks live and does nothing is worse than none.
- The archive switcher collapses to its badge on a phone rather than
  disappearing — in a multi-tenant app the tenant you are acting in should never
  be invisible.

## Dashboard

- Opens on the **review queue**, not a KPI wall: the archivist's minutes are the
  scarce resource, so the screen leads with where they are owed.
- The trend is **small multiples, not a shared axis.** Precision (~94 %) and the
  correction rate (~9 %) on one 0–100 axis are two flat lines and the movement —
  the whole point — vanishes. Two panels with fitted domains, both bounds
  written on each axis.
- `human_override_rate` is on this screen because §10.6 calls it the product's
  true north. Good/bad follows the *meaning* of each metric, not the sign: a
  falling correction rate is the win.

## Upload

- **Pairing is the point.** §6.3 treats recto + verso as one asset, and §9.3
  backs it (`POST /assets` then `POST /assets/{id}/verso`). `src/lib/upload/
  pairing.ts` detects the scanner's own convention (`_r/_v`, `_recto/_verso`,
  `_a/_b`, `front/back`, `_1/_2`) and every match is shown with the **literal
  markers found**, so it can be checked and corrected rather than trusted.
- Two guards that matter: a trailing `_1/_2` is only a pair when the base has
  exactly those two — `s_1 … s_5` is a five-image series, not a recto and a
  verso. And a lone verso keeps its side rather than being promoted into the
  recto slot, because labelling the back of a photograph as its front is worse
  than showing the gap.
- **The ZIP reader is real**, not simulated: `src/lib/upload/zip.ts` parses the
  central directory and inflates entries with `DecompressionStream`, so a
  dropped archive genuinely expands. Stored and deflate only, no ZIP64, no
  encryption — anything it cannot read is listed, never silently dropped.
- Intake is drop, picker **and paste** — an archivist sent one photograph by
  email should not have to save it first.
- Validation blocks before anything is sent: missing or duplicate Signatur,
  a verso with no recto, wrong type, over 200 MB. Duplicates matter because the
  Signatur is the archive's identifier — two assets claiming one would collide
  in the catalogue, not in this queue.
- The run mode really changes the run's duration. A select that changed nothing
  would be the decorative control this codebase keeps refusing to ship.
- **The queue seeds itself with example scans on open** (`demo-seed.ts`), so the
  screen shows its design without demanding a drag-and-drop first. The seed uses
  the real archive images renamed to scanner conventions, so pairing, sizes and
  validation downstream are genuine. It is labelled as examples, clears in one
  click, and is chosen to open in a *runnable* state — blocking cases are
  reachable by dropping a file in, not by greeting every visitor with a disabled
  primary action.
- Object URLs are tracked and revoked on removal and unmount.

## Review queue

- **Ordered by expected information gain, not by date** (§9.2 #7), and every
  item states *why* it ranks where it does: «14 ähnliche Aufnahmen hängen an
  dieser Entscheidung», «Red-Team hat eine Hypothese widerlegt», «Rückseite
  konnte nicht sicher gelesen werden», «Konfidenz liegt auf der
  Entscheidungsgrenze». The order is itself a claim, and this product does not
  make claims without naming the evidence.
- Decisions happen **in place**: accept or reject each field on the row. The
  dashboard promises ~40 seconds per entry and that budget only survives if the
  decision happens where the item already is. `/records/[id]` stays the place
  you go when an entry needs real work.
- **Bulk accept previews live.** Dragging the threshold highlights exactly the
  rows it would sweep and counts what stays; accepting is a second, deliberate
  confirmation. `minConfidence()` — the weakest field that would be emitted — is
  what the threshold compares against, not an average.
- One level of **undo** after any accept, single or bulk, restoring items to
  their original queue position rather than appending them.
- Field rows stack below `sm`: at 390 px a single row crushed the value to
  «Brunne…», and the value is the thing being judged.

## Settings & profile

- **`SETTINGS_SECTIONS` in `src/lib/data/settings.ts`** drives the section nav.
  `/settings` *is* the account section (no redirect hop); the rest are children.
- Danger zones live at the foot of Account and Archive, not as a ninth nav item
  — that is where people look for them. Account deletion requires the word typed
  out, and its copy states that accepted catalogue records survive, because the
  catalogue is append-only.
- `useSettingsForm` compares values structurally, so reverting an edit by hand
  clears the unsaved state instead of leaving the save bar stuck open.
- Theme and language are deliberately **outside** the save bar: they apply
  instantly and are stored per device.
- Turning off abstention warns inline. P3 says calibrated silence is a feature,
  so switching it off should not feel like flipping any other toggle.
- **API access is designed, not connected.** Nothing issues tokens yet, so the
  section says so at the top and anything created is visibly a placeholder —
  same rule as the SAML button.
- The profile is a **record of contribution** (§5.4 M5), not an account form:
  each correction is shown with what the system did with it — alias, exemplar
  or regression case.

## Auth

- **`src/lib/auth/client.ts` is the only boundary the screens talk to.** Swapping
  the demo provider for Cognito is a one-file change. The demo provider does no
  network I/O and **stores no credential anywhere**; reserved addresses
  (`taken@`, `locked@`, `offline@`, `wrong@zeitzeuge.ch`) make each failure state
  reachable, and everything else succeeds so a judge typing their own address
  gets in.
- §9.2 specifies Cognito's *hosted* UI, which would mean no designed screen at
  all. These are branded forms instead; the hosted UI is not used.
- **`PASSWORD_RULES` drives both** the live checklist and the validation that
  gates submission, so the two cannot drift.
- Password reset always reports success — confirming whether an address exists
  would turn the form into an account-enumeration oracle.
- The cantonal SAML button is rendered `disabled` and says so on its face. It is
  there because federated sign-in is cantonal IT's first question; it must never
  look live while doing nothing.
- **`AUTH_LANDING` is where every entry point lands** — sign in, sign up and the
  guest path. `/[locale]/dashboard` currently holds a labelled placeholder so
  that flow does not dead-end in a 404; replace it with the real dashboard.
- The guest path is a peer of signing in, not a link under the form: §9.2 is
  explicit that a judge must never hit a signup wall.

## Brand assets

Derived from the supplied `logo.png` (background removed by flood-filling only
the region connected to the border, so the sky *inside* the photograph stays
opaque):

| File | Used by |
|---|---|
| `public/brand/zeitzeuge-mark-compact{,-dark}.png` | header lockup, 32 px |
| `public/brand/zeitzeuge-lockup{,-dark}.png` | footer |
| `public/brand/zeitzeuge-lockup-full.png` | source for the social card |
| `src/app/icon.png`, `src/app/apple-icon.png` | favicon / home-screen icon |
| `src/app/opengraph-image.png` | link preview, 1200×630 |

Two variants, not one filtered file: the artwork's plates are near-black navy
and vanish on a dark surface, so the `-dark` files lift only those pixels toward
slate and leave the photograph and the cyan circuitry untouched. The header uses
a **compact crop** — at 32 px the far circuitry is sub-pixel and turns the mark
to mush.

## Images

`public/archive/` holds public-domain Photochrom prints (Photoglob Zürich /
Detroit Publishing Co., c. 1890–1900) from the Library of Congress Photochrom
Print Collection, fetched from Wikimedia Commons. Machine-readable provenance is
in `public/archive/ATTRIBUTION.json` and the credit is rendered in the footer.
The `StASZ …` reference codes shown in the UI are illustrative sample data, not
real Staatsarchiv Schwyz signatures.
