CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`href` text DEFAULT '/inbox/' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`,`read`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requests_booking_user` ON `requests` (`booking_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `requests_user` ON `requests` (`user_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `requests_on` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `joins` ADD `checked_in_at` text;