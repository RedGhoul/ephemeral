/**
 * App shell.
 *
 * Phase 1 scope: just the mobile-first layout skeleton — a header, a scrollable
 * body, and a footer/composer area — so later phases have stable mount points.
 *
 * The room/link flow (phase 2), the P2P connection (phase 3) and the live chat
 * UI (phase 4) all slot into the <main> body. Nothing here persists anything;
 * all state will live in memory only.
 */
export function App() {
  return (
    <div class="screen">
      <header class="topbar">
        <span class="brand">ephemeral</span>
        <span class="tagline">nothing is saved</span>
      </header>

      <main class="body">
        <div class="placeholder">
          <p class="placeholder-title">Scaffold ready</p>
          <p class="placeholder-sub">
            The chat lives here. Room links land in phase 2.
          </p>
        </div>
      </main>

      <footer class="composer">
        <div class="composer-hint">composer goes here</div>
      </footer>
    </div>
  );
}
