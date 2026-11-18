-- CreateTable
CREATE TABLE "RecorderSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "url" TEXT NOT NULL,
    "viewport" TEXT NOT NULL DEFAULT '1280x720',
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Demo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'interactive',
    "shareToken" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "requireEmail" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "stepDurationSec" INTEGER NOT NULL DEFAULT 3,
    "theme" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Demo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Demo" ("createdAt", "description", "id", "isPublished", "password", "requireEmail", "shareToken", "title", "type", "updatedAt", "workspaceId") SELECT "createdAt", "description", "id", "isPublished", "password", "requireEmail", "shareToken", "title", "type", "updatedAt", "workspaceId" FROM "Demo";
DROP TABLE "Demo";
ALTER TABLE "new_Demo" RENAME TO "Demo";
CREATE UNIQUE INDEX "Demo_shareToken_key" ON "Demo"("shareToken");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoStep_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DemoStep" ("createdAt", "demoId", "description", "duration", "hotspots", "id", "order", "snapshot", "title", "videoUrl") SELECT "createdAt", "demoId", "description", "duration", "hotspots", "id", "order", "snapshot", "title", "videoUrl" FROM "DemoStep";
DROP TABLE "DemoStep";
ALTER TABLE "new_DemoStep" RENAME TO "DemoStep";
CREATE INDEX "DemoStep_demoId_order_idx" ON "DemoStep"("demoId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RecorderSession_demoId_key" ON "RecorderSession"("demoId");

-- CreateIndex
CREATE UNIQUE INDEX "RecorderSession_token_key" ON "RecorderSession"("token");
