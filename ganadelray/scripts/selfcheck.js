#!/usr/bin/env node
// scripts/selfcheck.js
//
// The build-sequence self-checks, runnable end to end:
//
//   step 2  text ingestion      -> row count + follower numbers off the fixture
//   step 3  ranked converters   -> the table Tim eyeballs; proves the backbone
//   step 4  enrichment          -> every row tagged, 10 spot-logged
//   step 5  idea generation     -> 3 ideas, real source + follower count, 1 bet
//   step 6  drip / inverse mode -> statement-form send, on-demand, idea bank
//
// Steps 2-4 and 6 need no network and no API key. Step 5 needs ANTHROPIC_API_KEY
// and is skipped (loudly) without one; pass --live to require it.
//
//   node scripts/selfcheck.js [--live]

const fs = require('fs');
const path = require('path');

process.env.LOCAL_DB_PATH = process.env.LOCAL_DB_PATH
  || path.join(__dirname, '..', '.data', 'selfcheck.json');

const db = require('../src/db/supabaseClient');
const { ingestTranscript } = require('../src/ingest/analyticsIngestor');
const archive = require('../src/archive/converterArchive');
const { enrichArchive } = require('../src/enrich/videoClassifier');
const claude = require('../src/utils/claudeClient');
const { TopicTag, InLaneTopicTags } = require('../src/utils/constants');

const LIVE = process.argv.includes('--live');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-analytics-transcript.md');

