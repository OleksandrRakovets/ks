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
	`state_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY,
	`game_key` text NOT NULL,
	`seat_a_player_ref` text NOT NULL,
	`seat_b_player_ref` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`final_source_latest_seq` integer,
	`final_score_json` text,
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
CREATE INDEX `matches_status_created_at_match_id_idx` ON `matches` (`status`,`created_at`,`match_id`);--> statement-breakpoint
CREATE INDEX `matches_status_ended_at_match_id_idx` ON `matches` (`status`,`ended_at`,`match_id`);