CREATE TABLE `active_matches` (
	`match_id` text PRIMARY KEY,
	`control_secret` text NOT NULL,
	`config_json` text NOT NULL,
	`latest_seq` integer NOT NULL,
	`score_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	CONSTRAINT "active_matches_finalizing_fields" CHECK(("status" = 'active' AND "ended_at" IS NULL) OR ("status" = 'finalizing' AND "ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`seq` integer PRIMARY KEY,
	`previous_checkpoint_seq` integer,
	`aggregate_json` text NOT NULL,
	`last_player_accepted_seq` integer,
	`last_player_entry_index` integer,
	CONSTRAINT "checkpoints_reference_fields" CHECK(("last_player_accepted_seq" IS NULL AND "last_player_entry_index" IS NULL) OR ("last_player_accepted_seq" IS NOT NULL AND "last_player_accepted_seq" > 0 AND "last_player_entry_index" IS NOT NULL AND "last_player_entry_index" >= 0)),
	CONSTRAINT "checkpoints_predecessor" CHECK(("seq" = 0 AND "previous_checkpoint_seq" IS NULL) OR ("seq" > 0 AND "previous_checkpoint_seq" IS NOT NULL AND "previous_checkpoint_seq" >= 0 AND "previous_checkpoint_seq" < "seq"))
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`command_id` text PRIMARY KEY,
	`match_id` text NOT NULL,
	`request_json` text NOT NULL,
	`outcome` text NOT NULL,
	`accepted_seq` integer CONSTRAINT `commands_accepted_seq_unique` UNIQUE,
	`accepted_at` integer,
	`rejection_json` text,
	CONSTRAINT `fk_commands_match_id_active_matches_match_id_fk` FOREIGN KEY (`match_id`) REFERENCES `active_matches`(`match_id`),
	CONSTRAINT "commands_outcome_fields" CHECK(("outcome" = 'accepted' AND "accepted_seq" > 0 AND "accepted_at" IS NOT NULL AND "rejection_json" IS NULL) OR ("outcome" = 'rejected' AND "accepted_seq" IS NULL AND "accepted_at" IS NULL AND "rejection_json" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `protocol_entries` (
	`accepted_seq` integer NOT NULL,
	`entry_index` integer NOT NULL,
	`entry_json` text NOT NULL,
	CONSTRAINT `protocol_entries_pk` PRIMARY KEY(`accepted_seq`, `entry_index`),
	CONSTRAINT "protocol_entries_position" CHECK("accepted_seq" > 0 AND "entry_index" >= 0)
);
