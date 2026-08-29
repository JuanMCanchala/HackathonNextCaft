import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClerk } from 'ngx-clerk';

import { routes } from './app.routes';
import { provideSentraCore } from './app.providers';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideClerk({
      publishableKey: environment.clerk.publishableKey,
      signInUrl: environment.clerk.signInUrl,
      signUpUrl: environment.clerk.signUpUrl,
    }),
    provideSentraCore(),
  ],
};
