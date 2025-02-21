import { TestBed } from '@angular/core/testing';

import { ToolCallService } from './tool-call.service';

describe('ToolCallService', () => {
  let service: ToolCallService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToolCallService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
