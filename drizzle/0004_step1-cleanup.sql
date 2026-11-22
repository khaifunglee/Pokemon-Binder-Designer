-- Roadmap step 1 (2026-11-22): one-time fresh start on every device.
-- All existing data is test data; keep exchange rates and the
-- display-currency setting. FK-safe order.
DELETE FROM `slots`;--> statement-breakpoint
DELETE FROM `pages`;--> statement-breakpoint
DELETE FROM `binders`;--> statement-breakpoint
DELETE FROM `collection`;--> statement-breakpoint
DELETE FROM `card_prices`;--> statement-breakpoint
DELETE FROM `cards`;--> statement-breakpoint
DELETE FROM `sets`;--> statement-breakpoint
ALTER TABLE `slots` DROP COLUMN `merged_group_id`;--> statement-breakpoint
ALTER TABLE `slots` DROP COLUMN `custom_image_uri`;--> statement-breakpoint
-- Settings for removed features (gaps prompt, TCGdex migration marker).
DELETE FROM `app_settings` WHERE `key` IN ('pokedexGaps', 'catalogSource');
