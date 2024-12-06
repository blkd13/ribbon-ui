import { TestBed } from '@angular/core/testing';

import { ApiGiteaService } from './api-gitea.service';

describe('ApiGiteaService', () => {
  let service: ApiGiteaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiGiteaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
