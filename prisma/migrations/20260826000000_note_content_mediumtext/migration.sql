-- `Note.content` holds rich-text HTML. MySQL sizes TEXT in bytes (65,535), which
-- multi-byte content (emoji, accented text, pasted markup) exhausts well before
-- the app's own length guard fired -- inserts failed with Prisma P2000.
-- MEDIUMTEXT raises the ceiling to 16 MiB; the app caps content at 500 KiB.
ALTER TABLE `Note` MODIFY `content` MEDIUMTEXT NOT NULL;
