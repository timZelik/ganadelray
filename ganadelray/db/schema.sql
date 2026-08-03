-- db/schema.sql
-- Apply in the Supabase SQL editor. Single-user system (Gana), service-key access
-- only — RLS is enabled with no public policies so nothing is reachable from an
-- anon key.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- VIDEOS. Identity = normalized caption prefix + resolved posted date.
-- There is no stable TikTok video_id available from screenshots, so
-- caption_key is the anchor and caption_anchor holds the LONGEST caption
-- prefix ever seen for this video.
-- ---------------------------------------------------------------------------
create table if not exists videos (
  id                  uuid primary key default gen_random_uuid(),
  caption_key         text        not null,
  caption_anchor      text        not null,
  posted_at           date,
  posted_at_precision text        not null default 'UNKNOWN',
  format_tag          text,
  hook_style          text,
  topic_tags          text[]      not null default '{}',
  is_series           boolean     not null default false,
  series_part         int,
  series_name         text,
  classified_at       timestamptz,
  first_seen_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists videos_identity_idx
  on videos (caption_key, coalesce(posted_at, date '1970-01-01'));
create index if not exists videos_topic_idx on videos using gin (topic_tags);

-- ---------------------------------------------------------------------------
-- PER-WINDOW OBSERVATIONS. A video's 7/28/60/365-day follower counts are
-- DIFFERENT FACTS, not overwrites of each other. Follower attribution keeps
-- moving for days, so each weekly ingest adds a new observation row rather
-- than mutating the old one.
-- ---------------------------------------------------------------------------
create table if not exists video_metrics (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid not null references videos(id) on delete cascade,
  metric          text not null check (metric in ('new_followers', 'new_viewers')),
  window_days     int  not null check (window_days in (7, 28, 60, 365)),
  value           bigint not null,
  observed_on     date not null,           -- capture date of the transcript
  ingest_event_id uuid,
  created_at      timestamptz not null default now(),
  unique (video_id, metric, window_days, observed_on)
);

create index if not exists video_metrics_rank_idx
  on video_metrics (metric, window_days, value desc);

-- ---------------------------------------------------------------------------
-- INGEST EVENTS — one per pasted transcript. Keeps the raw text so a parser
-- fix can be replayed against historical pastes.
-- ---------------------------------------------------------------------------
create table if not exists ingest_events (
  id            uuid primary key default gen_random_uuid(),
  captured_on   date not null,
  raw_text      text,
  row_count     int  not null default 0,
  video_count   int  not null default 0,
  new_videos    int  not null default 0,
  ambiguities   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- IDEA LOG — every idea ever produced. Doubles as the dedupe corpus and the
-- accept/reject taste record.
-- ---------------------------------------------------------------------------
create table if not exists idea_log (
  id                uuid primary key default gen_random_uuid(),
  idea_key          text not null,
  concept           text not null,
  hook              text,
  onscreen_text     text,
  why_it_converts   text,
  source_video_id   uuid references videos(id) on delete set null,
  source_caption    text,
  source_followers  int,
  source_window_days int,
  topic_tag         text,
  format_tag        text,
  hook_style        text,
  is_bet            boolean not null default false,
  status            text not null default 'SENT',
  origin            text not null default 'DRIP',
  drip_id           uuid,
  verdict_note      text,
  verdict_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idea_log_created_idx on idea_log (created_at desc);
create index if not exists idea_log_status_idx  on idea_log (status);

-- ---------------------------------------------------------------------------
-- BANKED IDEAS — hers, fired off as a voice note the instant they hit.
-- Re-dripped back on a slow morning when she's stuck.
-- ---------------------------------------------------------------------------
create table if not exists banked_ideas (
  id               uuid primary key default gen_random_uuid(),
  raw_text         text not null,
  cleaned_text     text not null,
  topic_tag        text,
  matched_video_id uuid references videos(id) on delete set null,
  match_note       text,
  redripped_at     timestamptz,
  redrip_count     int not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- DRIP LOG — one row per proactive send. drip_sent_at / gana_responded_at
-- exist FROM DAY ONE so a later job can learn her real engagement offset and
-- move the send time. The learner is NOT built yet (no data to learn from);
-- this table is what makes building it possible without a migration.
-- ---------------------------------------------------------------------------
create table if not exists drip_log (
  id                uuid primary key default gen_random_uuid(),
  drip_date         date not null unique,        -- enforces MAX_PUSHES_PER_DAY = 1
  drip_sent_at      timestamptz not null,
  gana_responded_at timestamptz,                 -- null = silence (which is DATA, not failure)
  response_lag_minutes int generated always as (
    case when gana_responded_at is null then null
    else (extract(epoch from (gana_responded_at - drip_sent_at)) / 60)::int end
  ) stored,
  idea_ids          uuid[] not null default '{}',
  kind              text not null default 'DRIP',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- BOT STATE — single row. Timing lives here, NOT in code, because timing is a
-- value the system will learn.
-- ---------------------------------------------------------------------------
create table if not exists bot_state (
  id                 int primary key default 1 check (id = 1),
  paused             boolean not null default false,
  paused_at          timestamptz,
  unanswered_nudges  int not null default 0,
  drip_hour_local    int not null default 19,
  timezone           text not null default 'America/New_York',
  last_inbound_at    timestamptz,
  drips_since_pattern int not null default 0,
  updated_at         timestamptz not null default now()
);

insert into bot_state (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Lock everything down: service key only.
-- ---------------------------------------------------------------------------
alter table videos         enable row level security;
alter table video_metrics  enable row level security;
alter table ingest_events  enable row level security;
alter table idea_log       enable row level security;
alter table banked_ideas   enable row level security;
alter table drip_log       enable row level security;
alter table bot_state      enable row level security;
