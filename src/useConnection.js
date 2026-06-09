/**
 * P2P connection layer (phase 3).
 *
 * Joins a Trystero room keyed by the URL room key and opens a WebRTC
 * DataChannel directly to the other peer. Signaling rides public Nostr relays
 * (serverless → nothing for us to run or store), and the room key doubles as a
 * password so the SDP/ICE handshake is encrypted on the wire; the media path is
 * DTLS-encrypted by WebRTC itself.
 *
 * This hook owns the connection lifecycle and exposes:
 *   - `status`    : 'connecting' | 'connected' | 'left' | 'error'
 *   - `send(msg)` : send a payload over the DataChannel (consumed in phase 4)
 *   - `subscribe(fn)` : register a message handler, returns an unsubscribe fn
 *
 * Strictly 1:1 for now (see PLAN: group chat is v2). Nothing is persisted.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { joinRoom } from 'trystero/nostr';

/** Namespaces our rooms on the shared relays. Distinct from the room key. */
const APP_ID = 'ephemeral-p2p-chat-v1';

/** Trystero action labels are capped at 12 bytes. */
const MSG_ACTION = 'msg';

export function useConnection(roomKey) {
  const [status, setStatus] = useState('connecting');

  // Stable refs so `send`/`subscribe` identities survive re-renders and the
  // effect doesn't need to re-run when handlers change.
  const sendRef = useRef(null);
  const handlersRef = useRef(new Set());

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
    sendRef.current = sendMessage;

    getMessage((payload, peerId) => {
      for (const fn of handlersRef.current) fn(payload, peerId);
    });

    room.onPeerJoin(() => setStatus('connected'));
    room.onPeerLeave(() => {
      // 1:1 model: once the only peer is gone, the chat is over.
      if (Object.keys(room.getPeers()).length === 0) setStatus('left');
    });

    return () => {
      sendRef.current = null;
      room.leave();
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
