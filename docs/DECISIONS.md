# Decision log

The key project decisions: what was chosen, why, and where it lives in the code. Game mechanics are in [PRODUCT.md](PRODUCT.md), the fantasy formula in [FANTASY-FORMULA.md](FANTASY-FORMULA.md), architecture in [ARCHITECTURE.md](ARCHITECTURE.md) (all in Russian).

## Foundation

| # | Decision | Why | Where |
|---|---|---|---|
| 1 | **Supabase** (Postgres + RLS + Auth + Edge Functions) instead of a custom server | Free tier, access rules live in the database, no backend to maintain | `supabase/` |
| 2 | **The database does the scoring**; SQL functions are idempotent | Single source of truth; re-scoring after a result correction never duplicates anything | `recompute_event_scores`, migrations 0003, 0010, 0015 |
| 3 | **Security only in the database**: deadlines, hidden picks, budget and roles via RLS and triggers | The UI can be bypassed, the database can't | policies in every migration |
| 4 | **The browser never calls external F1 APIs** | The data is the same for everyone; `sync-f1` fetches it every 10 minutes | `supabase/functions/sync-f1` |
| 5 | **Server time** (`server_now()`), displayed in the player's time zone | Device clocks can be wrong, and a deadline is the same for everyone | `src/lib/time/` |
| 6 | **GitHub Pages + `HashRouter`** | Free hosting; without the hash, deep links on Pages return 404 | `vite.config.ts`, `src/app/App.tsx` |
| 7 | **CSS Modules + CSS custom properties**, no Tailwind | The design mockups are hand-written CSS — easier to match them exactly | `src/styles/`, `*.module.css` |
| 8 | **Schema changes only via migrations** through the Supabase CLI | Reproducibility and change history | `supabase/migrations/` |

## Product

| # | Decision | Date | Why |
|---|---|---|---|
| 9 | Sign-in **only via Google or Discord**, no passwords or emails | 11 Nov 2026 | No SMTP, no password resets, less data and risk |
| 10 | **One prediction per race for all of a player's leagues** | concept | Leagues differ by members and bonuses, not by the prediction |
| 11 | Manual result entry — **site admin only** | 11 Nov 2026 | Results are shared by the whole site |
| 12 | Safety car counts only for a real deployment (not VSC or red flag), per OpenF1 | 13 Nov 2026 | Unambiguous rule that exists in the data |
| 13 | **Per-block deadlines** from Qatar 2026: qualifying, sprint, race | 12 Nov 2026 | You can predict the race already knowing qualifying |
| 14 | No site-wide ranking, only league tables | concept | A game among friends |

## Fantasy

| # | Decision | Date | Why |
|---|---|---|---|
| 15 | **Our own rules**, not a copy of the official F1 Fantasy | 12 Nov 2026 | No noisy metrics (overtakes, fan votes); anti-abuse measures in [§7](FANTASY-FORMULA.md#7-защита-от-злоупотреблений-кратко) |
| 16 | Squads lock **when the first session of the weekend starts** | 12 Nov 2026 | No adjusting to practice results |
| 17 | Driver not racing — **their team's reserve, free and automatic** | 12 Nov 2026 | A player doesn't lose points over a substitution they may not know about |
| 18 | **Live prices, model v2 "fair price"**: form rating → target → 30% of the way, capped at ±0.8 | 12 Nov 2026 | The old model (quartile steps) caught up with real form too slowly. Validated by a simulation over the whole 2026 season: Antonelli $14.6M → $24.3M. Roll back with `price_model = "v1"` |
| 19 | A rookie starts at **85% of their teammate's price** | 12 Nov 2026 | The floor price undervalues a rookie in a top team |
| 20 | Fantasy trial round at Abu Dhabi 2026, full start with the 2027 season | 12 Nov 2026 | Test the mechanics on real results before the season |

## Interface

| # | Decision | Date | Why |
|---|---|---|---|
| 21 | **Frameless layout**: sidebar at the window edge, content full width | 12 Nov 2026 | The padded rounded frame looked like a window on a background |
| 22 | **Fixed sidebar** (`position: fixed`), expands on hover, opens with a burger on touch screens | 12 Nov 2026 | Doesn't scroll away; labels shown on demand |
| 23 | Large screens: **smooth scaling** of the 1440 layout (up to ×1.4 on 2K, ×1.7 on 4K); on very wide windows the sidebar stays open and there are no empty side gaps | 12 Nov 2026 | The 2K mockups are the 1440 layout ×1.4; step scaling jumped and stretched cards looked bad |
| 24 | Animate **only `transform` and `opacity`** | rule | Smoothness and performance (budget: initial JS ≤ 250 KB) |
| 25 | **Profile pictures** in Supabase Storage: cropped and compressed in the browser (256/512 WebP); GIFs re-encoded frame by frame to 256×256 | 12 Nov 2026 | No image-processing server needed; file type checked by content, SVG rejected |
| 26 | Unused avatar files are removed by **`sync-f1` every hour** | 12 Nov 2026 | Safety net if a tab was closed mid-save or an account was deleted |
| 27 | Profile settings — **a dedicated page with a Save button** | 12 Nov 2026 | Changes go in one request, with cancel and nickname validation |

## Operations

| # | Decision | Date | Why |
|---|---|---|---|
| 28 | **Daily keep-alive** that also re-enables its own schedule | 12 Nov 2026 | Free Supabase projects pause after a week without requests, and GitHub disables schedules after 60 days without commits |
| 29 | **Nightly database backup**, encrypted (gpg, AES-256), kept for 14 days | 11 Nov 2026 | The free Supabase plan has no backups, and the repository is public |
