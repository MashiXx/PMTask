-- AlterTable: Add slug to Project
ALTER TABLE "Project" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- AlterTable: Add slug to Task
ALTER TABLE "Task" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';
