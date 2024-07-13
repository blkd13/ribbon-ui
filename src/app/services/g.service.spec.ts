import { TestBed } from '@angular/core/testing';

import { GService } from './g.service';

describe('GService', () => {
  let service: GService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
