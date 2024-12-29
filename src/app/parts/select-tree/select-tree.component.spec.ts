import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectTreeComponent } from './select-tree.component';

describe('SelectTreeComponent', () => {
  let component: SelectTreeComponent;
  let fixture: ComponentFixture<SelectTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectTreeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
