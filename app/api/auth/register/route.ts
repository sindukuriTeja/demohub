import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        workspace: {
          create: {
            name: name ? `${name}'s Workspace` : "My Workspace",
            slug: uuidv4().slice(0, 8),
          },
        },
      },
      include: { workspace: true },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      workspace: user.workspace,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
