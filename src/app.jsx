/**
 * App shell + room/link flow (phase 2) + P2P connection (phase 3).
 *
 * Two top-level states, decided from the URL fragment and in-memory choices —
 * nothing is persisted:
 *
 *   home → no room key yet. "Start a chat" mints a high-entropy key, drops it in
 *          the `#fragment`, and enters a room as the host.
 *   room → a key is present (we minted it, or we opened someone's link). We join
 *          the Trystero room and render by live connection status.
 *
 * The connection (`useConnection`) opens a WebRTC DataChannel between the two
 * phones; the host/guest difference is only which copy shows while connecting.
 * The live chat UI (message bubbles, composer) lands in phase 4 and slots into
 * the connected state below.
 */
import { useState } from 'preact/hooks';
import {
  generateRoomKey,
  readRoomKeyFromUrl,
  writeRoomKeyToUrl,
  shareableLink,
} from './room.js';
import { useConnection } from './useConnection.js';
import { ShareLink } from './components/ShareLink.jsx';

export function App() {
  // Decide once, from the URL. A key already in the fragment means we arrived
  // via someone's link → join as guest. Otherwise we start at home.
  const initialKey = readRoomKeyFromUrl();
  const [roomKey, setRoomKey] = useState(initialKey);
  const [isHost, setIsHost] = useState(false);

  function startChat() {
    const key = generateRoomKey();
    writeRoomKeyToUrl(key);
    setRoomKey(key);
    setIsHost(true);
  }

  return (
    <div class="screen">
      <header class="topbar">
        <span class="brand">ephemeral</span>
        <span class="tagline">nothing is saved</span>
      </header>

      <main class="body">
        {roomKey ? (
          <ChatRoom roomKey={roomKey} isHost={isHost} />
        ) : (
          <Home onStart={startChat} />
        )}
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

/**
 * In-room view. Joins the P2P room and renders by live connection status. The
 * host keeps the share link visible until the other person arrives.
 */
function ChatRoom({ roomKey, isHost }) {
  const { status } = useConnection(roomKey);
  const link = shareableLink(roomKey);

  switch (status) {
    case 'connected':
      return <Connected />;
    case 'left':
      return <PeerLeft isHost={isHost} link={link} />;
    case 'error':
      return <ConnectionError />;
    default: // 'connecting'
      return isHost ? <HostWaiting link={link} /> : <GuestJoining />;
  }
}

/** Host, connecting: hand out the link and wait for the other person. */
function HostWaiting({ link }) {
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

/** Guest, connecting: we opened a link and are dialing the other peer. */
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

/** Both peers are on a direct DataChannel. Chat UI arrives in phase 4. */
function Connected() {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-ok" aria-hidden="true" />
      <p class="pane-title">Connected</p>
      <p class="pane-sub">
        You're on a direct, encrypted link with the other person. Messaging lands
        next.
      </p>
    </div>
  );
}

/** The other peer dropped. 1:1 means the chat is over. */
function PeerLeft({ isHost, link }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">The other person left</p>
      <p class="pane-sub">
        Nothing was saved. {isHost
          ? 'Share the link again to reconnect, or start fresh.'
          : 'Ask for a new link to start again.'}
      </p>
      {isHost && <ShareLink link={link} />}
    </div>
  );
}

/** Signaling failed to even start. */
function ConnectionError() {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">Couldn't connect</p>
      <p class="pane-sub">
        We couldn't reach the signaling relays. Check your connection and reload
        the link.
      </p>
    </div>
  );
}
