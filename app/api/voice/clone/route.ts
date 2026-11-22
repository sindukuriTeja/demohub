import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any).id as string;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 503 });

    const formData = await req.formData();
    const demoId = formData.get("demoId") as string;
    const voiceName = (formData.get("voiceName") as string) || "My Demo Voice";
    const audioFile = formData.get("audioFile") as File | null;

    if (!demoId) return NextResponse.json({ error: "demoId required" }, { status: 400 });
    if (!audioFile) return NextResponse.json({ error: "audioFile required" }, { status: 400 });

    const demo = await prisma.demo.findFirst({ where: { id: demoId, workspace: { ownerId: userId } } });
    if (!demo) return NextResponse.json({ error: "Demo not found" }, { status: 404 });

    if (audioFile.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });

    const elForm = new FormData();
    elForm.append("name", voiceName);
    elForm.append("description", `Voice clone for: ${demo.title}`);
    elForm.append("files", audioFile, audioFile.name || "voice_sample.mp3");

    const elRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elForm,
    });
    const elData = await elRes.json();
    if (!elRes.ok) {
      const msg = elData?.detail?.message || String(elData?.detail) || "Voice cloning failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const voiceId = elData.voice_id;
    await prisma.demo.update({ where: { id: demoId }, data: { clonedVoiceId: voiceId, clonedVoiceName: voiceName } });

    return NextResponse.json({ voiceId, voiceName, message: "Voice cloned successfully" });
  } catch (err: any) {
    console.error("voice/clone:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
