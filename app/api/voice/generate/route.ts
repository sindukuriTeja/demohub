import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not set in .env" }, { status: 503 });
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { stepId, text, voiceId: requestedVoiceId } = body;

    if (!stepId) return NextResponse.json({ error: "stepId is required" }, { status: 400 });
    if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

    // ── Load step ──────────────────────────────────────────────────────────
    const step = await prisma.demoStep.findFirst({
      where: { id: stepId },
      include: { demo: { include: { workspace: true } } },
    });

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    if (step.demo.workspace.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Resolve voice ──────────────────────────────────────────────────────
    // priority: explicitly passed → cloned voice on demo → ElevenLabs default "Rachel"
    const voiceId = requestedVoiceId
      || step.demo.clonedVoiceId
      || "21m00Tcm4TlvDq8ikWAM";

    // Mark as generating
    await prisma.demoStep.update({
      where: { id: stepId },
      data: { voiceScript: text.trim(), voiceStatus: "generating" },
    });

    // ── Call ElevenLabs TTS ────────────────────────────────────────────────
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      let errMsg = `ElevenLabs HTTP ${ttsRes.status}`;
      try {
        const errData = await ttsRes.json();
        errMsg = errData?.detail?.message || String(errData?.detail) || errMsg;
        console.error("ElevenLabs TTS error:", errData);
      } catch {}
      await prisma.demoStep.update({ where: { id: stepId }, data: { voiceStatus: "failed" } });
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const arrayBuf = await ttsRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);

    // ── Save audio file ────────────────────────────────────────────────────
    // Dynamic imports of Node built-ins inside the handler avoid any SSR edge issues
    const fs = await import("fs");
    const path = await import("path");

    const voiceDir = path.join(process.cwd(), "public", "voice", step.demoId);
    if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });

    const filename = `${stepId}.mp3`;
    const filepath = path.join(voiceDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    const audioUrl = `/voice/${step.demoId}/${filename}`;

    // ── Update DB ──────────────────────────────────────────────────────────
    await prisma.demoStep.update({
      where: { id: stepId },
      data: {
        voiceScript: text.trim(),
        voiceAudioUrl: audioUrl,
        voiceStatus: "done",
      },
    });

    return NextResponse.json({
      audioUrl,
      voiceId,
      message: "Voice generated successfully",
    });

  } catch (err: any) {
    console.error("voice/generate unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + (err?.message ?? String(err)) },
      { status: 500 }
    );
  }
}
