import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredictHistoryComponent } from './predict-history.component';

describe('PredictHistoryComponent', () => {
  let component: PredictHistoryComponent;
  let fixture: ComponentFixture<PredictHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PredictHistoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PredictHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
