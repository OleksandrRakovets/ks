CREATE TABLE `checkpoints` (
	`seq` integer PRIMARY KEY,
	`previous_checkpoint_seq` integer,
	`aggregate_json` text NOT NULL,
	`state_json` text NOT NULL,
	`game_presentation_json` text,
	`last_player_accepted_seq` integer,
	`last_player_entry_index` integer,
	CONSTRAINT "checkpoints_reference_fields" CHECK(("last_player_accepted_seq" IS NULL AND "last_player_entry_index" IS NULL) OR ("last_player_accepted_seq" IS NOT NULL AND "last_player_accepted_seq" > 0 AND "last_player_entry_index" IS NOT NULL AND "last_player_entry_index" >= 0)),
	CONSTRAINT "checkpoints_predecessor" CHECK(("seq" = 0 AND "previous_checkpoint_seq" IS NULL) OR ("seq" > 0 AND "previous_checkpoint_seq" IS NOT NULL AND "previous_checkpoint_seq" >= 0 AND "previous_checkpoint_seq" < "seq"))
);
--> statement-breakpoint
CREATE TABLE `protocol_entries` (
	`accepted_seq` integer NOT NULL,
	`entry_index` integer NOT NULL,
	`entry_json` text NOT NULL,
	CONSTRAINT `protocol_entries_pk` PRIMARY KEY(`accepted_seq`, `entry_index`),
	CONSTRAINT "protocol_entries_position" CHECK("accepted_seq" > 0 AND "entry_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE `active_matches` ADD `current_checkpoint_seq` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `active_matches` ADD `score_json` text NOT NULL;