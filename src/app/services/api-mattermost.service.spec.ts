import { TestBed } from '@angular/core/testing';

import { ApiMattermostService } from './api-mattermost.service';

describe('ApiMattermostService', () => {
  let service: ApiMattermostService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiMattermostService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
