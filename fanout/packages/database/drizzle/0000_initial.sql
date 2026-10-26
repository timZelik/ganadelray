CREATE TYPE "public"."connection_status" AS ENUM('active', 'needs_reauth', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."destination_kind" AS ENUM('instagram_reels', 'instagram_stories', 'instagram_feed', 'facebook_reels', 'youtube_shorts', 'tiktok', 'linkedin', 'threads', 'pinterest', 'x', 'archive');--> statement-breakpoint
CREATE TYPE "public"."error_kind" AS ENUM('retryable', 'permanent', 'reauth_required');--> statement-breakpoint
CREATE TYPE "public"."fit_mode" AS ENUM('pad', 'crop');--> statement-breakpoint
CREATE TYPE "public"."publish_job_status" AS ENUM('queued', 'preparing', 'publishing', 'processing', 'published', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."publisher_route" AS ENUM('direct', 'buffer', 'upload_post', 'console');--> statement-breakpoint
CREATE TYPE "public"."workflow_mode" AS ENUM('auto_new', 'backlog');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_item_id" uuid NOT NULL,
	"workflow_destination_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"render_fingerprint" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" text NOT NULL,
	"connection_id" uuid,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"status_code" integer,
	"latency_milliseconds" integer NOT NULL,
	"redacted_request_body" jsonb,
	"redacted_response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"account_handle" text NOT NULL,
	"encrypted_token_set" text,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"workflow_destination_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "publish_job_status" DEFAULT 'queued' NOT NULL,
	"dry_run" boolean NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"external_post_id" text,
	"external_post_url" text,
	"last_error" text,
	"last_error_kind" "error_kind",
	"request_preview" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_jobs_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"title" text,
	"original_caption" text,
	"duration_seconds" double precision NOT NULL,
	"master_storage_key" text NOT NULL,
	"master_checksum" text NOT NULL,
	"master_metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_cursors" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"cursor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"destination_kind" "destination_kind" NOT NULL,
	"publisher_route" "publisher_route" NOT NULL,
	"connection_id" uuid,
	"caption_template" text DEFAULT '{{originalCaption}}

{{hashtags}}' NOT NULL,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"media_profile_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_connection_id" uuid NOT NULL,
	"mode" "workflow_mode" DEFAULT 'auto_new' NOT NULL,
	"fit_mode" "fit_mode" DEFAULT 'pad' NOT NULL,
	"schedule_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workflow_destination_id_workflow_destinations_id_fk" FOREIGN KEY ("workflow_destination_id") REFERENCES "public"."workflow_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workflow_destination_id_workflow_destinations_id_fk" FOREIGN KEY ("workflow_destination_id") REFERENCES "public"."workflow_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_connection_id_connections_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_cursors" ADD CONSTRAINT "watch_cursors_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_destinations" ADD CONSTRAINT "workflow_destinations_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_destinations" ADD CONSTRAINT "workflow_destinations_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_source_connection_id_connections_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_source_item_id_workflow_destination_id_index" ON "assets" USING btree ("source_item_id","workflow_destination_id");--> statement-breakpoint
CREATE INDEX "assets_source_item_id_render_fingerprint_index" ON "assets" USING btree ("source_item_id","render_fingerprint");--> statement-breakpoint
CREATE INDEX "assets_expires_at_index" ON "assets" USING btree ("expires_at") WHERE "assets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "audit_logs_correlation_id_index" ON "audit_logs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_platform_account_handle_index" ON "connections" USING btree ("platform","account_handle");--> statement-breakpoint
CREATE INDEX "publish_jobs_status_index" ON "publish_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publish_jobs_created_at_index" ON "publish_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "publish_jobs_source_item_id_index" ON "publish_jobs" USING btree ("source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_items_source_connection_id_external_id_index" ON "source_items" USING btree ("source_connection_id","external_id");--> statement-breakpoint
CREATE INDEX "workflow_destinations_workflow_id_index" ON "workflow_destinations" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflows_source_connection_id_index" ON "workflows" USING btree ("source_connection_id");