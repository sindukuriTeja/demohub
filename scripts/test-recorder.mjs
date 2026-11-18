// End-to-end recorder test (run with: node scripts/test-recorder.mjs)
// Drives the recorder server directly + the token-authed internal API routes,
// bypassing NextAuth. Verifies: Playwright launch, WS state msg, click→step→caption, DB persistence.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const REC = "http://localhost:3001";
const REC_WS = "ws://localhost:3001";

const TEST_EMAIL = `rec-test+${Date.now()}@example.com`;

function log(...a) {
  console.log("[test]", ...a);
}

async function main() {
  // 1. Create a throwaway user + workspace + demo + RecorderSession with a known token
  const { v4: uuidv4 } = await import("uuid");
  const bcrypt = (await import("bcryptjs")).default;
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Rec Test",
      passwordHash: await bcrypt.hash("password123", 10),
      workspace: {
        create: { name: "Rec Test WS", slug: uuidv4().slice(0, 8) },
      },
    },
    include: { workspace: true },
  });
  const demo = await prisma.demo.create({
    data: {
      workspaceId: user.workspace.id,
      title: "Rec Test Demo",
      type: "interactive",
    },
  });

  const sessionId = "t" + Math.random().toString(36).slice(2, 10);
  const token = "k" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const REC_URL = "http://localhost:3000/login";
  await prisma.recorderSession.create({
    data: {
      id: sessionId,
      demoId: demo.id,
      userId: user.id,
      status: "recording",
      url: REC_URL,
      viewport: "1280x720",
      token,
      stepCount: 0,
    },
  });
  log("created demo", demo.id, "session", sessionId);

  // 2. Ask the recorder server to launch a Playwright browser for this session
  const cs = await fetch(`${REC}/create-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: sessionId,
      demoId: demo.id,
      userId: user.id,
      url: REC_URL,
      viewport: "1280x720",
      token,
    }),
  });
  log("create-session:", cs.status, await cs.text());

  // 3. Connect a WebSocket client and capture messages
  const wsMod = await import("ws");
  const WebSocket = wsMod.WebSocket || wsMod.default;
  const ws = new WebSocket(`${REC_WS}/${sessionId}?token=${token}`);
  ws.binaryType = "arraybuffer";

  const messages = [];
  let frameCount = 0;
  let gotState = false;
  let stepCreatedMsg = null;
  let captionMsg = null;

  await new Promise((resolve) => {
    let clicked = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const hardTimeout = setTimeout(finish, 30000); // hard cap
    ws.on("open", () => log("ws open"));
    ws.on("message", (raw, isBinary) => {
      if (isBinary) {
        frameCount++;
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      messages.push(msg);
      log("ws msg:", msg.type, JSON.stringify(msg).slice(0, 120));
      if (msg.type === "state" && !gotState) {
        gotState = true;
        // Wait for a few screencast frames, then send a click
        setTimeout(() => {
          if (!clicked) {
            clicked = true;
            log("sending mousedown at (200,300)");
            ws.send(JSON.stringify({ type: "mousedown", x: 200, y: 300 }));
          }
        }, 1500);
      }
      if (msg.type === "step_created") stepCreatedMsg = msg;
      if (msg.type === "step_caption") {
        captionMsg = msg;
        clearTimeout(hardTimeout);
        setTimeout(finish, 500);
      }
    });
    ws.on("close", (code, reason) => {
      log("ws closed:", code, reason.toString());
      finish();
    });
    ws.on("error", (e) => log("ws error:", e.message));
  });

  ws.close();
  log("frames received:", frameCount, "json messages:", messages.length);
  log("gotState:", gotState, "stepCreated:", !!stepCreatedMsg, "caption:", !!captionMsg);
  if (captionMsg) log("caption text:", captionMsg.caption);

  // 4. Verify a DemoStep was persisted to the DB (recorder called /api/recorder/step)
  const steps = await prisma.demoStep.findMany({ where: { demoId: demo.id }, orderBy: { order: "asc" } });
  log("DemoStep rows in DB:", steps.length);
  if (steps.length) {
    log("  step[0] title:", steps[0].title, "| aiStatus:", steps[0].aiStatus, "| screenshot:", steps[0].screenshotUrl);
    log("  callout:", (steps[0].callout || "").slice(0, 100));
  }

  // 5. Test the undo route (token-authed)
  const beforeUndo = steps.length;
  const undoRes = await fetch(`${BASE}/api/recorder/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-recorder-token": token },
    body: JSON.stringify({ sessionId }),
  });
  log("undo:", undoRes.status, await undoRes.text());
  const afterUndo = await prisma.demoStep.count({ where: { demoId: demo.id } });
  log("steps after undo:", afterUndo, "(was", beforeUndo + ")");

  // 6. Close the session via the recorder server
  const closeRes = await fetch(`${REC}/close-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId }),
  });
  log("close-session:", closeRes.status, await closeRes.text());

  // 7. Verify the protected sessions API returns 401 without a login cookie
  const noAuth = await fetch(`${BASE}/api/recorder/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demoId: demo.id, url: "https://example.com" }),
  });
  log("sessions POST w/o auth:", noAuth.status, "(expect 401)");

  // 8. Assertions
  const pass =
    gotState &&
    frameCount > 0 &&
    stepCreatedMsg !== null &&
    steps.length >= 1 &&
    afterUndo === beforeUndo - 1 &&
    noAuth.status === 401;
  log("RESULT:", pass ? "PASS" : "FAIL");

  // 9. Cleanup
  await prisma.recorderSession.deleteMany({ where: { demoId: demo.id } });
  await prisma.user.delete({ where: { id: user.id } }); // cascades workspace, demo, steps
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error("[test] ERROR:", e.stack || e.message || e);
  try {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  } catch {}
  await prisma.$disconnect();
  process.exit(1);
});
