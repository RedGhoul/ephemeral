/**
 * Room key + URL-fragment plumbing.
 *
 * The room key IS the capability to join a chat: a high-entropy random string
 * carried in the URL `#fragment`. Fragments are never sent to a server, so the
 * secret stays between whoever holds the link — which is the whole point.
 *
 * Nothing here is persisted. The key lives in the URL and in memory only.
 */

/** 16 bytes = 128 bits of entropy. Plenty to make a room key unguessable. */
const KEY_BYTES = 16;

/**
 * Base64url-encode bytes (URL-safe, no padding) so the key drops cleanly into a
 * fragment without needing to be percent-encoded.
 */
function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a fresh, high-entropy room key using the platform CSPRNG. */
export function generateRoomKey() {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * Read the room key from the current URL fragment, or null if absent.
 * The fragment is just the raw key (e.g. `#a8Kf...`); we strip the leading `#`.
 */
export function readRoomKeyFromUrl() {
  const frag = window.location.hash.replace(/^#/, '').trim();
  return frag.length > 0 ? frag : null;
}

/**
 * Put a room key into the URL fragment without adding a history entry, so the
 * back button doesn't bounce the user through half-formed room states.
 */
export function writeRoomKeyToUrl(key) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}#${key}`);
}

/**
 * Strip the room key from the URL so a reload lands back on a blank home screen.
 * Used when a chat ends (peer left / idle teardown / start over): the spent link
 * shouldn't linger in the address bar.
 */
export function clearRoomKeyFromUrl() {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

/** Build the full shareable link for a given room key. */
export function shareableLink(key) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${key}`;
}
