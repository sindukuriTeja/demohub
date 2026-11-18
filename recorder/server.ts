// Standalone WebSocket + Playwright recorder server
// Runs on PORT+1 (default 3001) alongside Next.js.
import { WebSocketServer, WebSocket } from "ws";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const WS_PORT = parseInt(process.env.RECORDER_PORT || "3001");
const MAX_SESSIONS = parseInt(process.env.MAX_RECORDER_SESSIONS || "3");
const IDLE_MINUTES = parseInt(process.env.SESSION_IDLE_MINUTES || "20");
const DPR = parseFloat(process.env.RECORDER_DPR || "1");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const NEXT_PORT = process.env.PORT || "3000";

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface Session {
  id: string;
  demoId: string;
  userId: string;
  token: string;
  status: "starting" | "recording" | "paused" | "stopping" | "closed";
  browser: Browser;
  context: BrowserContext;
  page: Page;
  ws: WebSocket | null;
  stepCount: number;
  viewport: { width: number; height: number };
  idleTimer: any;
  clickQueue: Promise<void>;
  sensitiveSelectors: string[];
  autoHideSensitive: boolean;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

function parseViewport(vp: string): { width: number; height: number } {
  const [w, h] = vp.split("x").map(Number);
  return { width: w || 1280, height: h || 720 };
}

function sendJson(ws: WebSocket | null, obj: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function resetIdle(session: Session) {
  session.lastActivity = Date.now();
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => closeSession(session.id, "idle"), IDLE_MINUTES * 60 * 1000);
}

async function closeSession(id: string, reason: string = "closed") {
  const s = sessions.get(id);
  if (!s || s.status === "closed") return;
  s.status = "closed";
  if (s.idleTimer) clearTimeout(s.idleTimer);
  try {
    await s.browser.close();
  } catch {}
  if (s.ws) sendJson(s.ws, { type: "state", status: "closed", reason });
  sessions.delete(id);
  console.log(`Session ${id} closed: ${reason}`);
}

async function getSensitiveSelectors(): Promise<string[]> {
  return [
    "input[type=password]",
    "input[name*=email i]", "input[name*=phone i]", "input[name*=mobile i]",
    "input[name*=card i]", "input[name*=cvv i]", "input[name*=ssn i]",
    "input[name*=account i]", "input[name*=otp i]",
    "input[placeholder*=email i]", "input[placeholder*=password i]",
    "input[placeholder*=phone i]", "input[placeholder*=card i]",
  ];
}

async function applyBlurs(page: Page, selectors: string[], extraSelectors: string[]) {
  const all = [...selectors, ...extraSelectors].filter(Boolean);
  if (!all.length) return;
  await page.evaluate((sels) => {
    sels.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el: any) => {
          el.style.filter = "blur(8px)";
          el.setAttribute("data-dh-blurred", "1");
        });
      } catch {}
    });
  }, all);
}

async function removeBlurs(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-dh-blurred]").forEach((el: any) => {
      el.style.filter = "";
      el.removeAttribute("data-dh-blurred");
    });
  });
}

async function getElementInfo(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement;
    if (!el) return null;
    // Climb to meaningful ancestor
    const meaningful = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"];
    const roles = ["button", "link", "tab", "menuitem", "option", "checkbox", "radio"];
    let target: HTMLElement = el;
    let cur: HTMLElement | null = el;
    while (cur && cur !== document.body) {
      if (meaningful.includes(cur.tagName) || roles.includes(cur.getAttribute("role") || "")) {
        target = cur;
        break;
      }
      cur = cur.parentElement;
    }
    const rect = target.getBoundingClientRect();
    const text = (target.textContent || "").trim().slice(0, 80);
    return {
      tag: target.tagName.toLowerCase(),
      text,
      ariaLabel: target.getAttribute("aria-label") || "",
      placeholder: (target as HTMLInputElement).placeholder || "",
      role: target.getAttribute("role") || "",
      id: target.id || "",
      href: (target as HTMLAnchorElement).href || "",
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      pageTitle: document.title,
      pageUrl: location.href,
    };
  }, { x, y });
}

