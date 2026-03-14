import { Routes } from '@angular/router';

export const routes: Routes = [
  { 
    path: '', 
    loadComponent: () => import('./features/hub/hub.component').then(m => m.HubComponent),
    title: 'PixelStack | Arcade Hub'
  },

  {
    path: 'auth',
    loadComponent: () => import('./components/auth/auth.component').then(m => m.AuthComponent),
    title: 'PixelStack | Login'
  },

  { 
    path: 'tic-tac-toe', 
    loadComponent: () => import('./features/tic-tac-toe/tic-tac-toe.component').then(m => m.TicTacToeComponent),
    title: 'PixelStack | Tic Tac Toe'
  },
  { 
    path: '2048', 
    loadComponent: () => import('./features/game-2048/game-2048.component').then(m => m.Game2048Component),
    title: 'PixelStack | 2048'
  },
  { 
    path: 'uno', 
    loadComponent: () => import('./features/uno/uno.component').then(m => m.UnoComponent),
    title: 'PixelStack | UNO'
  },
  
  { 
    path: 'racing', 
    loadComponent: () => import('./features/racing/racing.component').then(m => m.RacingComponent),
    title: 'PixelStack | Neon Drifter'
  },

  { 
    path: 'typing', 
    loadComponent: () => import('./features/typing/typing.component').then(m => m.TypingComponent),
    title: 'PixelStack | Terminal Hack'
  },

  { 
    path: 'shinobi', 
    loadComponent: () => import('./features/shinobi/shinobi.component').then(m => m.ShinobiComponent),
    title: 'PixelStack | Shinobi Dash'
  },

  { 
    path: '**', 
    redirectTo: '' 
  }
];
