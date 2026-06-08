/**
 * Chat UI (phase 4).
 *
 * Renders the connected conversation: a scrollable list of message bubbles
 * (mine vs theirs, with timestamps) plus the composer. Send-on-enter via a
 * form; the list auto-scrolls to the newest message.
 *
 * Every message lives only in this component's in-memory state, passed down
 * from the room. Nothing is written to storage, so closing or reloading the tab
 * leaves nothing behind — ephemerality by construction.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

/** Renders `main` (messages) + `footer` (composer) for the connected state. */
export function Chat({ messages, onSend }) {
  const bottomRef = useRef(null);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <>
      <main class="body messages">
        {messages.length === 0 ? (
          <div class="empty">
            <p class="empty-title">You're connected</p>
            <p class="empty-sub">Say hi 👋 — messages vanish when you leave.</p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        <div ref={bottomRef} />
      </main>

      <footer class="composer">
        <Composer onSend={onSend} />
      </footer>
    </>
  );
}

function Bubble({ msg }) {
  return (
    <div class={`bubble-row ${msg.mine ? 'mine' : 'theirs'}`}>
      <div class="bubble">
        <span class="bubble-text">{msg.text}</span>
        <time class="bubble-time">{formatTime(msg.ts)}</time>
      </div>
    </div>
  );
}

function Composer({ onSend }) {
  const [text, setText] = useState('');

  function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <form class="composer-form" onSubmit={submit}>
      <input
        class="composer-input"
        type="text"
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        placeholder="Message"
        autocomplete="off"
        autocapitalize="sentences"
        enterkeyhint="send"
        aria-label="Message"
      />
      <button
        type="submit"
        class="btn btn-primary composer-send"
        disabled={!text.trim()}
      >
        Send
      </button>
    </form>
  );
}

/** Local wall-clock time, e.g. "9:42 AM" / "21:42" depending on locale. */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
