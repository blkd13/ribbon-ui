import { Injectable } from '@angular/core';

export type AppConfig = {
    ga4MeasurementId?: string;
};

@Injectable({ providedIn: 'root' })
export class AppConfigService {
    private config: AppConfig = {};
    async load(): Promise<void> {
        try {
            const res = await fetch('assets/config.runtime.json', { cache: 'no-cache' });
            if (res.ok) this.config = await res.json();
        } catch { }
    }
    get(key: keyof AppConfig) { return this.config[key]; }
}
