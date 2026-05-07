// Matchmaking + signaling.
// Backend: Upstash Redis si hay credenciales; en memoria si no (dev local).
// Mismo contrato: joinQueue / poll / send / leave.

import { Redis } from "@upstash/redis";

export type Area = "programacion" | "seguridad";
export type Rol = "cliente" | "asesor";

export type SignalMsg =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "bye" };

const PEER_TTL_S = 30;
const QUEUE_TTL_S = 60;
const PARTNER_TTL_S = 60 * 30; // 30 min máx por llamada

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(url && token);

const redis = useRedis ? new Redis({ url: url!, token: token! }) : null;

// ---------- Backend en memoria (fallback dev) ----------
type MemPeer = {
  id: string;
  area: Area;
  rol: Rol;
  partnerId?: string;
  initiator?: boolean;
  inbox: SignalMsg[];
  lastSeen: number;
};
type MemStore = {
  peers: Map<string, MemPeer>;
  queues: Map<string, string[]>;
};
const g = globalThis as unknown as { __signaling?: MemStore };
const mem: MemStore =
  g.__signaling ?? (g.__signaling = { peers: new Map(), queues: new Map() });

function memKey(area: Area, rol: Rol) {
  return `${area}:${rol}`;
}
function memGc() {
  const now = Date.now();
  for (const [id, p] of mem.peers) {
    if (now - p.lastSeen > PEER_TTL_S * 1000) {
      mem.peers.delete(id);
      const q = mem.queues.get(memKey(p.area, p.rol));
      if (q) {
        const i = q.indexOf(id);
        if (i >= 0) q.splice(i, 1);
      }
      if (p.partnerId) {
        const partner = mem.peers.get(p.partnerId);
        if (partner && partner.partnerId === id) {
          partner.inbox.push({ type: "bye" });
          partner.partnerId = undefined;
          partner.initiator = undefined;
        }
      }
    }
  }
}
function counterpart(rol: Rol): Rol {
  return rol === "cliente" ? "asesor" : "cliente";
}

// ---------- API pública ----------
export async function joinQueue(area: Area, rol: Rol, peerId: string) {
  if (redis) return joinQueueRedis(area, rol, peerId);
  return joinQueueMem(area, rol, peerId);
}
export async function poll(peerId: string) {
  if (redis) return pollRedis(peerId);
  return pollMem(peerId);
}
export async function send(peerId: string, msg: SignalMsg) {
  if (redis) return sendRedis(peerId, msg);
  return sendMem(peerId, msg);
}
export async function leave(peerId: string) {
  if (redis) return leaveRedis(peerId);
  return leaveMem(peerId);
}

// ---------- Implementación en memoria ----------
function joinQueueMem(area: Area, rol: Rol, peerId: string) {
  memGc();
  const peer: MemPeer = {
    id: peerId,
    area,
    rol,
    inbox: [],
    lastSeen: Date.now(),
  };
  mem.peers.set(peerId, peer);

  const otherKey = memKey(area, counterpart(rol));
  const otherQueue = mem.queues.get(otherKey) ?? [];
  while (otherQueue.length) {
    const otherId = otherQueue.shift()!;
    const other = mem.peers.get(otherId);
    if (!other || other.partnerId) continue;
    peer.partnerId = other.id;
    other.partnerId = peer.id;
    peer.initiator = peer.rol === "cliente";
    other.initiator = other.rol === "cliente";
    mem.queues.set(otherKey, otherQueue);
    return { matched: true, partnerId: other.id, initiator: peer.initiator };
  }
  mem.queues.set(otherKey, otherQueue);

  const myKey = memKey(area, rol);
  const myQueue = mem.queues.get(myKey) ?? [];
  if (!myQueue.includes(peerId)) myQueue.push(peerId);
  mem.queues.set(myKey, myQueue);
  return { matched: false };
}
function pollMem(peerId: string) {
  memGc();
  const p = mem.peers.get(peerId);
  if (!p) return { ok: false as const };
  p.lastSeen = Date.now();
  const messages = p.inbox.splice(0, p.inbox.length);
  return {
    ok: true as const,
    partnerId: p.partnerId,
    initiator: p.initiator ?? false,
    messages,
  };
}
function sendMem(peerId: string, msg: SignalMsg) {
  memGc();
  const me = mem.peers.get(peerId);
  if (!me || !me.partnerId) return { ok: false as const, reason: "no-peer" };
  const partner = mem.peers.get(me.partnerId);
  if (!partner) return { ok: false as const, reason: "partner-gone" };
  partner.inbox.push(msg);
  return { ok: true as const };
}
function leaveMem(peerId: string) {
  const p = mem.peers.get(peerId);
  if (!p) return { ok: true as const };
  if (p.partnerId) {
    const partner = mem.peers.get(p.partnerId);
    if (partner && partner.partnerId === peerId) {
      partner.inbox.push({ type: "bye" });
      partner.partnerId = undefined;
      partner.initiator = undefined;
    }
  }
  const q = mem.queues.get(memKey(p.area, p.rol));
  if (q) {
    const i = q.indexOf(peerId);
    if (i >= 0) q.splice(i, 1);
  }
  mem.peers.delete(peerId);
  return { ok: true as const };
}

