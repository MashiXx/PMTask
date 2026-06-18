-- CreateTable
CREATE TABLE `Mindmap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `projectId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MindmapNode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mindmapId` INTEGER NOT NULL,
    `parentId` INTEGER NULL,
    `label` TEXT NOT NULL,
    `color` VARCHAR(191) NULL,
    `x` DOUBLE NULL,
    `y` DOUBLE NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `collapsed` BOOLEAN NOT NULL DEFAULT false,
    `taskId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MindmapNode_mindmapId_idx`(`mindmapId`),
    INDEX `MindmapNode_parentId_idx`(`parentId`),
    INDEX `MindmapNode_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Mindmap` ADD CONSTRAINT `Mindmap_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MindmapNode` ADD CONSTRAINT `MindmapNode_mindmapId_fkey` FOREIGN KEY (`mindmapId`) REFERENCES `Mindmap`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MindmapNode` ADD CONSTRAINT `MindmapNode_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `MindmapNode`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `MindmapNode` ADD CONSTRAINT `MindmapNode_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
