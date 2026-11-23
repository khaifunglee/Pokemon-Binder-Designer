ALTER TABLE `cards` ADD `illustrator` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `flag_variants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `price_variants` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `price_checked_at` integer;--> statement-breakpoint
ALTER TABLE `cards` ADD `manual_variants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sets` ADD `placeholder_flags` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sets` ADD `variants_checked_at` integer;--> statement-breakpoint
-- Roadmap step 2: every set re-downloads over GraphQL (illustrator, raw flags).
UPDATE `sets` SET `cards_ingested_at` = NULL;