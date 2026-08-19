CREATE TABLE `active_matches` (
  `match_id` text PRIMARY KEY NOT NULL,
  `control_secret` text NOT NULL,
  `config_json` text NOT NULL,
  `latest_seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accepted_facts` (
  `seq` integer PRIMARY KEY NOT NULL,
  `fact_id` text NOT NULL UNIQUE,
  `type` text NOT NULL,
  `payload_json` text NOT NULL,
  `client_id` text NOT NULL,
  `client_seq` integer NOT NULL,
  `at` integer NOT NULL,
  `received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_receipts` (
  `command_id` text PRIMARY KEY NOT NULL,
  `request_json` text NOT NULL,
  `accepted_json` text NOT NULL
);
