/**
 * Shareable-link controls for the host's "waiting" screen.
 *
 * Two ways to hand the link to the other person:
 *  - the native share sheet (`navigator.share`) on phones that support it, which
 *    is the natural path to SMS/WhatsApp/etc. on mobile;
 *  - a clipboard copy fallback, always available, with brief "Copied" feedback.
 *
 * Nothing is stored; the link is rendered from in-memory state.
 */
import { useState } from 'preact/hooks';

const CAN_SHARE = typeof navigator !== 'undefined' && !!navigator.share;

export function ShareLink({ link }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API can reject (permissions / insecure context); fall back to
      // selecting the text so the user can copy it by hand.
      selectLinkText();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function share() {
    try {
      await navigator.share({
        title: 'ephemeral',
        text: 'Chat with me — this link opens a private, disappearing chat.',
        url: link,
      });
    } catch {
      // User dismissed the sheet, or share failed — no-op, copy is still there.
    }
  }

  return (
    <div class="share">
      <button
        type="button"
        class="link-field"
        onClick={copy}
        title="Tap to copy"
      >
        <span class="link-text">{link}</span>
      </button>

      <div class="share-actions">
        {CAN_SHARE && (
          <button type="button" class="btn btn-primary" onClick={share}>
            Share link
          </button>
        )}
        <button
          type="button"
          class={`btn ${CAN_SHARE ? 'btn-ghost' : 'btn-primary'}`}
          onClick={copy}
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

/** Last-resort fallback: select the rendered link so the user can copy manually. */
function selectLinkText() {
  const el = document.querySelector('.link-text');
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
