import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { resetPoisonedHttpCache } from './app/core/version/cache-heal';

// Fire-and-forget: drops the year-cached index.html that some browsers stored
// before the `no-cache` fix. Deliberately not awaited — it must not hold up
// bootstrap, and a failure just means it retries on the next load.
resetPoisonedHttpCache();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
