CREATE TABLE `facts` (
	`match_id` text NOT NULL,
	`seq` integer NOT NULL,
	`fact_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`client_id` text NOT NULL,
	`client_seq` integer NOT NULL,
	`at` integer NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT `facts_pk` PRIMARY KEY(`match_id`, `seq`),
	CONSTRAINT `facts_match_id_fact_id_unique` UNIQUE(`match_id`,`fact_id`)
);
--> statement-breakpoint
CREATE TABLE `guest_players` (
	`guest_player_id` text PRIMARY KEY,
	`first_name_uk` text NOT NULL,
	`last_name_uk` text NOT NULL,
	`first_name_en` text NOT NULL,
	`last_name_en` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_protocol_archives` (
	`match_id` text PRIMARY KEY,
	`source_latest_seq` integer NOT NULL,
	`protocol_version` integer NOT NULL,
	`rows_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_snapshots` (
	`match_id` text PRIMARY KEY,
	`latest_seq` integer NOT NULL,
	`state_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY,
	`control_secret` text NOT NULL,
	`game_key` text NOT NULL,
	`config_json` text NOT NULL,
	`latest_seq` integer NOT NULL,
	`seat_a_player_ref` text NOT NULL,
	`seat_b_player_ref` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`lock_at` integer,
	CONSTRAINT "matches_distinct_players" CHECK("seat_a_player_ref" != "seat_b_player_ref"),
	CONSTRAINT "matches_seat_a_player_ref_format" CHECK("seat_a_player_ref" GLOB 'gp_*' OR "seat_a_player_ref" GLOB 'vp_*'),
	CONSTRAINT "matches_seat_b_player_ref_format" CHECK("seat_b_player_ref" GLOB 'gp_*' OR "seat_b_player_ref" GLOB 'vp_*')
);
--> statement-breakpoint
CREATE TABLE `verified_players` (
	`verified_player_id` text PRIMARY KEY,
	`first_name_uk` text NOT NULL,
	`last_name_uk` text NOT NULL,
	`first_name_en` text NOT NULL,
	`last_name_en` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `facts_match_id_seq` ON `facts` (`match_id`,`seq`);