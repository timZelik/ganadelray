const maximumFallbackLength = 160;

type ProblemRule = [pattern: RegExp, explain: (match: RegExpMatchArray) => string];

/** Pipeline errors are precise but technical; this is what a creator sees instead. First matching rule wins. */
const problemRules: ProblemRule[] = [
  [/minimum is ([\d.]+)s/, (match) => `Too short for this platform: it needs at least ${match[1]} seconds.`],
  [/Video is ([\d.]+)s; maximum is (\d+)s/, (match) => `Too long for this platform: the limit is ${formatDuration(Number(match[2]))}.`],
  [/File is \d+ bytes; maximum is (\d+)/, (match) => `The file is too big for this platform (limit ${Math.round(Number(match[1]) / 1_048_576)} MB).`],
  [/not readable media|no video stream|no dimensions|no measurable duration/i, () => "We couldn't read this file. Try exporting it again as an MP4."],
  [/Master is ([\d.]+)s long; the minimum is ([\d.]+)s/, (match) => `This video is too short (it needs at least ${match[2]} seconds).`],
  [/Choose which Buffer channel/, () => 'Pick which account this platform posts to, on the Platforms page.'],
  [/Buffer refused the post: (.*)/, (match) => `Buffer couldn't post it: ${match[1]}`],
  [/reconnect|not connected|needs_reauth|UNAUTHENTICATED/i, () => 'Buffer needs to be reconnected on the Platforms page.'],
  [/expired before publishing/, () => 'The prepared video expired. Press Try again to prepare it again.'],
  [/timed out|HTTP 5\d\d|did not complete/i, () => "The service didn't answer in time. Press Try again."],
];

function formatDuration(totalSeconds: number): string {
  return totalSeconds >= 60 ? `${Math.round(totalSeconds / 60)} minutes` : `${totalSeconds} seconds`;
}

export function toFriendlyProblem(technicalMessage: string | null): string | null {
  if (!technicalMessage) return null;
  for (const [pattern, explain] of problemRules) {
    const match = technicalMessage.match(pattern);
    if (match) return explain(match);
  }
  const trimmed = technicalMessage.replace(/^Not publishable to \w+: /, '');
  return trimmed.length > maximumFallbackLength ? `${trimmed.slice(0, maximumFallbackLength)}…` : trimmed;
}
