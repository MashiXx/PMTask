-- AlterTable
-- Reconcile pre-existing drift: schema had User.language with no migration.
-- (The `sessions` table is owned by express-mysql-session; never drop it here.)
ALTER TABLE `User` ADD COLUMN `language` VARCHAR(191) NOT NULL DEFAULT 'en';
