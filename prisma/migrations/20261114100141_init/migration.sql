-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'HR_AGENT', 'ER_SPECIALIST', 'HR_ADMIN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QueueType" AS ENUM ('GENERAL', 'HR', 'ER');

-- CreateEnum
CREATE TYPE "Sensitivity" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ER_RESTRICTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_EMPLOYEE', 'WAITING_HR', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('EMPLOYEE', 'HR_AGENT', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('REQUESTER_AND_HR', 'HR_ONLY', 'ER_ONLY');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AudienceDimension" AS ENUM ('ALL', 'DEPARTMENT', 'COUNTRY', 'EMPLOYMENT_TYPE', 'GRADE');

-- CreateEnum
CREATE TYPE "SlaState" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED');

-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('STARTED', 'PAUSED', 'RESUMED', 'AT_RISK', 'BREACHED', 'MET', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('LEVEL_1', 'LEVEL_2');

-- CreateEnum
CREATE TYPE "ResolutionType" AS ENUM ('ANSWERED', 'RESOLVED_WITH_ACTION', 'REFERRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('CLASSIFY', 'ANSWER', 'CLARIFY');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'FALLBACK', 'FAILED');

-- CreateEnum
CREATE TYPE "CitationValidation" AS ENUM ('VALID', 'INVALID');

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID NOT NULL,
    "queueId" UUID,
    "managerId" UUID,
    "locationCountry" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "hireDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "QueueType" NOT NULL,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultQueueId" UUID,
    "isSensitiveDefault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "ownerDepartmentId" UUID,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" UUID NOT NULL,
    "policyDocumentId" UUID NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "contentMd" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAudienceRule" (
    "id" UUID NOT NULL,
    "policyVersionId" UUID NOT NULL,
    "dimension" "AudienceDimension" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PolicyAudienceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyChunk" (
    "id" UUID NOT NULL,
    "policyVersionId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,

    CONSTRAINT "PolicyChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "requesterId" UUID NOT NULL,
    "assigneeId" UUID,
    "queueId" UUID NOT NULL,
    "categoryId" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'P3',
    "sensitivity" "Sensitivity" NOT NULL DEFAULT 'INTERNAL',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "aiIntent" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "sourceChannel" TEXT NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "senderType" "MessageSenderType" NOT NULL,
    "senderEmployeeId" UUID,
    "body" TEXT NOT NULL,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'REQUESTER_AND_HR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiRunId" UUID,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCitation" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "policyVersionId" UUID NOT NULL,
    "policyChunkId" UUID NOT NULL,
    "quote" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "validated" "CitationValidation" NOT NULL DEFAULT 'VALID',
    "validationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,
    "assignedById" UUID,
    "queueId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaRule" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "pauseOnWaitingEmployee" BOOLEAN NOT NULL DEFAULT true,
    "escalationPct" INTEGER NOT NULL DEFAULT 75,
    "isDemoAssumption" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "SlaRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaCalendar" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "workdays" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isDemoAssumption" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SlaCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessHoliday" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BusinessHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSla" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "state" "SlaState" NOT NULL DEFAULT 'ON_TRACK',
    "pausedAt" TIMESTAMP(3),
    "accumulatedPauseSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketSla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaEvent" (
    "id" UUID NOT NULL,
    "ticketSlaId" UUID NOT NULL,
    "type" "SlaEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "SlaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "level" "EscalationLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "escalatedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "resolvedById" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "rootCause" TEXT,
    "resolutionType" "ResolutionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "ticketId" UUID,
    "kind" "AiRunKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outputJson" JSONB,
    "status" "AiRunStatus" NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "requestId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_queueId_idx" ON "Employee"("queueId");

-- CreateIndex
CREATE INDEX "Employee_role_idx" ON "Employee"("role");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_slug_key" ON "Queue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_defaultQueueId_idx" ON "Category"("defaultQueueId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_code_key" ON "PolicyDocument"("code");

-- CreateIndex
CREATE INDEX "PolicyDocument_categoryId_idx" ON "PolicyDocument"("categoryId");

-- CreateIndex
CREATE INDEX "PolicyDocument_ownerDepartmentId_idx" ON "PolicyDocument"("ownerDepartmentId");

-- CreateIndex
CREATE INDEX "PolicyVersion_policyDocumentId_effectiveFrom_idx" ON "PolicyVersion"("policyDocumentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PolicyVersion_status_effectiveFrom_effectiveTo_idx" ON "PolicyVersion"("status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policyDocumentId_versionLabel_key" ON "PolicyVersion"("policyDocumentId", "versionLabel");

-- CreateIndex
CREATE INDEX "PolicyAudienceRule_dimension_value_idx" ON "PolicyAudienceRule"("dimension", "value");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAudienceRule_policyVersionId_dimension_value_key" ON "PolicyAudienceRule"("policyVersionId", "dimension", "value");

-- CreateIndex
CREATE INDEX "PolicyChunk_policyVersionId_idx" ON "PolicyChunk"("policyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyChunk_policyVersionId_ordinal_key" ON "PolicyChunk"("policyVersionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNo_key" ON "Ticket"("ticketNo");

-- CreateIndex
CREATE INDEX "Ticket_queueId_status_idx" ON "Ticket"("queueId", "status");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_status_idx" ON "Ticket"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_createdAt_idx" ON "Ticket"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex
CREATE INDEX "Ticket_isSensitive_status_idx" ON "Ticket"("isSensitive", "status");

-- CreateIndex
CREATE INDEX "Message_ticketId_createdAt_idx" ON "Message"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderEmployeeId_idx" ON "Message"("senderEmployeeId");

-- CreateIndex
CREATE INDEX "MessageCitation_policyVersionId_idx" ON "MessageCitation"("policyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCitation_messageId_policyChunkId_key" ON "MessageCitation"("messageId", "policyChunkId");

-- CreateIndex
CREATE INDEX "Assignment_ticketId_assignedAt_idx" ON "Assignment"("ticketId", "assignedAt");

-- CreateIndex
CREATE INDEX "Assignment_assigneeId_unassignedAt_idx" ON "Assignment"("assigneeId", "unassignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlaRule_code_key" ON "SlaRule"("code");

-- CreateIndex
CREATE INDEX "SlaRule_priority_idx" ON "SlaRule"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "SlaCalendar_code_key" ON "SlaCalendar"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHoliday_calendarId_date_key" ON "BusinessHoliday"("calendarId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSla_ticketId_key" ON "TicketSla"("ticketId");

-- CreateIndex
CREATE INDEX "TicketSla_state_resolutionDueAt_idx" ON "TicketSla"("state", "resolutionDueAt");

-- CreateIndex
CREATE INDEX "TicketSla_firstResponseDueAt_idx" ON "TicketSla"("firstResponseDueAt");

-- CreateIndex
CREATE INDEX "SlaEvent_ticketSlaId_occurredAt_idx" ON "SlaEvent"("ticketSlaId", "occurredAt");

-- CreateIndex
CREATE INDEX "Escalation_ticketId_createdAt_idx" ON "Escalation"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Resolution_ticketId_key" ON "Resolution"("ticketId");

-- CreateIndex
CREATE INDEX "AiRun_ticketId_createdAt_idx" ON "AiRun"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_idx" ON "AiRun"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_defaultQueueId_fkey" FOREIGN KEY ("defaultQueueId") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAudienceRule" ADD CONSTRAINT "PolicyAudienceRule_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyChunk" ADD CONSTRAINT "PolicyChunk_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderEmployeeId_fkey" FOREIGN KEY ("senderEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_policyChunkId_fkey" FOREIGN KEY ("policyChunkId") REFERENCES "PolicyChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessHoliday" ADD CONSTRAINT "BusinessHoliday_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SlaCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSla" ADD CONSTRAINT "TicketSla_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSla" ADD CONSTRAINT "TicketSla_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SlaRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSla" ADD CONSTRAINT "TicketSla_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SlaCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaEvent" ADD CONSTRAINT "SlaEvent_ticketSlaId_fkey" FOREIGN KEY ("ticketSlaId") REFERENCES "TicketSla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- HR Nexus domain constraints and PostgreSQL full-text search
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A policy article cannot have two versions effective on the same day.
ALTER TABLE "PolicyVersion"
  ADD CONSTRAINT "PolicyVersion_effective_range"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "PolicyVersion"
  ADD CONSTRAINT "PolicyVersion_no_overlap"
  EXCLUDE USING gist (
    "policyDocumentId" WITH =,
    daterange("effectiveFrom"::date, "effectiveTo"::date, '[]') WITH &&
  );

-- Policy retrieval uses PostgreSQL full-text search over eligible chunks.
CREATE INDEX "PolicyChunk_fts_idx"
  ON "PolicyChunk"
  USING GIN (to_tsvector('english', coalesce("heading", '') || ' ' || coalesce("content", '')));

-- Preserve assignment history while allowing only one active assignment.
CREATE UNIQUE INDEX "Assignment_one_active_per_ticket"
  ON "Assignment" ("ticketId")
  WHERE "unassignedAt" IS NULL;

-- Audit events are append-only at the database level.
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
