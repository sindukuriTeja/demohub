import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
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

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG or WebP images accepted" }, { status: 400 });
    }

    const fs = await import("fs");
    const path = await import("path");

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `avatar_${Date.now()}.${ext}`;
    const dir = path.join(process.cwd(), "public", "avatars", demoId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, filename), buf);

    return NextResponse.json({ imageUrl: `/avatars/${demoId}/${filename}` });
  } catch (err: any) {
    console.error("avatar/upload error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
