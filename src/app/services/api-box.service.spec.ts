import { TestBed } from '@angular/core/testing';

import { ApiBoxService } from './api-box.service';

describe('ApiBoxService', () => {
  let service: ApiBoxService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiBoxService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
