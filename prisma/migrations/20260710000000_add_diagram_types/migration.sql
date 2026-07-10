-- AlterTable
ALTER TABLE `Mindmap` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'mindmap';

-- AlterTable
ALTER TABLE `MindmapNode`
    ADD COLUMN `shape` VARCHAR(191) NOT NULL DEFAULT 'rect',
    ADD COLUMN `width` DOUBLE NULL,
    ADD COLUMN `height` DOUBLE NULL;

-- CreateTable
CREATE TABLE `MindmapEdge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mindmapId` INTEGER NOT NULL,
    `sourceId` INTEGER NOT NULL,
    `targetId` INTEGER NOT NULL,
    `label` TEXT NULL,
    `style` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MindmapEdge_mindmapId_idx`(`mindmapId`),
    INDEX `MindmapEdge_sourceId_idx`(`sourceId`),
    INDEX `MindmapEdge_targetId_idx`(`targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MindmapEdge` ADD CONSTRAINT `MindmapEdge_mindmapId_fkey` FOREIGN KEY (`mindmapId`) REFERENCES `Mindmap`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MindmapEdge` ADD CONSTRAINT `MindmapEdge_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `MindmapNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MindmapEdge` ADD CONSTRAINT `MindmapEdge_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `MindmapNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
