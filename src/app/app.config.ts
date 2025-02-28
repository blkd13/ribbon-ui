import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection, isDevMode, inject, provideAppInitializer, EnvironmentProviders, Provider, APP_INITIALIZER, SecurityContext } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimations, provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { MarkdownService, MARKED_OPTIONS, provideMarkdown } from 'ngx-markdown';
import { NgxIndexedDBModule } from 'ngx-indexed-db';
import { dbConfig } from './app.db.config';
import { ApiInterceptor } from './api.interceptor';
import { provideServiceWorker } from '@angular/service-worker';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { STORAGE_KEY } from './services/animation.service';

function getAnimationProvider(): (EnvironmentProviders | Provider[])[] {
  const animationEnabled = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'true');
  return animationEnabled ? [provideAnimations(), provideAnimationsAsync()] : [provideNoopAnimations()];
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'ja-JP' },// 日本語ロケールを設定
    { provide: HTTP_INTERCEPTORS, useClass: ApiInterceptor, multi: true },
    provideHttpClient(withInterceptorsFromDi()),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation(), withInMemoryScrolling()),
    provideMarkdown({
      markedOptions: {
        provide: MARKED_OPTIONS,
        useValue: {
          gfm: true,
          breaks: true,
          pedantic: false,
        },
      },
    }),
    importProvidersFrom([
      NgxIndexedDBModule.forRoot(dbConfig),
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: (http: HttpClient) => new TranslateHttpLoader(http, './assets/i18n/', '.json'),
          deps: [HttpClient]
        }
      })
    ]),
    // provideAnimations(),
    // provideAnimationsAsync(),
    // provideNoopAnimations(),
    ...getAnimationProvider(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideAppInitializer(() => {
      const initializerFn = (() => {
        const iconRegistry = inject(MatIconRegistry);
        const markdownService = inject(MarkdownService);
        return () => {
          iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
          markdownService.renderer.link = ({ href, title, text }) => {
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
          };
        };
      })();
      return initializerFn();
    })
  ]
};
