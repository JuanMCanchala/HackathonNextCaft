import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'sentra-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly _mode = signal<ThemeMode>(readStoredMode());
  private readonly _systemDark = signal(prefersDark());

  readonly mode = this._mode.asReadonly();
  readonly resolved = computed((): ResolvedTheme => {
    const mode = this._mode();
    if (mode === 'system') {
      return this._systemDark() ? 'dark' : 'light';
    }
    return mode;
  });

  constructor() {
    this.applyToDocument(this.resolved());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      this._systemDark.set(media.matches);
      if (this._mode() === 'system') {
        this.applyToDocument(this.resolved());
      }
    };
    media.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* private browsing */
    }
    this.applyToDocument(this.resolved());
  }

  /** Alterna oscuro ↔ claro (desde el FAB global). */
  toggle(): void {
    const next: ResolvedTheme = this.resolved() === 'dark' ? 'light' : 'dark';
    this.setMode(next);
  }

  applyToDocument(theme: ResolvedTheme): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }
}

/** Llamar en main.ts antes del bootstrap para evitar flash. */
export function initThemeFromStorage(): void {
  const mode = readStoredMode();
  const resolved: ResolvedTheme =
    mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return 'dark';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
