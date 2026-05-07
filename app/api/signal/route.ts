import { NextRequest, NextResponse } from "next/server";
import { poll, send, leave, type SignalMsg } from "@/lib/signaling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const peerId = req.nextUrl.searchParams.get("peerId");
  if (!peerId)
    return NextResponse.json({ error: "missing peerId" }, { status: 400 });
  const result = await poll(peerId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    peerId?: string;
    msg?: SignalMsg;
    leave?: boolean;
  };
  if (!body.peerId)
    return NextResponse.json({ error: "missing peerId" }, { status: 400 });
  if (body.leave) {
    await leave(body.peerId);
    return NextResponse.json({ ok: true });
  }
  if (!body.msg)
    return NextResponse.json({ error: "missing msg" }, { status: 400 });
  const r = await send(body.peerId, body.msg);
  return NextResponse.json(r);
}
