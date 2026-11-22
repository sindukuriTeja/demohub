-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DemoStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "snapshot" TEXT,
    "hotspots" TEXT NOT NULL,
    "videoUrl" TEXT,
    "duration" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'click',
    "pageUrl" TEXT,
    "pageTitle" TEXT,
    "clickX" REAL,
    "clickY" REAL,
    "elementJson" TEXT,
    "callout" TEXT,
    "hotspot" TEXT,
    "blurs" TEXT,
    "annotations" TEXT,
    "crop" TEXT,
    "background" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "screenshotUrl" TEXT,
    "voiceScript" TEXT,
    "voiceAudioUrl" TEXT,
    "voiceStatus" TEXT NOT NULL DEFAULT 'none',
    "avatarImageUrl" TEXT,
    "avatarVideoUrl" TEXT,
    "avatarStatus" TEXT NOT NULL DEFAULT 'none',
    "avatarTalkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoStep_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DemoStep" ("aiStatus", "annotations", "background", "blurs", "callout", "clickX", "clickY", "createdAt", "crop", "demoId", "description", "duration", "elementJson", "hotspot", "hotspots", "id", "order", "pageTitle", "pageUrl", "screenshotUrl", "snapshot", "title", "type", "videoUrl", "voiceAudioUrl", "voiceScript", "voiceStatus") SELECT "aiStatus", "annotations", "background", "blurs", "callout", "clickX", "clickY", "createdAt", "crop", "demoId", "description", "duration", "elementJson", "hotspot", "hotspots", "id", "order", "pageTitle", "pageUrl", "screenshotUrl", "snapshot", "title", "type", "videoUrl", "voiceAudioUrl", "voiceScript", "voiceStatus" FROM "DemoStep";
DROP TABLE "DemoStep";
ALTER TABLE "new_DemoStep" RENAME TO "DemoStep";
CREATE INDEX "DemoStep_demoId_order_idx" ON "DemoStep"("demoId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
