-- AlterTable
ALTER TABLE `Note` ADD COLUMN `color` VARCHAR(191) NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE `NoteLabel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#6C63FF',
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NoteLabel_createdById_idx`(`createdById`),
    UNIQUE INDEX `NoteLabel_name_createdById_key`(`name`, `createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NoteLabelLink` (
    `noteId` INTEGER NOT NULL,
    `labelId` INTEGER NOT NULL,

    INDEX `NoteLabelLink_labelId_idx`(`labelId`),
    PRIMARY KEY (`noteId`, `labelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NoteMedia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `noteId` INTEGER NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `filepath` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'image',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NoteMedia_noteId_idx`(`noteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NoteLabel` ADD CONSTRAINT `NoteLabel_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteLabelLink` ADD CONSTRAINT `NoteLabelLink_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteLabelLink` ADD CONSTRAINT `NoteLabelLink_labelId_fkey` FOREIGN KEY (`labelId`) REFERENCES `NoteLabel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteMedia` ADD CONSTRAINT `NoteMedia_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
