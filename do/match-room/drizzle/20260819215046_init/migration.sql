CREATE TABLE `active_matches` (
	`match_id` text PRIMARY KEY,
	`control_secret` text NOT NULL,
	`config_json` text NOT NULL,
	`latest_seq` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accepted_facts` (
	`seq` integer PRIMARY KEY,
	`fact_id` text NOT NULL UNIQUE,
	`match_id` text NOT NULL REFERENCES `active_matches`(`match_id`),
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`client_id` text NOT NULL,
	`client_seq` integer NOT NULL,
	`at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_receipts` (
	`command_id` text PRIMARY KEY,
	`request_json` text NOT NULL,
	`accepted_json` text NOT NULL
);
