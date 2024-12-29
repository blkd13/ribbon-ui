import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
    selector: 'app-oauth-mail-message',
    imports: [],
    templateUrl: './oauth-mail-message.component.html',
    styleUrl: './oauth-mail-message.component.scss'
})
export class OAuthMailMessageComponent {


  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);

  pincode!: string;
  ngOnInit(): void {
    this.pincode = this.activatedRoute.snapshot.paramMap.get('pincode') || '';
  }
}