async function startScreencast(session: Session) {
  const client = await session.context.newCDPSession(session.page);
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
    maxWidth: session.viewport.width,
    maxHeight: session.viewport.height,
  });
  client.on("Page.screencastFrame", async ({ data, sessionId }: any) => {
    try {
      await client.send("Page.screencastFrameAck", { sessionId });
      if (session.ws?.readyState === WebSocket.OPEN) {
        const buf = Buffer.from(data, "base64");
        session.ws.send(buf);
      }
    } catch {}
  });
  return client;
}

async function saveScreenshot(session: Session, stepId: string): Promise<string> {
  const dir = path.join(UPLOADS_DIR, session.demoId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${stepId}.png`;
  const filepath = path.join(dir, filename);
  await session.page.screenshot({ path: filepath, type: "png" });
  return `/uploads/${session.demoId}/${filename}`;
}

async function processClick(session: Session, x: number, y: number, ws: WebSocket) {
  if (session.status !== "recording") return;

  try {
    // 1. Move mouse
    await session.page.mouse.move(x, y);

    // 2. Get element info
    const elInfo = await getElementInfo(session.page, x, y);

    // 3. Apply sensitive blurs if enabled
    if (session.autoHideSensitive) {
      const sens = await getSensitiveSelectors();
      await applyBlurs(session.page, sens, session.sensitiveSelectors);
    }

    // 4. Take screenshot BEFORE click
    const stepId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const screenshotUrl = await saveScreenshot(session, stepId);

    // 5. Remove blurs
    if (session.autoHideSensitive) await removeBlurs(session.page);

    // 6. Deliver the click
    await session.page.mouse.down();
    await session.page.mouse.up();

    // 7. Build hotspot from element rect
    const hotspot = elInfo?.rect
      ? {
          x: Math.max(0, elInfo.rect.x - 4),
          y: Math.max(0, elInfo.rect.y - 4),
          w: elInfo.rect.w + 8,
          h: elInfo.rect.h + 8,
          shape: "rect",
        }
      : { x: x - 20, y: y - 20, w: 40, h: 40, shape: "circle" };

    session.stepCount++;
    const position = session.stepCount;

    // 8. Build step payload
    const stepData = {
      order: position - 1,
      type: "click",
      title: elInfo?.text ? `Click '${elInfo.text.slice(0, 40)}'` : `Step ${position}`,
      description: "",
      screenshotUrl,
      snapshot: `<img src="${screenshotUrl}" style="width:100%;display:block"/>`,
      hotspots: JSON.stringify(hotspot),
      hotspot: JSON.stringify(hotspot),
      elementJson: JSON.stringify(elInfo),
      clickX: x,
      clickY: y,
      pageUrl: elInfo?.pageUrl || "",
      pageTitle: elInfo?.pageTitle || "",
      aiStatus: "pending",
      callout: JSON.stringify({
        text: "Writing caption...",
        x: (elInfo?.rect?.x || x) + (elInfo?.rect?.w || 0) + 20,
        y: elInfo?.rect?.y || y,
        width: 260,
        placement: "right",
        fontFamily: "Inter",
        fontSize: 15,
        bold: false,
        italic: false,
        textColor: "#FFFFFF",
        bgColor: "#5B3DF5",
        showArrow: true,
        emoji: "",
      }),
    };

    // Send step_created immediately (include click coords for ring/bubble)
    sendJson(ws, {
      type: "step_created",
      id: stepId,
      position,
      stepCount: session.stepCount,
      thumbUrl: screenshotUrl,
      title: stepData.title,
      callout: "Writing caption...",
      clickX: x,
      clickY: y,
    });

    // Save to DB via internal API
    let savedId = stepId;
    try {
      const res = await fetch(`http://localhost:${NEXT_PORT}/api/recorder/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-recorder-token": session.token },
        body: JSON.stringify({ sessionId: session.id, stepId, ...stepData }),
      });
      const saved = await res.json();
      if (saved?.id) savedId = saved.id;

      // Trigger AI caption
      triggerAICaption(session, savedId, elInfo, screenshotUrl, ws);
    } catch (e) {
      console.error("Failed to save step:", e);
    }

    // Wait for page settle
    try {
      await session.page.waitForLoadState("networkidle", { timeout: 1500 });
    } catch {}

    // Send updated URL/title
    const url = session.page.url();
    const title = await session.page.title().catch(() => "");
    sendJson(ws, { type: "state", url, title, stepCount: session.stepCount });
  } catch (err: any) {
    console.error("processClick error:", err.message);
  }
}

