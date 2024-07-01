import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocViewComponent } from './doc-view.component';

describe('DocViewComponent', () => {
  let component: DocViewComponent;
  let fixture: ComponentFixture<DocViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
