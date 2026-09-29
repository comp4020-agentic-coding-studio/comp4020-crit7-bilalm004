CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`start_utc` text NOT NULL,
	`end_utc` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_room_start` ON `bookings` (`room_id`,`start_utc`);--> statement-breakpoint
CREATE INDEX `bookings_user_start` ON `bookings` (`user_id`,`start_utc`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`library` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL
);
