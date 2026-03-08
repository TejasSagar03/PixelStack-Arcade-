import { Component, signal, effect, inject, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { DOCUMENT, CommonModule } from '@angular/common'; 
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [RouterLink, CommonModule], 
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.scss'],
  animations: [
    trigger('listAnimation', [
      transition('* <=> *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(60px) skewX(-5deg)' }),
          stagger('150ms', [
            animate('800ms cubic-bezier(0.16, 1, 0.3, 1)', 
            style({ opacity: 1, transform: 'translateY(0) skewX(-5deg)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class HubComponent implements OnInit {
  private document = inject(DOCUMENT);
  private apiService = inject(ApiService);
  
  // FIX: Change to public so HTML template can access it
  public router = inject(Router); 
  
  currentUser = this.apiService.currentUser;
  isDarkMode = signal(true); 
  
  // FIX: Added missing signal for modal control
  showProfileModal = signal(false);

  games = [
    { 
      title: 'Tic Tac Toe', route: '/tic-tac-toe', bgClass: 'bg-neon-blue', 
      watermark: 'X O', tags: ['2-PLAYER', 'STRATEGY'],
      info: 'The classic 3x3 grid battle. Predict, block, and outsmart your opponent to align three symbols.' 
    },
    { 
      title: '2048', route: '/2048', bgClass: 'bg-neon-gold', 
      watermark: '2048', tags: ['SINGLE PLAYER', 'PUZZLE'],
      info: 'A test of foresight and math. Slide the board to merge identical tiles and reach the ultimate number.' 
    },
    { 
      title: 'UNO', route: '/uno', bgClass: 'bg-neon-red', 
      watermark: 'UNO', tags: ['MULTIPLAYER', 'CARDS'],
      info: 'The ultimate friendship ruiner. Strategize your colors, drop your wild cards, and shed your hand first.' 
    }
  ];

  constructor() {
    effect(() => {
      if (this.isDarkMode()) {
        this.document.body.classList.add('dark-theme');
        this.document.body.classList.remove('light-theme');
      } else {
        this.document.body.classList.add('light-theme');
        this.document.body.classList.remove('dark-theme');
      }
      localStorage.setItem('pixelstack-theme', this.isDarkMode() ? 'dark' : 'light');
    });
  }

  ngOnInit() {
    const savedTheme = localStorage.getItem('pixelstack-theme');
    if (savedTheme === 'light') {
      this.isDarkMode.set(false);
    }
  }

  toggleTheme() {
    this.isDarkMode.update(mode => !mode);
  }

  // FIX: Added missing method for modal toggling
  toggleProfile() {
    this.showProfileModal.update(val => !val);
  }

  logout() {
    this.apiService.currentUser.set(null);
    this.showProfileModal.set(false);
  }

  playGame(route: string) {
    if (this.currentUser()) {
      this.router.navigate([route]); 
    } else {
      this.router.navigate(['/auth']); 
    }
  }
}