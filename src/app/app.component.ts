import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GService } from './services/g.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Ribbon UI';

  constructor(
    // ここでgを初期化しておかないとqueryパラメータが取得できなくなるのでここで読んでおく。
    public g: GService,
  ) {
  }
}
