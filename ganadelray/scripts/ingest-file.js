#!/usr/bin/env node
// scripts/ingest-file.js
//
// Ingest a Gemini-transcribed analytics dump from disk, then print the ranked
// converter table. This is the manual path Tim uses when he'd rather not paste
// into Telegram.
//
//   node scripts/ingest-file.js fixtures/sample-analytics-transcript.md

require('dotenv').config();

const fs = require('fs');
const { ingestTranscript } = require('../src/ingest/analyticsIngestor');
const { enrichArchive } = require('../src/enrich/videoClassifier');
const archiveLib = require('../src/archive/converterArchive');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/ingest-file.js <transcript.md>');
    process.exit(1);
  }

  const summary = await ingestTranscript(fs.readFileSync(file, 'utf8'));
  console.log(`\ncaptured ${summary.capturedOn}: ${summary.rowCount} rows -> ${summary.videoCount} videos (${summary.newVideos} new)`);
  if (summary.ambiguities.length) {
    console.log('\nambiguous rows (worth asking Gana about):');
    console.table(summary.ambiguities);
  }

  const enriched = await enrichArchive();
  console.log(`classified ${enriched.classified} videos via ${enriched.source}`);

  const archive = await archiveLib.loadArchive();
  console.log('\nRANKED CONVERTERS — new followers, 365d:');
  console.table(archiveLib.formatRankTable(archiveLib.rankConverters(archive, { windowDays: 365, limit: 15 })));
}

main().catch((error) => { console.error(error); process.exit(1); });
