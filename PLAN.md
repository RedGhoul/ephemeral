# Ephemeral — Build Plan

A stateless, anonymous, ephemeral, peer-to-peer chat app for **mobile phone
browsers**. Users send a link to one other person to start a chat. Nothing is
ever stored anywhere — reopening a chat shows nothing. Communication is direct
peer-to-peer.

> **For future sessions:** this file is the source of truth for decisions and
> progress. Update the **Phase status** section as work lands. Development
> happens on branch `claude/relaxed-faraday-ssgj7f`.

---

## Hard constraints (from the user)

1. **Stateless** — we run no stateful backend.
2. **Anonymous** — no accounts, logins, or persistent identifiers.
3. **Ephemeral** — revisiting a chat is blank; no scrollback, no history.
4. **No database** — nothing in the chat is ever written to a DB anywhere.
5. **Peer-to-peer** — chat bytes flow directly between the two phones.
6. **Mobile phone browser** is the primary (only) target surface.

---

## Locked-in decisions

| Concern | Decision | Why |
|---|---|---|
| **Transport** | WebRTC **DataChannel** | The only browser tech for true P2P data; DTLS-encrypted by default. |
| **Signaling** | **Trystero** (serverless: Nostr relays / BitTorrent trackers) | No backend to run → maximally stateless. Configure multiple relays for redundancy. |
| **Connectivity** | **STUN → managed TURN** fallback chain (Cloudflare TURN) | Two phones on cellular (carrier-grade NAT) often can't connect directly; TURN is the relay safety net. STUN-first keeps cost near zero; TURN relays only the encrypted stream and stores nothing. |
| **Frontend** | **Vite + Preact**, mobile-first CSS | Tiny bundle (~5 KB gzipped so far), fast on phones. |
| **State** | **In-memory only** (Preact state/signals) | No `localStorage`, no `IndexedDB`, no Cache API for messages. Reload = blank by construction. |
| **The "secret"** | High-entropy room key in the URL **`#fragment`** | Fragments are never sent to any server; the link *is* the capability. |
| **Persistence** | **None** | There is no database in the system at all. |

### How each constraint is satisfied
- **Stateless** → zero backend; signaling is borrowed public infra, TURN is a stateless relay.
- **Anonymous** → no accounts; only an ephemeral random peer ID per session.
- **Ephemeral / blank on revisit** → messages live only in the tab's RAM; nothing is written, so reopening shows nothing. Hardened later with single-use links + idle teardown.
- **No DB** → no database exists in the architecture.
- **P2P** → chat flows over the WebRTC DataChannel directly between phones.

### Architecture sketch
```
User A (phone)                                      User B (phone)
   │  1. opens app, gets link with room secret in #hash  │
   │ ─────────────── sends link via SMS ───────────────▶ │
   │   2. both briefly connect to signaling (Trystero)   │
   │      to swap SDP offer/answer + ICE candidates      │
   │      ◀────────── public relays ───────────▶         │
   │   3. WebRTC DataChannel opens — DIRECT P2P          │
   │ ◀═══════════ encrypted chat messages ═══════════▶  │
   │   (STUN tried first; TURN relay only if direct fails)│
```

---

## Known caveats / scope boundaries

- **1:1 first.** Designed for link → one other person. Group chat is possible
  with Trystero's mesh but adds connection-management + UX work → **v2**.
- **Both peers must be online simultaneously.** No server ⇒ no offline delivery
  and no history; messages sent while the other is away are lost. Inherent to
  true P2P + no storage, and consistent with the requirements.
- **Public signaling reliability varies.** Mitigated by configuring multiple
  relays/trackers.
- **iOS Safari WebRTC quirks.** Backgrounding a tab can drop the connection →
  reconnection handled in Phase 6.

---

## Phase status

Legend: ✅ done · 🔜 next · ⬜ not started

### ✅ Phase 1 — Scaffold
Mobile-first Vite + Preact shell.
- Vite + Preact project; production build ~5 KB gzipped JS.
- Layout: dynamic-viewport-height (`100dvh`/`svh`) flex column —
  header / scrollable body / composer — padded by `env(safe-area-inset-*)`.
- iOS-friendly defaults: 16px base font (no focus auto-zoom),
  `viewport-fit=cover`, `overscroll-behavior: none`, web-app meta tags.
- `vite.config.js` uses `host: true` to expose the dev server on LAN for
  testing on a real phone.
- No persistence APIs touched. Stable `<header>/<main>/<footer>` mount points.

Files: `index.html`, `package.json`, `vite.config.js`, `.gitignore`,
`src/main.jsx`, `src/app.jsx`, `src/styles/global.css`.

Run locally: `npm install && npm run dev`, then open the printed LAN URL on a
phone on the same Wi-Fi.

### ✅ Phase 2 — Room + link flow
- App routes between three in-memory states decided from the URL fragment:
  **home** (no key), **host** (we minted the room), **guest** (opened a link).
- "Start a chat" mints a 128-bit room key via `crypto.getRandomValues`,
  base64url-encoded, and writes it to the URL `#fragment` with
  `history.replaceState` (no history entry).
- Shareable link rendered with a tap-to-copy field, a Clipboard-API copy button
  (with "Copied ✓" feedback + manual-select fallback), and the native share
  sheet (`navigator.share`) when available.
- "Waiting for the other person…" (host) and "Joining the chat…" (guest)
  states — placeholders that the phase-3 connection wires into.
- Fragment never hits a server; the link is the capability. No persistence APIs.

Files added: `src/room.js`, `src/components/ShareLink.jsx`.
Files changed: `src/app.jsx`, `src/styles/global.css`. Build ~6.9 KB gzipped JS.

### 🔜 Phase 3 — P2P connection
- Wire up Trystero: join room from link, open DataChannel.
- Surface connection status (connecting / connected / peer left).

### ⬜ Phase 4 — Chat UI
- Message bubbles, text input, send-on-enter, auto-scroll.
- Typing indicator, timestamps. All state in memory only.

### ⬜ Phase 5 — Ephemerality hardening
- Assert no persistence APIs are used for messages.
- Optional single-use links (room consumed after first pair connects).
- Idle auto-teardown so a re-visit is provably blank.

### ⬜ Phase 6 — Connectivity
- ICE config: public STUN + Cloudflare TURN credentials (via `.env`, see below).
- "Couldn't connect / peer left" handling; reconnection (incl. iOS backgrounding).

### ⬜ Phase 7 — Polish
- PWA manifest, dark mode, loading/empty states, share-sheet integration.

---

## Operational notes

- **Branch:** all work on `claude/relaxed-faraday-ssgj7f`. Commit + push when a
  phase completes.
- **TURN credentials** will live in `.env` (gitignored). An `.env.example` will
  document the required keys when Phase 6 lands. Cloudflare TURN free tier is the
  default provider; STUN-only still runs (just unreliable phone-to-phone on
  cellular).
- **No backend** to deploy. The built `dist/` is static — host anywhere (e.g.
  Cloudflare Pages / any static host).
