CREATE TABLE `active_matches` (
	`match_id` text PRIMARY KEY,
	`control_secret` text NOT NULL,
	`config_json` text NOT NULL,
	`latest_seq` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`final_state_json` text,
	`ended_at` integer,
	CONSTRAINT "active_matches_terminal_fields" CHECK(("status" = 'active' AND "final_state_json" IS NULL AND "ended_at" IS NULL) OR ("status" = 'finalizing' AND "final_state_json" IS NOT NULL AND "ended_at" IS NOT NULL))
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
	CONSTRAINT `commands_id_seq_unique` UNIQUE(`command_id`,`accepted_seq`),
	CONSTRAINT "commands_outcome_fields" CHECK(("outcome" = 'accepted' AND "accepted_seq" > 0 AND "accepted_at" IS NOT NULL AND "rejection_json" IS NULL) OR ("outcome" = 'rejected' AND "accepted_seq" IS NULL AND "accepted_at" IS NULL AND "rejection_json" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `protocol_entries` (
	`accepted_seq` integer NOT NULL,
	`entry_index` integer NOT NULL,
	`caused_by_command_id` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`game_key` text NOT NULL,
	`frame_index` integer NOT NULL,
	`source` text NOT NULL,
	`entry_type` text NOT NULL,
	`seat` text NOT NULL,
	`score_a` integer,
	`score_b` integer,
	`body_json` text NOT NULL,
	CONSTRAINT `protocol_entries_pk` PRIMARY KEY(`accepted_seq`, `entry_index`),
	CONSTRAINT `fk_protocol_entries_caused_by_command_id_accepted_seq_commands_command_id_accepted_seq_fk` FOREIGN KEY (`caused_by_command_id`,`accepted_seq`) REFERENCES `commands`(`command_id`,`accepted_seq`),
	CONSTRAINT `protocol_entries_command_index_unique` UNIQUE(`caused_by_command_id`,`entry_index`),
	CONSTRAINT "protocol_entries_nonnegative_index" CHECK("entry_index" >= 0)
);