let failures = 0;
function check(label, condition, detail) {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function heading(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

async function main() {
  if (db.isSupabase) {
    console.log('Refusing to run self-checks against Supabase. Unset SUPABASE_URL.');
    process.exit(1);
  }
  db.resetLocalStore();

  // ---------------------------------------------------------------- step 2
  heading('STEP 2 — text ingestion');
  const transcript = fs.readFileSync(FIXTURE, 'utf8');
  const summary = await ingestTranscript(transcript, { storeRaw: false });

  console.log(`  captured on ${summary.capturedOn}, ${summary.rowCount} rows -> ${summary.videoCount} videos`);
  check('every parsed row was written as an observation',
    summary.observationsWritten === summary.rowCount,
    `${summary.observationsWritten}/${summary.rowCount}`);
  check('8 sections x 10 rows parsed', summary.rowCount === 80, `${summary.rowCount} rows`);
  check('relative dates resolved against the capture date, not today',
    summary.capturedOn === '2026-07-27', summary.capturedOn);
  check('no unresolved caption ambiguities',
    summary.ambiguities.length === 0, `${summary.ambiguities.length}`);
  check('account context read (peak hour)',
    summary.account.peakHourLocal === 19, `${summary.account.peakHourLocal}:00 local`);

  const loaded = await archive.loadArchive();
  const bands = loaded.find((v) => v.caption.startsWith('weights + bands'));
  const calDiet = loaded.find((v) => v.caption.includes('caldiet'));
  const moving = loaded.find((v) => v.caption.startsWith('things you should rly do'));

  check('"weights + bands" follower counts kept PER WINDOW, not overwritten',
    bands && bands.followers[7] === 8 && bands.followers[28] === 24
      && bands.followers[60] === 66 && bands.followers[365] === 717,
    bands ? `7d=${bands.followers[7]} 28d=${bands.followers[28]} 60d=${bands.followers[60]} 365d=${bands.followers[365]}` : 'missing');
  check('"weights + bands" resolved to its absolute posted date',
    bands && bands.postedAt === '2025-06-03', bands && bands.postedAt);
  check('CalDiet 365d: 542 followers on 4.9M viewers',
    calDiet && calDiet.followers[365] === 542 && calDiet.viewers[365] === 4900000,
    calDiet ? `${calDiet.followers[365]} followers / ${calDiet.viewers[365]} viewers` : 'missing');
  check('"before moving in" 365d: 633 followers',
    moving && moving.followers[365] === 633, moving && String(moving.followers[365]));

  // ---------------------------------------------------------------- step 3
  heading('STEP 3 — archive -> ranked converter table (rank on FOLLOWERS, always)');
  const ranked = archive.rankConverters(loaded, { windowDays: 365, limit: 10 });
  console.table(archive.formatRankTable(ranked));

  const bandsRank = ranked.findIndex((v) => v.caption.startsWith('weights + bands'));
  const calRank = ranked.findIndex((v) => v.caption.includes('caldiet'));
  check('"weights + bands" (717) ranks ABOVE "CalDiet" (542) despite 100x less reach',
    bandsRank !== -1 && calRank !== -1 && bandsRank < calRank,
    `bands #${bandsRank + 1} vs CalDiet #${calRank + 1}`);
  check('#1 converter is the resistance-bands workout',
    ranked[0] && ranked[0].caption.startsWith('weights + bands'),
    ranked[0] && `${ranked[0].newFollowers} followers`);

  const gap = archive.conversionGap(ranked[bandsRank], loaded);
  check('conversion gap computed against her biggest reach winner',
    gap && gap.multiple > 1,
    gap ? `${gap.multiple.toFixed(0)}x better than "${gap.against.caption.slice(0, 28)}..."` : 'none');

  const pool = archive.sourcePool(loaded);
  check('source pool weights recent x high-follower', pool.length > 0,
    `${pool.length} sources, top = "${pool[0] && pool[0].caption.slice(0, 30)}"`);

  // ---------------------------------------------------------------- step 4
  heading('STEP 4 — enrichment (caption -> closed-enum tags)');
  const enriched = await enrichArchive();
  const tagged = await archive.loadArchive();
  const untagged = tagged.filter((v) => v.topicTags.length === 0);
  const unclassified = tagged.filter((v) => v.topicTags.includes(TopicTag.UNCLASSIFIED));

  console.log(`  source: ${enriched.source}`);
  console.table(tagged.slice(0, 10).map((v) => ({
    followers365: v.followers[365] ?? '—',
    topics: v.topicTags.join(','),
    format: v.formatTag,
    hook: v.hookStyle,
    series: v.isSeries ? (v.seriesPart || 'yes') : '',
    caption: v.caption.slice(0, 40),
  })));

  check('every video carries at least one topic tag', untagged.length === 0, `${untagged.length} untagged`);
  check('UNCLASSIFIED is empty (enums cover her real content)',
    unclassified.length === 0,
    unclassified.map((v) => v.caption.slice(0, 30)).join(' | ') || 'none');
  check('in-lane converters tagged in-lane, not OFF_LANE_VIRAL',
    tagged.find((v) => v.caption.startsWith('weights + bands')).topicTags
      .some((tag) => InLaneTopicTags.includes(tag)));
  check('the diet-app ad is correctly tagged OFF_LANE_VIRAL',
    tagged.find((v) => v.caption.includes('caldiet')).topicTags.includes(TopicTag.OFF_LANE_VIRAL));
  check('multi-part videos detected as series',
    tagged.filter((v) => v.isSeries).length >= 3,
    `${tagged.filter((v) => v.isSeries).length} series videos`);

  // --------------------------------------------------------------- step 5a
  // The validation layer around generation is where trust is won or lost, so it
  // is checked offline against synthetic model output rather than only being
  // exercised when an API key happens to be present.
  heading('STEP 5a — generation guard rails (offline, synthetic model output)');
  const { validateAndDedupe, selectIdeas, shouldIncludeBet } = require('../src/ideas/ideaGenerator');
  const taggedPool = archive.sourcePool(tagged);
  const sourceById = new Map(taggedPool.map((video) => [video.id, video]));
  const goodSource = taggedPool.find((v) => v.topicTags.includes(TopicTag.FITNESS_WORKOUTS)) || taggedPool[0];

  const synthetic = [
    { concept: 'Ten-minute no-equipment ab routine filmed in your living room', hook: 'no gym, no bands', onscreen_text: 'small space abs', why_it_converts: 'same no-equipment promise', source_video_id: goodSource.id, topic_tag: TopicTag.FITNESS_WORKOUTS, format_tag: 'TUTORIAL_HOWTO', hook_style: 'CONTRARIAN', is_bet: false },
    { concept: 'A cleaning humour skit about dishes piling up', hook: 'why does this happen', onscreen_text: 'again', why_it_converts: 'went viral before', source_video_id: goodSource.id, topic_tag: TopicTag.OFF_LANE_VIRAL, format_tag: 'STORYTIME', hook_style: 'RELATABLE_CALLOUT', is_bet: false },
    { concept: 'Ten minute no equipment ab routine in the living room', hook: 'dupe', onscreen_text: 'dupe', why_it_converts: 'dupe', source_video_id: goodSource.id, topic_tag: TopicTag.FITNESS_WORKOUTS, format_tag: 'TUTORIAL_HOWTO', hook_style: 'CONTRARIAN', is_bet: false },
    { concept: 'Post something', hook: 'x', onscreen_text: 'x', why_it_converts: 'x', source_video_id: goodSource.id, topic_tag: TopicTag.FITNESS_WORKOUTS, format_tag: 'LISTICLE', hook_style: 'QUESTION', is_bet: false },
    { concept: 'Renter-friendly gym corner setup under one hundred dollars', hook: 'my whole gym is one corner', onscreen_text: 'corner gym', why_it_converts: 'fitness plus apartment, both convert', source_video_id: 'not-a-real-id', topic_tag: TopicTag.FITNESS_WORKOUTS, format_tag: 'VOICEOVER_BROLL', hook_style: 'BOLD_CLAIM', is_bet: false },
    { concept: 'Full apartment reset routine shot as one continuous take', hook: 'one take, whole apartment', onscreen_text: 'one take reset', why_it_converts: 'untested format on a proven topic', source_video_id: goodSource.id, topic_tag: TopicTag.APARTMENT_HOME_SETUP, format_tag: 'DAY_IN_THE_LIFE', hook_style: 'VISUAL_SHOCK', is_bet: true },
  ];

  const validated = validateAndDedupe(synthetic, sourceById, ['Ten-minute no-equipment ab routine filmed in your living room']);
  check('off-lane idea rejected', !validated.some((i) => i.topicTag === TopicTag.OFF_LANE_VIRAL));
  check('idea citing a non-existent source video rejected',
    !validated.some((i) => i.concept.startsWith('Renter-friendly gym corner')));
  check('vague idea rejected', !validated.some((i) => i.concept === 'Post something'));
  check('idea already sent (and its reword) rejected',
    !validated.some((i) => /ab routine/i.test(i.concept)), `${validated.length} survived`);

  const picked = selectIdeas(validated, 3, true);
  check('the bet the model actually wrote is the one kept',
    picked.filter((i) => i.isBet).length === 1
      && picked.find((i) => i.isBet).concept.startsWith('Full apartment reset'));
  check('no bet is fabricated when none survived',
    selectIdeas(validated.filter((i) => !i.isBet), 3, true).every((i) => !i.isBet));
  check('bet quota: due on the very first drip, then ~1 in 5',
    shouldIncludeBet([]) === true
      && shouldIncludeBet([{ is_bet: false }, { is_bet: true }]) === false
      && shouldIncludeBet([{ is_bet: false }, { is_bet: false }, { is_bet: false },
        { is_bet: false }, { is_bet: false }, { is_bet: true }]) === true);

  // ---------------------------------------------------------------- step 5
  heading('STEP 5 — idea generation, live model call');
  if (!claude.isConfigured()) {
    console.log('  SKIPPED — ANTHROPIC_API_KEY not set. Run `npm run selfcheck:live` with a key.');
    if (LIVE) { failures += 1; console.log('  [FAIL] --live requires ANTHROPIC_API_KEY'); }
  } else {
    const { generateIdeas } = require('../src/ideas/ideaGenerator');
    const ideas = await generateIdeas({ count: 3 });
    for (const idea of ideas) {
      console.log(`\n  ${idea.isBet ? 'BET  ' : 'IDEA '} ${idea.concept}`);
      console.log(`        hook: ${idea.hook}`);
      console.log(`        from: "${String(idea.sourceCaption).slice(0, 46)}" (${idea.sourceFollowers} followers)`);
      console.log(`        why : ${idea.whyItConverts}`);
    }
    check('3 ideas produced', ideas.length === 3, `${ideas.length}`);
    check('every idea cites a real source winner + its follower count',
      ideas.every((i) => i.sourceVideoId && Number(i.sourceFollowers) > 0));
    check('every idea is in her proven lane',
      ideas.every((i) => InLaneTopicTags.includes(i.topicTag)),
      ideas.map((i) => i.topicTag).join(','));
    check('exactly one idea is flagged as a bet',
      ideas.filter((i) => i.isBet).length === 1);
  }

  // ---------------------------------------------------------------- step 6/7
  heading('STEP 6/7 — drip, guard rails, statement grammar');
  const { formatDripMessage } = require('../src/telegram/copy');
  const sample = [{
    concept: 'Small-apartment ab routine, no equipment',
    hook: 'you do not need a gym for this',
    sourceCaption: 'weights + bands will enhance these workouts but they are not necessary!',
    sourceFollowers: 717,
    whyItConverts: 'same no-equipment format, same audience',
    isBet: false,
    topicTag: TopicTag.FITNESS_WORKOUTS,
  }];
  const message = formatDripMessage(sample);
  console.log(`\n${message.split('\n').map((line) => `  | ${line}`).join('\n')}\n`);
  check('drip copy leads with the follower number, not views', /717/.test(message));
  check('drip copy is a statement she can ignore, not a question',
    !message.trim().endsWith('?'));

  const { canDripToday, registerInbound } = require('../src/schedule/dripScheduler');
  const first = await canDripToday();
  check('drip allowed when nothing has been sent today', first.allowed === true, first.reason);
  await db.recordDrip({ dripDate: first.dripDate, ideaIds: [], kind: 'DRIP' });
  const second = await canDripToday();
  check('second drip on the same day is blocked (MAX_PUSHES_PER_DAY = 1)',
    second.allowed === false, second.reason);

  await db.updateBotState({ paused: true });
  const paused = await canDripToday();
  check('pause suppresses the drip', paused.allowed === false, paused.reason);
  await db.updateBotState({ paused: false });

  await registerInbound();
  const drips = await db.getDrips();
  check('gana_responded_at stamped on inbound (timing-learner hook)',
    Boolean(drips[0].gana_responded_at), drips[0].gana_responded_at);
  const state = await db.getBotState();
  check('unanswered-nudge counter reset by a reply', state.unanswered_nudges === 0);

  await db.updateBotState({ unanswered_nudges: 3 });
  const silent = await canDripToday();
  check('auto-stop after 3 unanswered drips', silent.allowed === false, silent.reason);

  heading(failures === 0 ? 'ALL SELF-CHECKS PASSED' : `${failures} SELF-CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