// ---------- Implementación Redis (Upstash) ----------
// Esquema de claves:
//   peer:{id}            HASH { area, rol, partnerId, initiator } TTL=PEER_TTL_S
//   inbox:{id}           LIST de SignalMsg JSON      TTL=PARTNER_TTL_S
//   queue:{area}:{rol}   LIST FIFO de peerIds        TTL=QUEUE_TTL_S (refrescada en cada push)

const k = {
  peer: (id: string) => `peer:${id}`,
  inbox: (id: string) => `inbox:${id}`,
  queue: (area: Area, rol: Rol) => `queue:${area}:${rol}`,
};

async function joinQueueRedis(area: Area, rol: Rol, peerId: string) {
  const r = redis!;
  await r.hset(k.peer(peerId), { area, rol });
  await r.expire(k.peer(peerId), PEER_TTL_S);
  await r.expire(k.inbox(peerId), PARTNER_TTL_S);

  // Intentar tomar contraparte: LPOP repetidamente hasta encontrar uno vivo y libre
  const otherQueue = k.queue(area, counterpart(rol));
  for (let i = 0; i < 20; i++) {
    const otherId = (await r.lpop<string>(otherQueue)) ?? null;
    if (!otherId) break;
    const other = await r.hgetall<{
      area: Area;
      rol: Rol;
      partnerId?: string;
    }>(k.peer(otherId));
    if (!other) continue; // expiró
    if (other.partnerId) continue; // ya tiene
    // Emparejar atómicamente — best effort: setear ambos
    const initiatorMe = rol === "cliente";
    await r.hset(k.peer(peerId), {
      partnerId: otherId,
      initiator: initiatorMe ? "1" : "0",
    });
    await r.hset(k.peer(otherId), {
      partnerId: peerId,
      initiator: other.rol === "cliente" ? "1" : "0",
    });
    await r.expire(k.peer(peerId), PARTNER_TTL_S);
    await r.expire(k.peer(otherId), PARTNER_TTL_S);
    return { matched: true, partnerId: otherId, initiator: initiatorMe };
  }

  // Encolar
  const myQueue = k.queue(area, rol);
  await r.rpush(myQueue, peerId);
  await r.expire(myQueue, QUEUE_TTL_S);
  return { matched: false };
}

async function pollRedis(peerId: string) {
  const r = redis!;
  const p = await r.hgetall<{
    area: Area;
    rol: Rol;
    partnerId?: string;
    initiator?: string;
  }>(k.peer(peerId));
  if (!p) return { ok: false as const };
  // refrescar TTL como heartbeat
  await r.expire(k.peer(peerId), p.partnerId ? PARTNER_TTL_S : PEER_TTL_S);

  // drenar inbox
  const items = (await r.lrange<string>(k.inbox(peerId), 0, -1)) ?? [];
  if (items.length) await r.del(k.inbox(peerId));
  const messages: SignalMsg[] = items.map((s) =>
    typeof s === "string" ? (JSON.parse(s) as SignalMsg) : (s as SignalMsg)
  );
  return {
    ok: true as const,
    partnerId: p.partnerId,
    initiator: p.initiator === "1",
    messages,
  };
}

async function sendRedis(peerId: string, msg: SignalMsg) {
  const r = redis!;
  const p = await r.hgetall<{ partnerId?: string }>(k.peer(peerId));
  if (!p || !p.partnerId) return { ok: false as const, reason: "no-peer" };
  const exists = await r.exists(k.peer(p.partnerId));
  if (!exists) return { ok: false as const, reason: "partner-gone" };
  await r.rpush(k.inbox(p.partnerId), JSON.stringify(msg));
  await r.expire(k.inbox(p.partnerId), PARTNER_TTL_S);
  return { ok: true as const };
}

async function leaveRedis(peerId: string) {
  const r = redis!;
  const p = await r.hgetall<{
    area: Area;
    rol: Rol;
    partnerId?: string;
  }>(k.peer(peerId));
  if (!p) return { ok: true as const };
  if (p.partnerId) {
    const exists = await r.exists(k.peer(p.partnerId));
    if (exists) {
      await r.rpush(k.inbox(p.partnerId), JSON.stringify({ type: "bye" }));
      await r.hdel(k.peer(p.partnerId), "partnerId", "initiator");
      await r.expire(k.peer(p.partnerId), PEER_TTL_S);
    }
  }
  if (p.area && p.rol) await r.lrem(k.queue(p.area, p.rol), 0, peerId);
  await r.del(k.peer(peerId));
  await r.del(k.inbox(peerId));
  return { ok: true as const };
}

export const config = { PEER_TTL_S, QUEUE_TTL_S, PARTNER_TTL_S, useRedis };
