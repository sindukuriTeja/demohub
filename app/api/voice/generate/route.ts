import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id as string;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 503 });

    const { stepId, text, voiceId: reqVoiceId } = await req.json();
    if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });
    if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

    const step = await prisma.demoStep.findFirst({
      where: { id: stepId },
      include: { demo: { include: { workspace: true } } },
    });
    if (!step || step.demo.workspace.ownerId !== userId)
      return NextResponse.json({ error: "Step not found" }, { status: 404 });

    const voiceId = reqVoiceId || step.demo.clonedVoiceId || "21m00Tcm4TlvDq8ikWAM";

    await prisma.demoStep.update({ where: { id: stepId }, data: { voiceScript: text.trim(), voiceStatus: "generating" } });

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.trim(),
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
      }),
    });

    if (!ttsRes.ok) {
      let msg = `ElevenLabs HTTP ${ttsRes.status}`;
      try { const e = await ttsRes.json(); msg = e?.detail?.message || String(e?.detail) || msg; } catch {}
      await prisma.demoStep.update({ where: { id: stepId }, data: { voiceStatus: "failed" } });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    const fs = await import("fs");
    const path = await import("path");
    const dir = path.join(process.cwd(), "public", "voice", step.demoId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${stepId}.mp3`;
    fs.writeFileSync(path.join(dir, filename), audioBuffer);
    const audioUrl = `/voice/${step.demoId}/${filename}`;

    await prisma.demoStep.update({
      where: { id: stepId },
      data: { voiceScript: text.trim(), voiceAudioUrl: audioUrl, voiceStatus: "done" },
    });

    return NextResponse.json({ audioUrl, voiceId, message: "Voice generated successfully" });
  } catch (err: any) {
    console.error("voice/generate:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
