-- AlterTable: Add slug to Project
ALTER TABLE "Project" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- AlterTable: Add slug to Task
ALTER TABLE "Task" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- CreateIndex: unique slug on Project
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex: unique slug+projectId on Task
CREATE UNIQUE INDEX "Task_slug_projectId_key" ON "Task"("slug", "projectId");
