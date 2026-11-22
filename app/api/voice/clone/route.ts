import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/voice/clone
// Body: multipart — fields: demoId, voiceName   file: audioFile (mp3/wav/m4a, max 10 MB)
// Calls ElevenLabs Instant Voice Cloning, stores the voice ID on the demo row.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 503 });
  }

  // Parse multipart body
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const demoId = formData.get("demoId") as string;
  const voiceName = (formData.get("voiceName") as string) || "My Demo Voice";
  const audioFile = formData.get("audioFile") as File | null;

  if (!demoId) return NextResponse.json({ error: "demoId required" }, { status: 400 });
  if (!audioFile) return NextResponse.json({ error: "audioFile required" }, { status: 400 });

  // Verify demo belongs to user
  const demo = await prisma.demo.findFirst({
    where: { id: demoId, workspace: { ownerId: (session.user as any).id } },
  });
  if (!demo) return NextResponse.json({ error: "Demo not found" }, { status: 404 });

  // Check file size (10 MB max)
  if (audioFile.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio file must be under 10 MB" }, { status: 400 });
  }

  // Check MIME type
  const allowed = ["mpeg", "mp3", "wav", "x-wav", "m4a", "mp4", "ogg", "webm", "aac"];
  const mimeSubtype = audioFile.type.split("/")[1] || "";
  if (!allowed.some(t => mimeSubtype.includes(t))) {
    return NextResponse.json({ error: "Unsupported audio format. Use MP3, WAV, or M4A." }, { status: 400 });
  }

  // Call ElevenLabs Add Voice (Instant Clone) API
  const elForm = new FormData();
  elForm.append("name", voiceName);
  elForm.append("description", `Voice clone for DemoHub demo: ${demo.title}`);
  elForm.append("files", audioFile, audioFile.name || "voice_sample.mp3");

  let voiceId: string;
  try {
    const elRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elForm,
    });
    const elData = await elRes.json();
    if (!elRes.ok) {
      console.error("ElevenLabs clone error:", elData);
      return NextResponse.json(
        { error: elData?.detail?.message || String(elData?.detail) || "Voice cloning failed" },
        { status: 502 }
      );
    }
    voiceId = elData.voice_id;
  } catch (err: any) {
    return NextResponse.json({ error: "ElevenLabs request failed: " + err.message }, { status: 502 });
  }

  // Persist voice ID on the demo
  await prisma.demo.update({
    where: { id: demoId },
    data: { clonedVoiceId: voiceId, clonedVoiceName: voiceName },
  });

  return NextResponse.json({ voiceId, voiceName, message: "Voice cloned successfully" });
}
