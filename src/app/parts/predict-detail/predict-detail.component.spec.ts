import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredictDetailComponent } from './predict-detail.component';

describe('PredictDetailComponent', () => {
  let component: PredictDetailComponent;
  let fixture: ComponentFixture<PredictDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PredictDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PredictDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
