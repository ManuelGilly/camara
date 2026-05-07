// ICE servers — se piden a /api/turn cada vez que se crea un peer.
// El endpoint decide si usar Cloudflare TURN (si está configurado) o STUN público.

const STUN_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch("/api/turn", { cache: "no-store" });
    if (!r.ok) return STUN_FALLBACK;
    const data = (await r.json()) as { iceServers: RTCIceServer[] };
    return Array.isArray(data.iceServers) && data.iceServers.length
      ? data.iceServers
      : STUN_FALLBACK;
  } catch {
    return STUN_FALLBACK;
  }
}

export async function newPeerConnection() {
  const iceServers = await fetchIceServers();
  return new RTCPeerConnection({
    iceServers,
    bundlePolicy: "max-bundle",
    iceTransportPolicy: "all",
  });
}

export function uid() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
