import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { classNames } from '../../lib/classNames.ts';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className={classNames('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={classNames('border-b border-border px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase', className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={classNames('border-b border-border last:border-0', className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={classNames('px-4 py-3 align-top', className)} {...props} />;
}
