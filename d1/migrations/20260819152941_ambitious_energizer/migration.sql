DROP INDEX IF EXISTS `facts_match_id_seq`;--> statement-breakpoint
DROP TABLE `facts`;--> statement-breakpoint
DROP TABLE `match_snapshots`;--> statement-breakpoint
ALTER TABLE `matches` DROP COLUMN `control_secret`;--> statement-breakpoint
ALTER TABLE `matches` DROP COLUMN `config_json`;--> statement-breakpoint
ALTER TABLE `matches` DROP COLUMN `latest_seq`;--> statement-breakpoint
ALTER TABLE `matches` DROP COLUMN `lock_at`;