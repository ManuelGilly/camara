"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { newPeerConnection, uid } from "@/lib/rtc";
import type { SignalMsg, Area, Rol } from "@/lib/signaling";

type Status =
  | "idle"
  | "media"
  | "queued"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

const labels: Record<Area, string> = {
  programacion: "Programación",
  seguridad: "Seguridad informática",
};

export default function RoomClient() {
  const params = useSearchParams();
  const router = useRouter();

  const area = (params.get("area") as Area) || "programacion";
  const rol = (params.get("rol") as Rol) || "cliente";

  const peerIdRef = useRef<string>("");
  if (!peerIdRef.current) peerIdRef.current = uid();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteSetRef = useRef(false);
  const partnerIdRef = useRef<string | null>(null);
  const initiatorRef = useRef(false);
  const pollingRef = useRef(false);
  const stopRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const counterpartLabel = useMemo(
    () => (rol === "cliente" ? "asesor" : "cliente"),
    [rol]
  );

  useEffect(() => {
    if (
      (area !== "programacion" && area !== "seguridad") ||
      (rol !== "cliente" && rol !== "asesor")
    ) {
      setError("Parámetros inválidos");
      setStatus("error");
      return;
    }
    start().catch((e) => {
      console.error(e);
      setError(e?.message ?? String(e));
      setStatus("error");
    });
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setStatus("media");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      await localVideoRef.current.play().catch(() => {});
    }

    setStatus("queued");
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area, rol, peerId: peerIdRef.current }),
    }).then((r) => r.json());

    if (res.matched) {
      partnerIdRef.current = res.partnerId;
      initiatorRef.current = !!res.initiator;
      setStatus("connecting");
      await ensurePc();
      if (initiatorRef.current) await createOffer();
    }
    startPolling();
  }

  async function ensurePc() {
    if (pcRef.current) return pcRef.current;
    const pc = await newPeerConnection();
    pcRef.current = pc;

    const stream = localStreamRef.current!;
    for (const t of stream.getTracks()) pc.addTrack(t, stream);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: "ice", candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      const [remote] = e.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote;
        remoteVideoRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setStatus("connected");
      if (s === "failed" || s === "disconnected" || s === "closed") {
        // dejamos al servidor / partner manejar el cierre
      }
    };
    return pc;
  }

  async function createOffer() {
    const pc = await ensurePc();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: offer.sdp! });
  }

  async function handleSignal(msg: SignalMsg) {
    const pc = await ensurePc();
    if (msg.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      remoteSetRef.current = true;
      await drainIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: "answer", sdp: answer.sdp! });
    } else if (msg.type === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      remoteSetRef.current = true;
      await drainIce();
    } else if (msg.type === "ice") {
      if (remoteSetRef.current) {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch (e) {
          console.warn("ice add error", e);
        }
      } else {
        pendingIceRef.current.push(msg.candidate);
      }
    } else if (msg.type === "bye") {
      setStatus("ended");
      cleanup();
    }
  }

  async function drainIce() {
    const pc = pcRef.current!;
    for (const c of pendingIceRef.current.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn(e);
      }
    }
  }

  function sendSignal(msg: SignalMsg) {
    fetch("/api/signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId: peerIdRef.current, msg }),
    }).catch(() => {});
  }

  function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = true;
    (async () => {
      while (!stopRef.current) {
        try {
          const r = await fetch(
            `/api/signal?peerId=${peerIdRef.current}`,
            { cache: "no-store" }
          ).then((r) => r.json());
          if (!r.ok) {
            await sleep(800);
            continue;
          }
          if (r.partnerId && !partnerIdRef.current) {
            partnerIdRef.current = r.partnerId;
            initiatorRef.current = !!r.initiator;
            setStatus("connecting");
            await ensurePc();
            if (initiatorRef.current) await createOffer();
          }
          for (const m of r.messages as SignalMsg[]) {
            await handleSignal(m);
          }
        } catch (e) {
          console.warn("poll error", e);
        }
        await sleep(700);
      }
    })();
  }

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function cleanup() {
    stopRef.current = true;
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {}
        });
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    fetch("/api/signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId: peerIdRef.current, leave: true }),
      keepalive: true,
    }).catch(() => {});
  }

  function hangup() {
    sendSignal({ type: "bye" });
    setStatus("ended");
    cleanup();
  }

  function toggleMute() {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  }
  function toggleCam() {
    const s = localStreamRef.current;
    if (!s) return;
    s.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff((c) => !c);
  }

  const statusText = {
    idle: "Inicializando…",
    media: "Pidiendo permiso de cámara y micrófono…",
    queued: `En espera de un ${counterpartLabel} disponible…`,
    connecting: "Conectando…",
    connected: "En llamada",
    ended: "Llamada finalizada",
    error: "Error",
  }[status];

  const dotClass =
    status === "connected"
      ? "dot-ok"
      : status === "queued" || status === "connecting" || status === "media"
        ? "dot-wait"
        : "dot-off";

  return (
    <div className="px-4 sm:px-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <span className="chip">
          <span className={`dot ${dotClass}`} />
          {statusText}
        </span>
        <span className="chip">Área: {labels[area]}</span>
        <span className="chip">Rol: {rol === "cliente" ? "Cliente" : "Asesor"}</span>
        <button
          className="btn btn-ghost ml-auto"
          onClick={() => {
            cleanup();
            router.push("/");
          }}
        >
          ← Volver
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <div className="font-semibold mb-1">No se pudo iniciar la llamada</div>
          <div className="text-muted">{error}</div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <div className="video-tile">
          <video ref={remoteVideoRef} playsInline autoPlay />
          <div className="label">
            {status === "connected"
              ? `Tu ${counterpartLabel}`
              : `Esperando ${counterpartLabel}…`}
          </div>
        </div>
        <div className="video-tile">
          <video ref={localVideoRef} playsInline autoPlay muted />
          <div className="label">Tú</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        <button className="btn btn-ghost" onClick={toggleMute}>
          {muted ? "🔇 Activar micrófono" : "🎤 Silenciar"}
        </button>
        <button className="btn btn-ghost" onClick={toggleCam}>
          {camOff ? "🎥 Activar cámara" : "📷 Apagar cámara"}
        </button>
        <button className="btn btn-danger" onClick={hangup}>
          Colgar
        </button>
      </div>

      <p className="mt-6 text-xs text-muted text-center">
        Conexión peer-to-peer cifrada (DTLS-SRTP). El servidor solo intercambia
        mensajes de señalización; el audio y video van directamente entre los
        navegadores.
      </p>
    </div>
  );
}
