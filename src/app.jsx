/**
 * App shell + room/link flow (phase 2) + P2P connection (phase 3) + chat (phase 4).
 *
 * Two top-level states, decided from the URL fragment and in-memory choices —
 * nothing is persisted:
 *
 *   home → no room key yet. "Start a chat" mints a high-entropy key, drops it in
 *          the `#fragment`, and enters a room as the host.
 *   room → a key is present (we minted it, or we opened someone's link). We join
 *          the Trystero room and render by live connection status; once a peer is
 *          on the DataChannel, the live chat UI takes over.
 *
 * Messages live only in memory (`messages` state below). Reload or close = gone.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  generateRoomKey,
  readRoomKeyFromUrl,
  writeRoomKeyToUrl,
  shareableLink,
} from './room.js';
import { useConnection } from './useConnection.js';
import { ShareLink } from './components/ShareLink.jsx';
import { Chat } from './components/Chat.jsx';

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

      {roomKey ? (
        <ChatRoom roomKey={roomKey} isHost={isHost} />
      ) : (
        <Home onStart={startChat} />
      )}
    </div>
  );
}

/** Landing state: a single call-to-action that mints a room. */
function Home({ onStart }) {
  return (
    <main class="body">
      <div class="pane pane-center">
        <p class="pane-title">Start a private chat</p>
        <p class="pane-sub">
          Send the link to one person. The chat is direct, anonymous, and
          vanishes when you close the tab — nothing is ever stored.
        </p>
        <button type="button" class="btn btn-primary btn-lg" onClick={onStart}>
          Start a chat
        </button>
      </div>
    </main>
  );
}

/**
 * In-room view. Joins the P2P room, accumulates messages in memory, and renders
 * by live connection status. The host keeps the share link visible until the
 * other person arrives; once connected, the chat UI takes over.
 */
function ChatRoom({ roomKey, isHost }) {
  const { status, send, subscribe } = useConnection(roomKey);
  const [messages, setMessages] = useState([]);

  // Subscribe once (send/subscribe are stable). Incoming payloads are from the
  // one peer holding the link; parse defensively and never trust shape blindly.
  useEffect(
    () =>
      subscribe((payload) => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: String(payload?.text ?? ''),
            ts: Number(payload?.ts) || Date.now(),
            mine: false,
          },
        ]);
      }),
    [subscribe],
  );

  function handleSend(text) {
    const ts = Date.now();
    send({ text, ts });
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, ts, mine: true },
    ]);
  }

  if (status === 'connected') {
    return <Chat messages={messages} onSend={handleSend} />;
  }

  // Non-connected states are a single centered pane, no composer.
  return (
    <main class="body">
      {status === 'left' ? (
        <PeerLeft isHost={isHost} link={shareableLink(roomKey)} />
      ) : status === 'error' ? (
        <ConnectionError />
      ) : isHost ? (
        <HostWaiting link={shareableLink(roomKey)} />
      ) : (
        <GuestJoining />
      )}
    </main>
  );
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

/** The other peer dropped. 1:1 means the chat is over. */
function PeerLeft({ isHost, link }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">The other person left</p>
      <p class="pane-sub">
        Nothing was saved.{' '}
        {isHost
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
