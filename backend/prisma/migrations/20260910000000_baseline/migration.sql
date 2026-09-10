-- Consolidated baseline replacing the old, incomplete migration history.
-- Production's actual schema was ahead of what's in this repo: 13 migration
-- folders that created the base schema (User, Client, TariffSource, etc.)
-- were applied on prod at some point (still recorded in its _prisma_migrations
-- table) but the folders themselves were never committed/were later removed,
-- leaving only one migration on disk (add_ftz_converter) that assumed that
-- base schema already existed. That's fine for prod (its migration history
-- already covers it) but makes it impossible to `migrate deploy` onto any
-- fresh database (e.g. a new dev environment) from scratch.
--
-- This migration is `prisma migrate diff --from-empty --to-schema-datamodel`
-- against the current schema.prisma — verified to produce zero additional
-- diff against prod's live database (`migrate diff --from-url <prod> --to-schema-datamodel`
-- returned "This is an empty migration"), i.e. it's a faithful, complete
-- representation of what's actually running, not a guess. It replaces
-- add_ftz_converter entirely (this includes everything that one did, plus
-- everything it assumed already existed) and is marked --applied on prod
-- rather than actually run there, exactly the same way add_ftz_converter was.
-- On a fresh database it runs for real, top to bottom, and produces the
-- complete schema in one migration.

-- CreateTable
CREATE TABLE "TariffSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastPolled" TIMESTAMP(3),
    "lastHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffChange" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentNumber" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "impactScore" INTEGER NOT NULL,
    "impactRationale" TEXT NOT NULL,
    "htsCodes" TEXT[],
    "dutyBefore" JSONB,
    "dutyAfter" JSONB,
    "effectiveDate" TIMESTAMP(3),
    "publicationDate" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawPayloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "alertsSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "slackChannel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientHtsPortfolio" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "htsCode" TEXT NOT NULL,
    "description" TEXT,
    "annualValue" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientHtsPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientHtsMatch" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "matchedHtsCodes" TEXT[],
    "estimatedDutyImpact" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientHtsMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "clientCoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAuditLog" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "changeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLayout" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "fingerprint" JSONB NOT NULL,
    "fieldMap" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "applicationInfo" JSONB NOT NULL DEFAULT '{}',
    "header" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FtzClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "irsNumber" TEXT,
    "companyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FtzClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "pdfFilename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "extractionError" TEXT,
    "extractionDurationMs" INTEGER,
    "applicationData" JSONB NOT NULL,
    "headerData" JSONB NOT NULL,
    "detailData" JSONB NOT NULL,
    "xml" TEXT,
    "parseSource" TEXT,
    "parseWarnings" JSONB,
    "pdfData" BYTEA,
    "lineAnchors" JSONB,
    "createdById" TEXT NOT NULL,
    "layoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FtzAllocation" (
    "number" INTEGER NOT NULL,
    "conversionId" TEXT,
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FtzAllocation_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "applicationData" JSONB NOT NULL,
    "headerData" JSONB NOT NULL,
    "billOfLadingData" JSONB NOT NULL,
    "detailData" JSONB NOT NULL,
    "xml" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationMember" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query" TEXT,
    "statusCode" INTEGER NOT NULL,
    "rowCount" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "readCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TariffSource_name_key" ON "TariffSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHtsPortfolio_clientId_htsCode_key" ON "ClientHtsPortfolio"("clientId", "htsCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "InvoiceLayout_status_idx" ON "InvoiceLayout"("status");

-- CreateIndex
CREATE INDEX "FtzClient_irsNumber_idx" ON "FtzClient"("irsNumber");

-- CreateIndex
CREATE INDEX "Conversion_createdById_idx" ON "Conversion"("createdById");

-- CreateIndex
CREATE INDEX "Conversion_layoutId_idx" ON "Conversion"("layoutId");

-- CreateIndex
CREATE UNIQUE INDEX "FtzAllocation_conversionId_key" ON "FtzAllocation"("conversionId");

-- CreateIndex
CREATE UNIQUE INDEX "FtzAllocation_operationId_key" ON "FtzAllocation"("operationId");

-- CreateIndex
CREATE INDEX "Operation_createdById_idx" ON "Operation"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "OperationMember_conversionId_key" ON "OperationMember"("conversionId");

-- CreateIndex
CREATE INDEX "OperationMember_operationId_idx" ON "OperationMember"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationMember_operationId_conversionId_key" ON "OperationMember"("operationId", "conversionId");

-- CreateIndex
CREATE INDEX "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlert_createdAt_idx" ON "SecurityAlert"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlert_acknowledgedAt_idx" ON "SecurityAlert"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "TariffChange" ADD CONSTRAINT "TariffChange_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TariffSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHtsPortfolio" ADD CONSTRAINT "ClientHtsPortfolio_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHtsMatch" ADD CONSTRAINT "ClientHtsMatch_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "TariffChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "TariffChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLayout" ADD CONSTRAINT "InvoiceLayout_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "InvoiceLayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FtzAllocation" ADD CONSTRAINT "FtzAllocation_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FtzAllocation" ADD CONSTRAINT "FtzAllocation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationMember" ADD CONSTRAINT "OperationMember_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationMember" ADD CONSTRAINT "OperationMember_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

