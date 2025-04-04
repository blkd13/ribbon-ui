import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

@Component({
    selector: 'app-oauth-provider-form',
    templateUrl: './oauth-provider-form.component.html'
})
export class OauthProviderFormComponent {
    step = 1;
    provider = 'mattermost';
    form: FormGroup;

    providerTemplates: any = {
        mattermost: {
            scopes: ['', 'read_user', 'user:email'],
            redirectUri: 'https://yourapp.com/oauth/mattermost/callback'
        },
        box: {
            scopes: ['root_readwrite'],
            redirectUri: 'https://yourapp.com/oauth/box/callback'
        },
        gitlab: {
            scopes: ['read_user', 'api', 'read_api'],
            redirectUri: 'https://yourapp.com/oauth/gitlab/callback'
        },
        gitea: {
            scopes: ['user', 'read:repo', 'user:email'],
            redirectUri: 'https://yourapp.com/oauth/gitea/callback'
        }
    };

    constructor(private fb: FormBuilder) {
        this.form = this.fb.group({
            uriBase: [''],
            clientId: [''],
            clientSecret: [''],
            scope: [this.providerTemplates[this.provider].scopes[0]],
            requireMailAuth: [false]
        });
    }

    keyvalue(obj: { [key: string]: any }): { key: string, value: any }[] {
        return Object.keys(obj).map(key => ({ key, value: obj[key] }));
    }

    onProviderChange(event: any) {
        const selected = event.target.value;
        this.provider = selected;
        this.form.patchValue({
            scope: this.providerTemplates[selected].scopes[0]
        });
    }

    copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    submit() {
        const config = {
            ...this.form.value,
            redirectUri: this.providerTemplates[this.provider].redirectUri,
            provider: this.provider
        };
        console.log('Submitted config:', config);
    }
}
