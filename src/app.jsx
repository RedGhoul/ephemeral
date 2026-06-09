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
  clearRoomKeyFromUrl,
  shareableLink,
} from './room.js';
import { useConnection } from './useConnection.js';
import { ShareLink } from './components/ShareLink.jsx';
import { Chat } from './components/Chat.jsx';

/**
 * Monotonic per-tab message id. Deliberately not `crypto.randomUUID()`, which is
 * undefined in insecure contexts (e.g. testing over plain http on a LAN IP) — a
 * counter is unique within the tab and works everywhere. Ids are local-only.
 */
let msgSeq = 0;
const nextMsgId = () => `m${msgSeq++}`;

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

  // Drop the spent room: clear the fragment and fall back to a blank home.
  function reset() {
    clearRoomKeyFromUrl();
    setRoomKey(null);
    setIsHost(false);
  }

  return (
    <div class="screen">
      <header class="topbar">
        <span class="brand">ephemeral</span>
        <span class="tagline">nothing is saved</span>
      </header>

      {roomKey ? (
        <ChatRoom roomKey={roomKey} isHost={isHost} onReset={reset} />
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
function ChatRoom({ roomKey, isHost, onReset }) {
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
            id: nextMsgId(),
            text: String(payload?.text ?? ''),
            ts: Number(payload?.ts) || Date.now(),
            mine: false,
          },
        ]);
      }),
    [subscribe],
  );

  // Ephemerality: the moment a chat ends (peer left / idle / full / error), wipe
  // the in-memory transcript so nothing lingers even in this live tab.
  const isOver = status !== 'connecting' && status !== 'connected';
  useEffect(() => {
    if (isOver) setMessages([]);
  }, [isOver]);

  function handleSend(text) {
    const ts = Date.now();
    send({ text, ts });
    setMessages((prev) => [
      ...prev,
      { id: nextMsgId(), text, ts, mine: true },
    ]);
  }

  if (status === 'connected') {
    return <Chat messages={messages} onSend={handleSend} />;
  }

  // Non-connected states are a single centered pane, no composer.
  return (
    <main class="body">
      {status === 'left' ? (
        <PeerLeft onReset={onReset} />
      ) : status === 'full' ? (
        <RoomFull onReset={onReset} />
      ) : status === 'ended' ? (
        <Ended onReset={onReset} />
      ) : status === 'error' ? (
        <ConnectionError onReset={onReset} />
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

/** A spent room is terminal — single-use links don't reconnect. */
function StartOver({ onReset }) {
  return (
    <button type="button" class="btn btn-primary" onClick={onReset}>
      Start a new chat
    </button>
  );
}

/** The other peer dropped. Single-use ⇒ the chat is over, no reconnect. */
function PeerLeft({ onReset }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">The other person left</p>
      <p class="pane-sub">
        The chat is over and nothing was saved. This link is spent — start a new
        one to chat again.
      </p>
      <StartOver onReset={onReset} />
    </div>
  );
}

/** We opened a link whose pair has already formed. */
function RoomFull({ onReset }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">This chat is already in use</p>
      <p class="pane-sub">
        These links are for one pair only. Ask for a fresh link, or start your
        own chat.
      </p>
      <StartOver onReset={onReset} />
    </div>
  );
}

/** Torn down after a stretch of inactivity. */
function Ended({ onReset }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">Chat ended</p>
      <p class="pane-sub">
        Closed after a while idle, so nothing was left hanging around. Nothing
        was saved.
      </p>
      <StartOver onReset={onReset} />
    </div>
  );
}

/** Signaling failed to even start. */
function ConnectionError({ onReset }) {
  return (
    <div class="pane pane-center">
      <span class="status-dot status-dot-off" aria-hidden="true" />
      <p class="pane-title">Couldn't connect</p>
      <p class="pane-sub">
        We couldn't reach the signaling relays. Check your connection and try
        again.
      </p>
      <StartOver onReset={onReset} />
    </div>
  );
}
