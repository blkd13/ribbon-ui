import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export const STORAGE_KEY = 'animation-enabled';

@Injectable({
  providedIn: 'root'
})
export class AnimationService {
  private animationEnabled = new BehaviorSubject<boolean>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'true')
  );
  animationEnabled$ = this.animationEnabled.asObservable();

  toggleAnimation(enabled: boolean) {
    this.animationEnabled.next(enabled);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    // ページのリロードを促す
    window.location.reload();
  }
}
