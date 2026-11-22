import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/avatar/generate
// Body JSON: { stepId, avatarImageUrl, text?, voiceAudioUrl? }
//
// Flow:
//  1. Use the avatar image (uploaded face photo) as the presenter
//  2. Script = step.voiceScript or provided text
//  3. Audio = step.voiceAudioUrl (ElevenLabs MP3) if available, else text TTS via D-ID
//  4. POST to D-ID /talks → get talkId
//  5. Store talkId + set avatarStatus = "generating"
//  6. Client polls /api/avatar/status?stepId=... until done
//
// D-ID docs: https://docs.d-id.com/reference/createtalk
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const didKey = process.env.DID_API_KEY;
  if (!didKey) {
    return NextResponse.json({ error: "DID_API_KEY not configured. Add it to .env" }, { status: 503 });
  }

  const { stepId, avatarImageUrl, text, voiceAudioUrl } = await req.json();
  if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });
  if (!avatarImageUrl) return NextResponse.json({ error: "avatarImageUrl required — upload a face photo first" }, { status: 400 });

  // Load step, verify ownership
  const step = await prisma.demoStep.findFirst({
    where: { id: stepId },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== (session.user as any).id) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Resolve script and audio
  const script = (text || step.voiceScript || step.title || "Welcome to this demo.").trim();
  const audioUrl = voiceAudioUrl || step.voiceAudioUrl;

  // Build D-ID request body
  // If we have a pre-generated ElevenLabs MP3, use audio_url script.
  // Otherwise, use text script (D-ID will do its own TTS with the avatar's default voice).
  const didBody: any = {
    source_url: avatarImageUrl,
    driver_url: "bank://lively",  // natural head movement driver
    config: {
      fluent: true,
      pad_audio: 0.0,
      stitch: true,
    },
  };

  if (audioUrl) {
    // Use our ElevenLabs-cloned voice audio — best quality
    const fullAudioUrl = audioUrl.startsWith("http")
      ? audioUrl
      : `${process.env.NEXTAUTH_URL || "http://localhost:3000"}${audioUrl}`;
    didBody.script = {
      type: "audio",
      audio_url: fullAudioUrl,
      reduce_noise: true,
    };
  } else {
    // Fallback: D-ID built-in TTS
    didBody.script = {
      type: "text",
      input: script,
      provider: {
        type: "elevenlabs",
        voice_id: step.demo.clonedVoiceId || "21m00Tcm4TlvDq8ikWAM",
        voice_config: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
    };
  }

  // Create the D-ID talk
  let talkId: string;
  try {
    const didRes = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(didKey + ":").toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(didBody),
    });

    const didData = await didRes.json();

    if (!didRes.ok) {
      console.error("D-ID error:", JSON.stringify(didData));
      return NextResponse.json(
        { error: didData?.description || didData?.message || "D-ID avatar generation failed" },
        { status: 502 }
      );
    }

    talkId = didData.id;
  } catch (err: any) {
    return NextResponse.json({ error: "D-ID request failed: " + err.message }, { status: 502 });
  }

  // Store talkId and mark generating
  await prisma.demoStep.update({
    where: { id: stepId },
    data: {
      avatarImageUrl,
      avatarTalkId: talkId,
      avatarStatus: "generating",
    },
  });

  return NextResponse.json({
    talkId,
    message: "Avatar video generation started. Poll /api/avatar/status?stepId=" + stepId,
  });
}
