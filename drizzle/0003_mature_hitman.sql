CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_prices` (
	`card_id` text NOT NULL,
	`variant` text NOT NULL,
	`market_usd` real NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `variant`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`rate_per_usd` real NOT NULL,
	`fetched_at` integer NOT NULL
);
