import { useQuery } from '@tanstack/react-query';
import { BufferConnectionCard } from './BufferConnectionCard.tsx';
import { DestinationCard } from './DestinationCard.tsx';
import { FramingChoice } from './FramingChoice.tsx';
import { platformsQuery } from './platformQueries.ts';

export function PlatformsPage() {
  const { data, error } = useQuery(platformsQuery);
  if (error) return <p role="alert" className="text-sm text-danger">Could not load settings: {error.message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platforms</h1>
        <p className="text-sm text-muted-foreground">Choose where your videos go and how each caption is written.</p>
      </div>
      {!data.livePostingEnabled && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm" data-testid="server-practice-notice">
          This Fanout is set to practice mode, so nothing is posted even with Buffer connected. The person who installed it can switch it on.
        </p>
      )}
      <BufferConnectionCard buffer={data.buffer} />
      <div className="space-y-3">
        <h2 className="font-semibold">Where to post</h2>
        {data.destinations.map((destination) => <DestinationCard key={destination.id} destination={destination} bufferConnected={data.buffer.connected} />)}
      </div>
      <FramingChoice fitMode={data.fitMode} />
    </section>
  );
}
