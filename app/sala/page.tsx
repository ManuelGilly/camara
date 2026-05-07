import { Suspense } from "react";
import RoomClient from "./RoomClient";

export const dynamic = "force-dynamic";

export default function SalaPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-muted">Cargando…</div>}>
      <RoomClient />
    </Suspense>
  );
}
