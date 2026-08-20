CREATE TABLE `__new_accepted_facts` (
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
INSERT INTO `__new_accepted_facts` (`seq`, `fact_id`, `match_id`, `type`, `payload_json`, `client_id`, `client_seq`, `at`, `received_at`)
SELECT `seq`, `fact_id`, (SELECT `match_id` FROM `active_matches` LIMIT 1), `type`, `payload_json`, `client_id`, `client_seq`, `at`, `received_at`
FROM `accepted_facts`;
--> statement-breakpoint
DROP TABLE `accepted_facts`;
--> statement-breakpoint
ALTER TABLE `__new_accepted_facts` RENAME TO `accepted_facts`;
