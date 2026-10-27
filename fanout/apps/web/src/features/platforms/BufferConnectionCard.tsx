import type { PlatformsResponse } from '@fanout/api-contract';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Field, TextInput } from '../../components/ui/field.tsx';
import { apiClient } from '../../lib/apiClient.ts';
import { usePlatformMutation } from './platformQueries.ts';

/** Buffer holds the actual social logins; Fanout only needs one API key from it. */
export function BufferConnectionCard({ buffer }: { buffer: PlatformsResponse['buffer'] }) {
  const [apiKey, setApiKey] = useState('');
  const connect = usePlatformMutation(apiClient.connectBuffer);
  const disconnect = usePlatformMutation(apiClient.disconnectBuffer);

  function submit(event: FormEvent) {
    event.preventDefault();
    connect.mutate(apiKey, { onSuccess: () => setApiKey('') });
  }

  if (buffer.connected && !buffer.needsReconnect) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5" data-testid="buffer-connected">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
          <div>
            <p className="font-semibold">Connected to Buffer{buffer.organizationName ? ` (${buffer.organizationName})` : ''}</p>
            <p className="text-sm text-muted-foreground">{buffer.channels.length} account{buffer.channels.length === 1 ? '' : 's'}: {buffer.channels.map((channel) => channel.name).join(', ') || 'none yet'}</p>
          </div>
        </div>
        <Button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Disconnect</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5" data-testid="buffer-setup">
      <div>
        <h2 className="font-semibold">{buffer.needsReconnect ? 'Reconnect Buffer' : 'Connect Buffer to post for real'}</h2>
        <p className="text-sm text-muted-foreground">Buffer is a free service that holds your social media logins. Fanout sends each video through it.</p>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>Create a free account at <a href="https://buffer.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline">buffer.com <ExternalLink className="size-3" aria-hidden /></a>.</li>
        <li>In Buffer, connect your TikTok, Instagram, YouTube and LinkedIn accounts.</li>
        <li>In Buffer, open <strong>Settings → API</strong>, create a key and copy it.</li>
        <li>Paste it below.</li>
      </ol>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Buffer API key">
            <TextInput data-testid="buffer-key-input" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your key here" />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="medium" disabled={connect.isPending || apiKey.trim().length < 10}>{connect.isPending ? 'Checking…' : 'Connect'}</Button>
      </form>
      {connect.error && <p role="alert" className="text-sm text-danger">{connect.error.message}</p>}
    </Card>
  );
}
