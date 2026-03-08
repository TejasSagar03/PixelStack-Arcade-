import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Game2048Component } from './game-2048.component';

describe('Game2048Component', () => {
  let component: Game2048Component;
  let fixture: ComponentFixture<Game2048Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Game2048Component]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(Game2048Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
