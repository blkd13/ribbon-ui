import { Component, ElementRef, inject, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

@Component({
  selector: 'app-model-selector',
  imports: [OverlayModule,],
  templateUrl: './model-selector.component.html',
  styleUrl: './model-selector.component.scss'
})
export class ModelSelectorComponent {
  @ViewChild('trigger') triggerRef!: ElementRef;
  @ViewChild('dropdownTemplate') dropdownTemplateRef!: TemplateRef<any>;

  overlayRef!: OverlayRef;

  selected = { label: 'GPT-4o', value: 'gpt-4o', description: 'ほとんどのタスクに最適です' };

  models = [
    { label: 'GPT-4o', value: 'gpt-4o', description: 'ほとんどのタスクに最適です' },
    { label: 'o3', value: 'o3', description: '高度な推論を使用する' },
    { label: 'o4-mini', value: 'o4-mini', description: '高度な推論を最速で実現' },
    { label: 'o4-mini-high', value: 'o4-mini-high', description: 'コーディングと視覚的な推論が得意' },
  ];

  readonly overlay: Overlay = inject(Overlay);
  readonly vcr: ViewContainerRef = inject(ViewContainerRef);

  openDropdown() {
    if (this.overlayRef) {
      this.overlayRef.detach();
    }

    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.triggerRef)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    });

    const portal = new TemplatePortal(this.dropdownTemplateRef, this.vcr);
    this.overlayRef.attach(portal);

    this.overlayRef.backdropClick().subscribe(() => this.overlayRef.detach());
  }

  select(model: any) {
    this.selected = model;
    this.overlayRef.detach();
  }

}
