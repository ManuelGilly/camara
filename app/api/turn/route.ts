import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Devuelve { iceServers: RTCIceServer[], provider: string } al navegador.
// Estrategia (la primera disponible gana):
//   1. Cloudflare Realtime TURN     — gratis 1 TB/mes, requiere cuenta Cloudflare.
//   2. Metered.ca                    — gratis 50 GB/mes, sin tarjeta, solo email.
//   3. Open Relay Project (Metered)  — sin registro, credenciales públicas.
//   4. STUN público                  — fallback (no atraviesa NAT estricto).
//
// El TURN siempre se concatena con STUN público al final como red de seguridad.

const STUN_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Open Relay Project — credenciales públicas, sin signup. Útil para dev.
// Docs: https://www.metered.ca/tools/openrelay/
const OPEN_RELAY: RTCIceServer[] = [
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const TTL_SECONDS = 60 * 60;

export async function GET() {
  // 1. Cloudflare
  const cfKey = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (cfKey && cfToken) {
    const cf = await fetchCloudflare(cfKey, cfToken);
    if (cf) {
      return NextResponse.json({
        iceServers: [...cf, ...STUN_FALLBACK],
        provider: "cloudflare",
        ttl: TTL_SECONDS,
      });
    }
  }

  // 2. Metered.ca (cuenta personal)
  const meteredKey = process.env.METERED_API_KEY;
  const meteredDomain = process.env.METERED_DOMAIN;
  if (meteredKey && meteredDomain) {
    const m = await fetchMetered(meteredDomain, meteredKey);
    if (m) {
      return NextResponse.json({
        iceServers: [...m, ...STUN_FALLBACK],
        provider: "metered",
      });
    }
  }

  // 3. Open Relay público (opt-in con USE_OPEN_RELAY=1)
  if (process.env.USE_OPEN_RELAY === "1") {
    return NextResponse.json({
      iceServers: [...OPEN_RELAY, ...STUN_FALLBACK],
      provider: "open-relay",
    });
  }

  // 4. STUN solo
  return NextResponse.json({
    iceServers: STUN_FALLBACK,
    provider: "stun-only",
  });
}

async function fetchCloudflare(
  keyId: string,
  apiToken: string,
): Promise<RTCIceServer[] | null> {
  try {
    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
        cache: "no-store",
      },
    );
    if (!r.ok) {
      console.error("cloudflare turn", r.status, await r.text().catch(() => ""));
      return null;
    }
    const data = (await r.json()) as { iceServers: RTCIceServer | RTCIceServer[] };
    return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  } catch (e) {
    console.error("cloudflare turn fetch failed", e);
    return null;
  }
}

async function fetchMetered(
  domain: string,
  apiKey: string,
): Promise<RTCIceServer[] | null> {
  try {
    const url = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      console.error("metered turn", r.status, await r.text().catch(() => ""));
      return null;
    }
    const data = (await r.json()) as RTCIceServer[];
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.error("metered turn fetch failed", e);
    return null;
  }
}
