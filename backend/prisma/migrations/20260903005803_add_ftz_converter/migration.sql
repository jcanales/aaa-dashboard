-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "username" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

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

