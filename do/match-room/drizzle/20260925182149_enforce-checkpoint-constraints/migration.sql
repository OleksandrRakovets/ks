PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_checkpoints` (
	`seq` integer PRIMARY KEY,
	`previous_checkpoint_seq` integer,
	`aggregate_json` text NOT NULL,
	`state_json` text NOT NULL,
	`projection_json` text NOT NULL,
	`last_player_accepted_seq` integer,
	`last_player_entry_index` integer,
	CONSTRAINT "checkpoints_reference_fields" CHECK(("last_player_accepted_seq" IS NULL AND "last_player_entry_index" IS NULL) OR ("last_player_accepted_seq" IS NOT NULL AND "last_player_accepted_seq" > 0 AND "last_player_entry_index" IS NOT NULL AND "last_player_entry_index" >= 0)),
	CONSTRAINT "checkpoints_predecessor" CHECK(("seq" = 0 AND "previous_checkpoint_seq" IS NULL) OR ("seq" > 0 AND "previous_checkpoint_seq" IS NOT NULL AND "previous_checkpoint_seq" >= 0 AND "previous_checkpoint_seq" < "seq"))
);
--> statement-breakpoint
INSERT INTO `__new_checkpoints`(`seq`, `previous_checkpoint_seq`, `aggregate_json`, `state_json`, `projection_json`, `last_player_accepted_seq`, `last_player_entry_index`) SELECT `seq`, `previous_checkpoint_seq`, `aggregate_json`, `state_json`, `projection_json`, `last_player_accepted_seq`, `last_player_entry_index` FROM `checkpoints`;--> statement-breakpoint
DROP TABLE `checkpoints`;--> statement-breakpoint
ALTER TABLE `__new_checkpoints` RENAME TO `checkpoints`;--> statement-breakpoint
PRAGMA foreign_keys=ON;