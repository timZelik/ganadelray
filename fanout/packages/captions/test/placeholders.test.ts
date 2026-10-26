import { describe, expect, it } from 'vitest';
import { renderTemplate, validateCaptionTemplate } from '../src/index.ts';

describe('caption templates', () => {
  it('substitutes every supported placeholder, tolerating inner whitespace', () => {
    const rendered = renderTemplate('{{ title }}\n\n{{originalCaption}}\n\n{{hashtags}} ({{firstLine}})', {
      title: 'Title', originalCaption: 'Line one\nLine two', hashtags: '#a #b', firstLine: 'Line one',
    });
    expect(rendered).toBe('Title\n\nLine one\nLine two\n\n#a #b (Line one)');
  });

  it('collapses the blank lines an empty placeholder leaves behind', () => {
    expect(renderTemplate('{{originalCaption}}\n\n{{hashtags}}\n\n{{title}}', { title: '', originalCaption: 'Body', hashtags: '', firstLine: '' })).toBe('Body');
  });

  it('reports unknown placeholders so typos are caught when the workflow is saved', () => {
    const result = validateCaptionTemplate('{{orignalCaption}} {{hashtags}}');
    expect(result.valid).toBe(false);
    expect(result.problems[0]).toMatch(/Unknown placeholder \{\{orignalCaption\}\}/);
  });
});