async function triggerAICaption(
  session: Session,
  stepId: string,
  elInfo: any,
  screenshotUrl: string,
  ws: WebSocket
) {
  try {
    const res = await fetch(`http://localhost:${NEXT_PORT}/api/recorder/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-recorder-token": session.token },
      body: JSON.stringify({ stepId, elInfo, screenshotUrl, sessionId: session.id }),
    });
    const data = await res.json();
    if (data.caption) {
      sendJson(ws, { type: "step_caption", id: stepId, caption: data.caption, title: data.title });
    }
  } catch (e) {
    // Fallback caption already set
  }
}

// ─── HTTP + WebSocket server ──────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/create-session") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const params = JSON.parse(body);
        await createSession(params);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === "POST" && req.url === "/close-session") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { id } = JSON.parse(body || "{}");
        if (id) await closeSession(id, "api_closed");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url || "/", `http://localhost`);
  const sessionId = url.pathname.split("/").pop() || "";
  const token = url.searchParams.get("token");

  const session = sessions.get(sessionId);
  if (!session || session.token !== token) {
    ws.close(4001, "Unauthorized");
    return;
  }

  session.ws = ws;
  resetIdle(session);

  // Send initial state
  const pageUrl = session.page.url();
  const pageTitle = await session.page.title().catch(() => "");
  sendJson(ws, {
    type: "state",
    url: pageUrl,
    title: pageTitle,
    status: session.status,
    stepCount: session.stepCount,
  });

  // Start screencast
  await startScreencast(session).catch(() => null);

  ws.on("message", async (raw) => {
    resetIdle(session);
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "mousemove":
        await session.page.mouse.move(msg.x, msg.y).catch(() => {});
        const cursor = await session.page
          .evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y) as HTMLElement;
            return el ? getComputedStyle(el).cursor : "default";
          }, { x: msg.x, y: msg.y })
          .catch(() => "default");
        sendJson(ws, { type: "cursor", cursor });
        break;

      case "mousedown":
        // Queue click processing
        session.clickQueue = session.clickQueue.then(() => processClick(session, msg.x, msg.y, ws));
        break;

      case "wheel":
        await session.page.mouse.wheel(msg.deltaX || 0, msg.deltaY || 0).catch(() => {});
        break;

      case "keydown":
        await session.page.keyboard.down(msg.key).catch(() => {});
        break;

      case "keyup":
        await session.page.keyboard.up(msg.key).catch(() => {});
        break;

      case "text":
        await session.page.keyboard.insertText(msg.text).catch(() => {});
        break;

      case "nav":
        if (msg.action === "goto" && msg.url) {
          await session.page.goto(msg.url, { waitUntil: "domcontentloaded" }).catch(() => {});
        } else if (msg.action === "back") {
          await session.page.goBack().catch(() => {});
        } else if (msg.action === "forward") {
          await session.page.goForward().catch(() => {});
        } else if (msg.action === "reload") {
          await session.page.reload().catch(() => {});
        }
        const newUrl = session.page.url();
        const newTitle = await session.page.title().catch(() => "");
        sendJson(ws, { type: "state", url: newUrl, title: newTitle });
        break;

      case "control":
        if (msg.action === "pause") {
          session.status = "paused";
          sendJson(ws, { type: "state", status: "paused" });
        } else if (msg.action === "resume") {
          session.status = "recording";
          sendJson(ws, { type: "state", status: "recording" });
        } else if (msg.action === "capture_screen") {
          // Manual screenshot
          const stepId = `manual-${Date.now()}`;
          session.stepCount++;
          const screenUrl = `/uploads/${session.demoId}/${stepId}.png`;
          const dir = path.join(UPLOADS_DIR, session.demoId);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          await session.page.screenshot({ path: path.join(dir, `${stepId}.png`), type: "png" });
          sendJson(ws, {
            type: "step_created",
            id: stepId,
            position: session.stepCount,
            stepCount: session.stepCount,
            thumbUrl: screenUrl,
            title: "Screenshot",
            callout: "",
          });
          await fetch(`http://localhost:${NEXT_PORT}/api/recorder/step`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-recorder-token": session.token },
            body: JSON.stringify({
              sessionId: session.id,
              stepId,
              order: session.stepCount - 1,
              type: "manual",
              title: "Screenshot",
              screenshotUrl: screenUrl,
              snapshot: `<img src="${screenUrl}" style="width:100%;display:block"/>`,
              hotspots: "[]",
              aiStatus: "pending",
            }),
          }).catch(() => {});
        } else if (msg.action === "undo_last") {
          if (session.stepCount > 0) {
            session.stepCount--;
            sendJson(ws, { type: "state", stepCount: session.stepCount });
            sendJson(ws, { type: "undo_ok" });
            await fetch(`http://localhost:${NEXT_PORT}/api/recorder/undo`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-recorder-token": session.token },
              body: JSON.stringify({ sessionId: session.id }),
            }).catch(() => {});
          }
        } else if (msg.action === "stop") {
          session.status = "stopping";
          sendJson(ws, { type: "state", status: "stopping" });
          const demoId = session.demoId;
          await closeSession(session.id, "stopped");
          sendJson(ws, { type: "stopped", demoId });
        } else if (msg.action === "cancel") {
          await fetch(`http://localhost:${NEXT_PORT}/api/recorder/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-recorder-token": session.token },
            body: JSON.stringify({ sessionId: session.id }),
          }).catch(() => {});
          await closeSession(session.id, "cancelled");
          sendJson(ws, { type: "stopped", demoId: session.demoId, cancelled: true });
        }
        break;
    }
  });

  ws.on("close", () => {
    // Keep session alive for 2 min for reconnect
    setTimeout(() => {
      const s = sessions.get(session.id);
      if (s && s.ws === ws && s.status !== "closed") {
        closeSession(session.id, "ws_timeout");
      }
    }, 120_000);
  });
});

httpServer.listen(WS_PORT, () => {
  console.log(`Recorder HTTP+WS server listening on http://localhost:${WS_PORT}`);
});

// Export createSession for the API route to call
export async function createSession(params: {
  id: string;
  demoId: string;
  userId: string;
  url: string;
  viewport: string;
  token: string;
}): Promise<void> {
  if (sessions.size >= MAX_SESSIONS) throw new Error("Max sessions reached");

  const vp = parseViewport(params.viewport);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: DPR,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    acceptDownloads: false,
    locale: "en-US",
  });
  const page = await context.newPage();

  // Handle dialogs
  page.on("dialog", async (dialog) => {
    const s = sessions.get(params.id);
    if (s?.ws) sendJson(s.ws, { type: "dialog", kind: dialog.type(), message: dialog.message() });
    await dialog.accept().catch(() => {});
  });

  await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const session: Session = {
    ...params,
    status: "recording",
    browser,
    context,
    page,
    ws: null,
    stepCount: 0,
    viewport: vp,
    idleTimer: null,
    clickQueue: Promise.resolve(),
    sensitiveSelectors: [],
    autoHideSensitive: true,
    lastActivity: Date.now(),
  };

  sessions.set(params.id, session);
  resetIdle(session);
}

export function getSession(id: string) {
  return sessions.get(id);
}
export function getAllSessions() {
  return sessions;
}

export default wss;
