import type { HTMLAttributes } from 'react';
import { classNames } from '../../lib/classNames.ts';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('rounded-xl border border-border bg-card shadow-sm', className)} {...props} />;
}
