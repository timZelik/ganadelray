import type { FitMode } from '@fanout/api-contract';
import { Card } from '../../components/ui/card.tsx';
import { apiClient } from '../../lib/apiClient.ts';
import { classNames } from '../../lib/classNames.ts';
import { usePlatformMutation } from './platformQueries.ts';

const choices: Array<{ fitMode: FitMode; title: string; description: string }> = [
  { fitMode: 'crop', title: 'Fill the screen', description: 'Trims the sides of wide videos. Best for most content.' },
  { fitMode: 'pad', title: 'Show the whole video', description: 'Keeps everything visible, with bars above and below.' },
];

/** Tiny phone mock-ups make the difference obvious without words. */
function FramingIllustration({ fitMode }: { fitMode: FitMode }) {
  return (
    <div className="flex h-20 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-foreground/70 bg-black">
      <div className={classNames('bg-gradient-to-br from-indigo-500 to-fuchsia-500', fitMode === 'crop' ? 'h-full w-[300%]' : 'h-6 w-full')} />
    </div>
  );
}

export function FramingChoice({ fitMode }: { fitMode: FitMode }) {
  const update = usePlatformMutation(apiClient.updateFitMode);
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Vertical framing</h2>
        <p className="text-sm text-muted-foreground">How wide (16:9) videos become vertical (9:16).</p>
      </div>
      <div role="radiogroup" aria-label="Vertical framing" className="grid gap-3 sm:grid-cols-2">
        {choices.map((choice) => (
          <button
            key={choice.fitMode}
            type="button"
            role="radio"
            aria-checked={fitMode === choice.fitMode}
            onClick={() => update.mutate(choice.fitMode)}
            className={classNames('flex items-center gap-4 rounded-lg border-2 p-3 text-left transition-colors', fitMode === choice.fitMode ? 'border-info bg-info/5' : 'border-border hover:bg-muted')}
          >
            <FramingIllustration fitMode={choice.fitMode} />
            <span>
              <span className="block font-medium">{choice.title}</span>
              <span className="block text-sm text-muted-foreground">{choice.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
