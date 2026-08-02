CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
