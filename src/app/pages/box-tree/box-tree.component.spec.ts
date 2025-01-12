import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoxTreeComponent } from './box-tree.component';

describe('BoxTreeComponent', () => {
  let component: BoxTreeComponent;
  let fixture: ComponentFixture<BoxTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoxTreeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoxTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
