import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initThemeFromStorage } from './app/core/theme/theme.service';

initThemeFromStorage();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
