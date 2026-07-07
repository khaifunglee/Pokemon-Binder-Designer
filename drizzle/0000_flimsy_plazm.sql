CREATE TABLE `binders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`layout` text NOT NULL,
	`sort_strategy` text DEFAULT 'custom' NOT NULL,
	`visual_theme` text,
	`variant_stacking` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`set_id` text NOT NULL,
	`number` text NOT NULL,
	`rarity` text,
	`supertype` text NOT NULL,
	`types` text NOT NULL,
	`national_pokedex_numbers` text NOT NULL,
	`image_small_uri` text,
	`image_large_uri` text,
	`variants` text NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cards_set_id_idx` ON `cards` (`set_id`);--> statement-breakpoint
CREATE INDEX `cards_name_idx` ON `cards` (`name`);--> statement-breakpoint
CREATE TABLE `collection` (
	`card_id` text NOT NULL,
	`variant` text NOT NULL,
	`quantity_owned` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`card_id`, `variant`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`binder_id` text NOT NULL,
	`page_index` integer NOT NULL,
	FOREIGN KEY (`binder_id`) REFERENCES `binders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_binder_page_uq` ON `pages` (`binder_id`,`page_index`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`series` text NOT NULL,
	`printed_total` integer NOT NULL,
	`total` integer NOT NULL,
	`release_date` text NOT NULL,
	`symbol_uri` text,
	`logo_uri` text,
	`cards_ingested_at` integer
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`slot_index` integer NOT NULL,
	`card_id` text,
	`variant` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`condition` text,
	`merged_group_id` text,
	`custom_image_uri` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slots_page_slot_uq` ON `slots` (`page_id`,`slot_index`);