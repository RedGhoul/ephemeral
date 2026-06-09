/**
 * P2P connection layer (phase 3) + ephemerality hardening (phase 5).
 *
 * Joins a Trystero room keyed by the URL room key and opens a WebRTC
 * DataChannel directly to the other peer. Signaling rides public Nostr relays
 * (serverless → nothing for us to run or store); the data path is DTLS-encrypted
 * by WebRTC, and the handshake is additionally encrypted with the room key as a
 * password where the platform allows it.
 *
 * Hardening (phase 5):
 *   - **Single-use / strictly 1:1.** We bind to the first peer that joins and
 *     only ever exchange messages with that one peer (targeted sends + sender
 *     filtering). A third party who later opens the same link joins the relay
 *     topic but is ignored and receives nothing — so they can't eavesdrop — and
 *     is told the room is taken so they see a clear "already in use" state.
 *   - **Idle auto-teardown.** After a stretch of no message activity we leave the
 *     room and surface `ended`, so a forgotten tab doesn't linger and a re-visit
 *     is blank.
 *   - **Prompt teardown** on `pagehide` (mobile-reliable) so closing/navigating
 *     drops the connection immediately.
 *
 * Status: 'connecting' | 'connected' | 'left' | 'full' | 'ended' | 'error'.
 * Nothing is persisted.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { joinRoom } from 'trystero/nostr';

/** Namespaces our rooms on the shared relays. Distinct from the room key. */
const APP_ID = 'ephemeral-p2p-chat-v1';

/** Trystero action labels are capped at 12 bytes. */
const MSG_ACTION = 'msg';
const HELLO_ACTION = 'hello';
const FULL_ACTION = 'full';

/** Leave the room after this much silence (no messages either way). */
const IDLE_MS = 5 * 60 * 1000;

export function useConnection(roomKey) {
  const [status, setStatus] = useState('connecting');

  // Refs so the stable `send`/`subscribe` callbacks reach into live connection
  // state without re-running the join effect.
  const sendRef = useRef(null);
  const handlersRef = useRef(new Set());
  const boundPeerRef = useRef(null); // the one peer we're paired with

  useEffect(() => {
    if (!roomKey) return undefined;

    let room;
    try {
      // The room key is the room id. We also pass it as Trystero's `password` to
      // encrypt the relay signaling handshake — but only where `crypto.subtle`
      // exists (a secure context). Over plain http on a LAN IP (the documented
      // phone-test path) subtle crypto is unavailable; we skip the extra layer
      // rather than fail to connect. The key is still an unguessable capability,
      // and the data path stays DTLS-encrypted by WebRTC either way.
      const config = { appId: APP_ID };
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        config.password = roomKey;
      }
      room = joinRoom(config, roomKey);
    } catch {
      setStatus('error');
      return undefined;
    }

    const [sendMessage, getMessage] = room.makeAction(MSG_ACTION);
    const [sendHello, getHello] = room.makeAction(HELLO_ACTION);
    const [sendFull, getFull] = room.makeAction(FULL_ACTION);

    let idleTimer = null;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        teardown();
        setStatus('ended');
      }, IDLE_MS);
    };
    const teardown = () => {
      clearTimeout(idleTimer);
      boundPeerRef.current = null;
      sendRef.current = null;
      try {
        room.leave();
      } catch {
        /* already gone */
      }
    };

    // Only ever send to our bound peer, and count it as activity.
    sendRef.current = (payload) => {
      if (!boundPeerRef.current) return;
      sendMessage(payload, boundPeerRef.current);
      resetIdle();
    };

    getMessage((payload, peerId) => {
      if (peerId !== boundPeerRef.current) return; // ignore non-paired peers
      resetIdle();
      for (const fn of handlersRef.current) fn(payload, peerId);
    });

    // A peer announces itself on connect. If it's not who we're paired with, the
    // room is already taken → tell them so they can bow out cleanly.
    getHello((_, peerId) => {
      if (peerId !== boundPeerRef.current) sendFull(1, peerId);
    });

    // We're the latecomer: the existing pair rejected us. Consume → 'full'.
    getFull(() => {
      boundPeerRef.current = null;
      setStatus('full');
    });

    room.onPeerJoin((peerId) => {
      if (boundPeerRef.current) return; // already paired → ignore third wheels
      // If a pair already exists when we arrive, we're the third wheel; sending
      // hello below will draw a 'full' rejection. We still bind optimistically so
      // a legitimate 1:1 connects instantly; the rejection corrects latecomers.
      boundPeerRef.current = peerId;
      setStatus('connected');
      sendHello(1, peerId);
      resetIdle();
    });

    room.onPeerLeave((peerId) => {
      // Single-use: once our partner leaves, the chat is spent. We don't rebind.
      if (peerId === boundPeerRef.current) {
        teardown();
        setStatus('left');
      }
    });

    // Returning to the tab counts as activity; leaving/closing tears down.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && boundPeerRef.current) {
        resetIdle();
      }
    };
    const onPageHide = () => teardown();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      teardown();
    };
  }, [roomKey]);

  // Stable identities so consumers can depend on them without re-subscribing.
  const send = useCallback((payload) => sendRef.current?.(payload), []);

  const subscribe = useCallback((fn) => {
    handlersRef.current.add(fn);
    return () => handlersRef.current.delete(fn);
  }, []);

  return { status, send, subscribe };
}
