CREATE TABLE `joins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `joins_booking_user` ON `joins` (`booking_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `joins_user` ON `joins` (`user_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `seats_used` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `name_public` integer DEFAULT false NOT NULL;