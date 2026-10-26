export const captionPlaceholders = ['originalCaption', 'hashtags', 'title', 'firstLine'] as const;
export type CaptionPlaceholder = (typeof captionPlaceholders)[number];
export type CaptionValues = Record<CaptionPlaceholder, string>;

const placeholderPattern = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

function isKnownPlaceholder(name: string): name is CaptionPlaceholder {
  return (captionPlaceholders as readonly string[]).includes(name);
}

export function findUnknownPlaceholders(template: string): string[] {
  return [...template.matchAll(placeholderPattern)].map(([, name]) => name!).filter((name) => !isKnownPlaceholder(name));
}

/** Rejects templates with typos like {{orignalCaption}} when a workflow is saved, not when a post goes out. */
export function validateCaptionTemplate(template: string): { valid: boolean; problems: string[] } {
  const problems = findUnknownPlaceholders(template).map((name) => `Unknown placeholder {{${name}}}; use one of ${captionPlaceholders.map((known) => `{{${known}}}`).join(', ')}`);
  return { valid: problems.length === 0, problems };
}

/** Substitutes placeholders, then tidies the blank lines and spaces an empty value leaves behind. */
export function renderTemplate(template: string, values: CaptionValues): string {
  return template
    .replace(placeholderPattern, (_match, name: string) => (isKnownPlaceholder(name) ? values[name] : ''))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
