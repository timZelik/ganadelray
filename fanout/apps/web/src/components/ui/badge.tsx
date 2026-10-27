import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { classNames } from '../../lib/classNames.ts';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground ring-border',
      info: 'bg-info/10 text-info ring-info/30',
      success: 'bg-success/10 text-success ring-success/30',
      warning: 'bg-warning/10 text-warning ring-warning/30',
      danger: 'bg-danger/10 text-danger ring-danger/30',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={classNames(badgeVariants({ tone }), className)} {...props} />;
}
