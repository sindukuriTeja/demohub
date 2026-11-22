import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const demoId = formData.get("demoId") as string;
    const file = formData.get("file") as File | null;

    if (!demoId) return NextResponse.json({ error: "demoId required" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Max 5 MB" }, { status: 400 });

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return NextResponse.json({ error: "JPEG/PNG/WebP only" }, { status: 400 });

    const fs = await import("fs");
    const path = await import("path");
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const filename = `avatar_${Date.now()}.${ext}`;
    const dir = path.join(process.cwd(), "public", "avatars", demoId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({ imageUrl: `/avatars/${demoId}/${filename}` });
  } catch (err: any) {
    console.error("avatar/upload:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
