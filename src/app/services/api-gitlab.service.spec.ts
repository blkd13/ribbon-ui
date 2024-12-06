import { TestBed } from '@angular/core/testing';

import { ApiGitlabService } from './api-gitlab.service';

describe('ApiGitlabService', () => {
  let service: ApiGitlabService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiGitlabService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
