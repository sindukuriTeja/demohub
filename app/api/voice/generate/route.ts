import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// POST /api/voice/generate
// Body JSON: { stepId, text, voiceId? }
// voiceId is optional — falls back to demo's clonedVoiceId, then ElevenLabs default.
// Generates TTS audio, saves as /public/voice/{demoId}/{stepId}.mp3,
// updates step.voiceAudioUrl and step.voiceStatus.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 503 });
  }

  const { stepId, text, voiceId: requestedVoiceId } = await req.json();
  if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Load step + demo, verify ownership
  const step = await prisma.demoStep.findFirst({
    where: { id: stepId },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Resolve voice ID: request → demo clone → ElevenLabs "Rachel" (default)
  const voiceId = requestedVoiceId || step.demo.clonedVoiceId || "21m00Tcm4TlvDq8ikWAM";

  // Mark generating
  await prisma.demoStep.update({
    where: { id: stepId },
    data: { voiceScript: text.trim(), voiceStatus: "generating" },
  });

  // Call ElevenLabs TTS
  let audioBuffer: Buffer;
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
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
      const errData = await ttsRes.json().catch(() => ({}));
      console.error("ElevenLabs TTS error:", errData);
      await prisma.demoStep.update({ where: { id: stepId }, data: { voiceStatus: "failed" } });
      return NextResponse.json(
        { error: errData?.detail?.message || errData?.detail || "TTS generation failed" },
        { status: 502 }
      );
    }

    const arrayBuf = await ttsRes.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuf);
  } catch (err: any) {
    await prisma.demoStep.update({ where: { id: stepId }, data: { voiceStatus: "failed" } });
    return NextResponse.json({ error: "ElevenLabs request failed: " + err.message }, { status: 502 });
  }

  // Save to disk: /public/voice/{demoId}/{stepId}.mp3
  const voiceDir = path.join(process.cwd(), "public", "voice", step.demoId);
  if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });
  const filename = `${stepId}.mp3`;
  const filepath = path.join(voiceDir, filename);
  fs.writeFileSync(filepath, audioBuffer);

  const audioUrl = `/voice/${step.demoId}/${filename}`;

  // Update step
  await prisma.demoStep.update({
    where: { id: stepId },
    data: {
      voiceScript: text.trim(),
      voiceAudioUrl: audioUrl,
      voiceStatus: "done",
    },
  });

  return NextResponse.json({ audioUrl, voiceId, message: "Voice generated successfully" });
}
