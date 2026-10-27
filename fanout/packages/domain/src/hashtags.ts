const hashtagPattern = /(?<=^|\s)#[\p{L}\p{N}_]+/gu;

export function extractHashtags(text: string): string[] {
  return text.match(hashtagPattern) ?? [];
}

export function countHashtags(text: string): number {
  return extractHashtags(text).length;
}
