import type { DestinationSettingsView } from '@fanout/api-contract';
import { useState } from 'react';
import { PlatformBadge } from '../../components/PlatformBadge.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Field, Select, TextArea, TextInput } from '../../components/ui/field.tsx';
import { Toggle } from '../../components/ui/toggle.tsx';
import { apiClient } from '../../lib/apiClient.ts';
import { destinationLabels } from '../../lib/formatting.ts';
import { CaptionPreview } from './CaptionPreview.tsx';
import { usePlatformMutation } from './platformQueries.ts';

const placeholders = [
  { token: '{{originalCaption}}', label: 'Caption' },
  { token: '{{hashtags}}', label: 'Hashtags' },
  { token: '{{title}}', label: 'Title' },
  { token: '{{firstLine}}', label: 'First line' },
];
const practiceValue = '';

function parseHashtags(text: string): string[] {
  return text.split(/[\s,]+/).map((tag) => tag.replace(/^#+/, '')).filter((tag) => tag !== '');
}

/** One platform: on/off, which account, and how its caption is written. */
export function DestinationCard({ destination, bufferConnected }: { destination: DestinationSettingsView; bufferConnected: boolean }) {
  const update = usePlatformMutation((changes: Parameters<typeof apiClient.updateDestination>[1]) => apiClient.updateDestination(destination.id, changes));
  const [template, setTemplate] = useState(destination.captionTemplate);
  const [hashtagText, setHashtagText] = useState(destination.hashtags.map((tag) => `#${tag}`).join(' '));
  const hashtags = parseHashtags(hashtagText);
  const isDirty = template !== destination.captionTemplate || hashtags.join(' ') !== destination.hashtags.join(' ');
  const label = destinationLabels[destination.destinationKind];

  return (
    <Card className="space-y-4 p-5" data-testid="destination-card" data-platform={destination.destinationKind}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlatformBadge destinationKind={destination.destinationKind} />
          {destination.enabled && (destination.mode === 'live' ? <Badge tone="success">Posts for real</Badge> : <Badge tone="warning">Practice</Badge>)}
        </div>
        <Toggle label={`Post to ${label}`} checked={destination.enabled} disabled={update.isPending} onChange={(enabled) => update.mutate({ enabled })} />
      </div>

      {destination.enabled && (
        <>
          <Field label="Post with" hint={bufferConnected ? (destination.channelOptions.length === 0 ? `No ${label} account in Buffer yet. Connect one in Buffer, then reconnect here.` : undefined) : 'Connect Buffer above to choose an account.'}>
            <Select
              data-testid="account-select"
              value={destination.channelId ?? practiceValue}
              disabled={!bufferConnected || update.isPending}
              onChange={(event) => update.mutate({ channelId: event.target.value === practiceValue ? null : event.target.value })}
            >
              <option value={practiceValue}>Practice only (don't post)</option>
              {destination.channelOptions.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </Select>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Caption style">
                <TextArea value={template} onChange={(event) => setTemplate(event.target.value)} rows={4} data-testid="template-input" />
              </Field>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Insert:</span>
                {placeholders.map(({ token, label: placeholderLabel }) => (
                  <button key={token} type="button" onClick={() => setTemplate((current) => `${current}${current.endsWith('\n') || current === '' ? '' : ' '}${token}`)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">
                    {placeholderLabel}
                  </button>
                ))}
              </div>
              <Field label="Hashtags for this platform" hint="Separate with spaces. Ones already in your caption aren't repeated.">
                <TextInput value={hashtagText} onChange={(event) => setHashtagText(event.target.value)} placeholder="#art #studio" data-testid="hashtags-input" />
              </Field>
            </div>
            <CaptionPreview destinationKind={destination.destinationKind} template={template} hashtags={hashtags} />
          </div>

          <div className="flex items-center justify-end gap-3">
            {update.error && <p role="alert" className="text-sm text-danger">{update.error.message}</p>}
            {update.isSuccess && !isDirty && <span className="text-sm text-success">Saved</span>}
            <Button variant="primary" disabled={!isDirty || update.isPending} onClick={() => update.mutate({ captionTemplate: template, hashtags })}>Save</Button>
          </div>
        </>
      )}
    </Card>
  );
}
