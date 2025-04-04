import { TestBed } from '@angular/core/testing';

import { ExtApiProviderService } from './ext-api-provider.service';

describe('ExtApiProviderService', () => {
  let service: ExtApiProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExtApiProviderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
