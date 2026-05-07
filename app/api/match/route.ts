import { NextRequest, NextResponse } from "next/server";
import { joinQueue, type Area, type Rol } from "@/lib/signaling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    area?: Area;
    rol?: Rol;
    peerId?: string;
  };
  if (
    !body.peerId ||
    (body.area !== "programacion" && body.area !== "seguridad") ||
    (body.rol !== "cliente" && body.rol !== "asesor")
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const result = await joinQueue(body.area, body.rol, body.peerId);
  return NextResponse.json(result);
}
