import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExtApiProviderComponent } from './ext-api-provider.component';

describe('ExtApiProviderComponent', () => {
  let component: ExtApiProviderComponent;
  let fixture: ComponentFixture<ExtApiProviderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExtApiProviderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExtApiProviderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
