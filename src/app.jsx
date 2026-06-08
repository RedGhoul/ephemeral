/**
 * App shell + room/link flow (phase 2).
 *
 * Three states, decided purely from the URL fragment and in-memory choices —
 * nothing is persisted:
 *
 *   home  → no room key yet. Offer "Start a chat", which mints a high-entropy
 *           key, drops it in the `#fragment`, and moves to the host state.
 *   host  → we created the room. Show the shareable link + copy/share, and a
 *           "waiting for the other person…" state.
 *   guest → we opened someone else's link. The key is read from the fragment;
 *           show a "joining…" state.
 *
 * The actual P2P connection (Trystero / WebRTC DataChannel) lands in phase 3 and
 * slots into the host/guest states below; the live chat UI lands in phase 4.
 */
import { useState } from 'preact/hooks';
import {
  generateRoomKey,
  readRoomKeyFromUrl,
  writeRoomKeyToUrl,
  shareableLink,
} from './room.js';
import { ShareLink } from './components/ShareLink.jsx';

export function App() {
  // Decide the initial state once, from the URL. A key already in the fragment
  // means we arrived via someone's link → guest. Otherwise we start at home.
  const initialKey = readRoomKeyFromUrl();
  const [roomKey, setRoomKey] = useState(initialKey);
  const [isHost, setIsHost] = useState(false);

  function startChat() {
    const key = generateRoomKey();
    writeRoomKeyToUrl(key);
    setRoomKey(key);
    setIsHost(true);
  }

  const mode = roomKey ? (isHost ? 'host' : 'guest') : 'home';

  return (
    <div class="screen">
      <header class="topbar">
        <span class="brand">ephemeral</span>
        <span class="tagline">nothing is saved</span>
      </header>

      <main class="body">
        {mode === 'home' && <Home onStart={startChat} />}
        {mode === 'host' && <HostWaiting roomKey={roomKey} />}
        {mode === 'guest' && <GuestJoining />}
      </main>

      <footer class="composer">
        <div class="composer-hint">composer goes here</div>
      </footer>
    </div>
  );
}

/** Landing state: a single call-to-action that mints a room. */
function Home({ onStart }) {
  return (
    <div class="pane pane-center">
      <p class="pane-title">Start a private chat</p>
      <p class="pane-sub">
        Send the link to one person. The chat is direct, anonymous, and vanishes
        when you close the tab — nothing is ever stored.
      </p>
      <button type="button" class="btn btn-primary btn-lg" onClick={onStart}>
        Start a chat
      </button>
    </div>
  );
}

/** Host state: hand out the link, and wait for the other person to join. */
function HostWaiting({ roomKey }) {
  const link = shareableLink(roomKey);
  return (
    <div class="pane pane-center">
      <p class="pane-title">Your chat is ready</p>
      <p class="pane-sub">
        Share this link with the one person you want to chat with.
      </p>

      <ShareLink link={link} />

      <div class="waiting">
        <span class="spinner" aria-hidden="true" />
        <span>Waiting for the other person…</span>
      </div>
    </div>
  );
}

/** Guest state: we opened a link; connection wiring arrives in phase 3. */
function GuestJoining() {
  return (
    <div class="pane pane-center">
      <div class="waiting">
        <span class="spinner" aria-hidden="true" />
        <span>Joining the chat…</span>
      </div>
      <p class="pane-sub">
        Connecting you directly to the other person. Keep this tab open.
      </p>
    </div>
  );
}
