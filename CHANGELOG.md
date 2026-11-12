# Changelog

Grouped by date and phase. The reasoning behind each decision is in the [decision log](docs/DECISIONS.md).

## 12 November 2026 — languages

- **The whole site in English, Ukrainian and Russian.** Language switch on the sign-in screen and in settings; the choice is stored in the profile (migration 0023).
- Ukrainian letters (і, ї, є, ґ) allowed in nicknames and avatar letters.
- Grand Prix, country, team and driver names, fantasy price reasons and database error messages are translated in the client; switching language re-translates loaded data instantly, without new requests.
- Driver biographies from Wikipedia in each language (migration 0024); the privacy policy in three languages at the same address.
- Guard tests: no hard-coded interface text outside the dictionaries, no database name without a translation.
- Fantasy rules: the "Prices" row now describes the live price model; the privacy policy covers uploaded avatar photos and fantasy squads.
- README screenshots retaken in English.

## 12 November 2026 — post-launch polish

- **Fantasy: live prices (model v2).** Form rating, fair price, smooth movement capped at ±0.8 per race; rookies start at 85% of their teammate's price; the Market shows the fair price and a price chart. Migration 0022, test 0016.
- **Keep-alive** runs daily, retries 3 times and keeps its schedule from being disabled after 60 days.
- **Profile settings** on a dedicated page with a Save button.
- **GIF avatars** and **server-side cleanup of unused avatar files** (migration 0021).
- **Profile pictures**: upload, cropping, letter avatar, one shared avatar component across the site (migration 0020).
- **Frameless layout** and a fixed sidebar with labels on hover.
- **Large screens**: smooth scaling, pinned sidebar and more grid columns on 4K, no empty side gaps.
- Home: last-race winner card matches the design; "Rules" in the sidebar opens the fantasy rules; larger team logos behind drivers.

## 12 November 2026 — Phase 5

- Per-block prediction deadlines and sprints (from the 2026 Qatar GP).
- Automatic season rollover and league carry-over.
- Dialogs and error states from the design; WCAG AA accessibility on every screen (axe).
- Supabase split into its own bundle (stays cached when the site changes).

## 12 November 2026 — Phase 4: fantasy

- Fantasy core: squads, scoring, prices, screen RPCs, tests.
- Screens: my squad, market, leaderboard, race results, analytics, rules.

## 12 November 2026 — Phases 2 and 3

- Bonuses, ×2 booster, race breakdown, practice results; session rescheduling, save toast.
- Player profile, season titles, league table, driver catalogue, pole positions.

## 11–12 November 2026 — Phase 1: predictions game

- Game data and sync with Jolpica.
- Prediction screens, championship, circuits, weather, waiting room, manual result entry.

## 11 November 2026 — Phase 0: foundation

- Project scaffold, sign-in via Google and Discord only, privacy policy.
- Sign out and account deletion right on the site.
- CI, deployment to GitHub Pages, nightly database backup.
