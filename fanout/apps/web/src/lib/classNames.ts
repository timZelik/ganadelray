import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's `cn`: conditional classes with Tailwind conflicts resolved. */
export function classNames(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
