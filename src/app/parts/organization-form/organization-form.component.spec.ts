import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizationFormComponent } from './organization-form.component';

describe('OrganizationFormComponent', () => {
  let component: OrganizationFormComponent;
  let fixture: ComponentFixture<OrganizationFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizationFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganizationFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
