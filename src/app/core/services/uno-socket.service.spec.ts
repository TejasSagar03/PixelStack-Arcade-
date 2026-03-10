import { TestBed } from '@angular/core/testing';

import { UnoSocketService } from './uno-socket.service';

describe('UnoSocketService', () => {
  let service: UnoSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UnoSocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
