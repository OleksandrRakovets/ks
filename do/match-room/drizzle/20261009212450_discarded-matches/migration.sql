-- Durable Object migrations run inside a transaction; defer checks while rebuilding the referenced header.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_active_matches` (
	`match_id` text PRIMARY KEY,
	`control_secret` text NOT NULL,
	`config_json` text NOT NULL,
	`latest_seq` integer NOT NULL,
	`score_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	CONSTRAINT "active_matches_finalizing_fields" CHECK(("status" = 'active' AND "ended_at" IS NULL) OR ("status" IN ('finalizing', 'discarded') AND "ended_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_active_matches`(`match_id`, `control_secret`, `config_json`, `latest_seq`, `score_json`, `status`, `created_at`, `ended_at`) SELECT `match_id`, `control_secret`, `config_json`, `latest_seq`, `score_json`, `status`, `created_at`, `ended_at` FROM `active_matches`;--> statement-breakpoint
DROP TABLE `active_matches`;--> statement-breakpoint
ALTER TABLE `__new_active_matches` RENAME TO `active_matches`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
