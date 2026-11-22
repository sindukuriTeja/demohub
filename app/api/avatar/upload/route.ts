import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// POST /api/avatar/upload
// Multipart: demoId, file (image/jpeg|png|webp, max 5MB)
// Saves to /public/avatars/{demoId}/avatar_{timestamp}.jpg
// Returns { imageUrl } — a publicly accessible URL D-ID can reach.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const demoId = formData.get("demoId") as string;
  const file = formData.get("file") as File | null;

  if (!demoId) return NextResponse.json({ error: "demoId required" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  // Validate image
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG or WebP images are accepted" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `avatar_${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "avatars", demoId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, filename), buf);

  const imageUrl = `/avatars/${demoId}/${filename}`;
  return NextResponse.json({ imageUrl });
}
