import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compone clases Tailwind sin conflictos (base para Helm / Spartan). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
