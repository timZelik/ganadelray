import { publishJobStatuses, type PublishJobStatus } from '@fanout/api-contract';
import { classNames } from '../../lib/classNames.ts';

interface StatusFilterProps {
  selected: PublishJobStatus | undefined;
  onSelect(status: PublishJobStatus | undefined): void;
}

const options: Array<PublishJobStatus | undefined> = [undefined, ...publishJobStatuses];

export function StatusFilter({ selected, onSelect }: StatusFilterProps) {
  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((status) => (
        <button
          key={status ?? 'all'}
          role="tab"
          aria-selected={selected === status}
          onClick={() => onSelect(status)}
          className={classNames('rounded-md px-3 py-1 text-sm capitalize transition-colors', selected === status ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {status ?? 'all'}
        </button>
      ))}
    </div>
  );
}
