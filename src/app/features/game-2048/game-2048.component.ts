import { Component, HostListener, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgStyle } from '@angular/common';
import { trigger, transition, style, animate, keyframes } from '@angular/animations';
import { ApiService } from '../../core/services/api.service';
import { LeaderboardComponent } from '../../components/leaderboard/leaderboard.component';

interface GameState {
  grid: number[][];
  score: number;
}

@Component({
  selector: 'app-game-2048',
  standalone: true,
  imports: [RouterLink, NgStyle, LeaderboardComponent],
  templateUrl: './game-2048.component.html',
  styleUrls: ['./game-2048.component.scss'],
  animations: [
    trigger('tileAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0)', opacity: 0 }),
        animate('200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)', 
          style({ transform: 'scale(1)', opacity: 1 }))
      ]),
      transition('* => *', [
        animate('150ms ease-in-out', keyframes([
          style({ transform: 'scale(1)', offset: 0 }),
          style({ transform: 'scale(1.15)', offset: 0.5 }),
          style({ transform: 'scale(1)', offset: 1 })
        ]))
      ])
    ])
  ]
})
export class Game2048Component {
  private apiService = inject(ApiService);

  grid = signal<number[][]>(this.getEmptyGrid());
  score = signal<number>(0);
  history = signal<GameState[]>([]); 
  
  hasWon = signal<boolean>(false);
  keepPlaying = signal<boolean>(false); 
  gameOver = signal<boolean>(false);

  private touchStartX = 0;
  private touchStartY = 0;
  private touchEndX = 0;
  private touchEndY = 0;

  constructor() {
    this.initGame();
  }

  initGame() {
    this.grid.set(this.getEmptyGrid());
    this.score.set(0);
    this.history.set([]);
    this.hasWon.set(false);
    this.keepPlaying.set(false);
    this.gameOver.set(false);
    this.addRandomTile();
    this.addRandomTile();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.gameOver() || (this.hasWon() && !this.keepPlaying())) return;

    let moved = false;
    const currentGrid = this.grid();
    const currentScore = this.score();

    switch (event.key) {
      case 'ArrowUp': case 'w': case 'W': moved = this.move('UP'); break;
      case 'ArrowDown': case 's': case 'S': moved = this.move('DOWN'); break;
      case 'ArrowLeft': case 'a': case 'A': moved = this.move('LEFT'); break;
      case 'ArrowRight': case 'd': case 'D': moved = this.move('RIGHT'); break;
    }

    if (moved) {
      event.preventDefault(); 
      this.history.update(h => [...h, { grid: this.cloneGrid(currentGrid), score: currentScore }]);
      this.addRandomTile();
      this.checkGameState();
    }
  }

  @HostListener('touchstart', ['$event'])
  handleTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
    this.touchStartY = event.changedTouches[0].screenY;
  }

  @HostListener('touchend', ['$event'])
  handleTouchEnd(event: TouchEvent) {
    this.touchEndX = event.changedTouches[0].screenX;
    this.touchEndY = event.changedTouches[0].screenY;
    this.handleSwipe();
  }

  private handleSwipe() {
    if (this.gameOver() || (this.hasWon() && !this.keepPlaying())) return;

    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;
    const minSwipeDistance = 30;

    if (Math.abs(deltaX) < minSwipeDistance && Math.abs(deltaY) < minSwipeDistance) return; 

    let moved = false;
    const currentGrid = this.grid();
    const currentScore = this.score();

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      moved = deltaX > 0 ? this.move('RIGHT') : this.move('LEFT');
    } else {
      moved = deltaY > 0 ? this.move('DOWN') : this.move('UP');
    }

    if (moved) {
      this.history.update(h => [...h, { grid: this.cloneGrid(currentGrid), score: currentScore }]);
      this.addRandomTile();
      this.checkGameState();
    }
  }

  undo() {
    const hist = this.history();
    if (hist.length > 0) {
      const previousState = hist[hist.length - 1];
      this.grid.set(previousState.grid);
      this.score.set(previousState.score);
      this.history.set(hist.slice(0, -1));
      this.gameOver.set(false);
      this.triggerHaptic(30);
    }
  }

  continuePlaying() {
    this.keepPlaying.set(true);
    this.triggerHaptic(50);
  }

  private move(direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): boolean {
    let oldGrid = this.cloneGrid(this.grid());
    let newGrid = this.cloneGrid(oldGrid);
    let scoreIncrease = 0;

    const slideAndMerge = (line: number[]): number[] => {
      let filtered = line.filter(val => val !== 0); 
      for (let i = 0; i < filtered.length - 1; i++) {
        if (filtered[i] !== 0 && filtered[i] === filtered[i + 1]) {
          filtered[i] *= 2; 
          scoreIncrease += filtered[i];
          filtered[i + 1] = 0; 
        }
      }
      filtered = filtered.filter(val => val !== 0); 
      while (filtered.length < 4) filtered.push(0); 
      return filtered;
    };

    if (direction === 'LEFT' || direction === 'RIGHT') {
      for (let r = 0; r < 4; r++) {
        let row = [...newGrid[r]];
        if (direction === 'RIGHT') row.reverse();
        row = slideAndMerge(row);
        if (direction === 'RIGHT') row.reverse();
        newGrid[r] = row;
      }
    } else if (direction === 'UP' || direction === 'DOWN') {
      for (let c = 0; c < 4; c++) {
        let col = [newGrid[0][c], newGrid[1][c], newGrid[2][c], newGrid[3][c]];
        if (direction === 'DOWN') col.reverse();
        col = slideAndMerge(col);
        if (direction === 'DOWN') col.reverse();
        for (let r = 0; r < 4; r++) {
          newGrid[r][c] = col[r];
        }
      }
    }

    const moved = JSON.stringify(oldGrid) !== JSON.stringify(newGrid);

    if (moved) {
      this.grid.set(newGrid);
      this.score.update(s => s + scoreIncrease);
      
      if (scoreIncrease > 0) {
        this.triggerHaptic([20, 30]);
      } else {
        this.triggerHaptic(15);
      }
    }

    return moved;
  }

  private addRandomTile() {
    const emptyCells = [];
    const current = this.grid();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (current[r][c] === 0) emptyCells.push({ r, c });
      }
    }
    if (emptyCells.length > 0) {
      const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      this.grid.update(g => {
        const newG = this.cloneGrid(g);
        newG[r][c] = Math.random() < 0.9 ? 2 : 4;
        return newG;
      });
    }
  }

  private checkGameState() {
    const flatGrid = this.grid().flat();
    
    if (flatGrid.includes(2048) && !this.hasWon() && !this.keepPlaying()) {
      this.hasWon.set(true);
      this.triggerHaptic([50, 50, 100]);
      this.playSound('win');
    }

    if (!flatGrid.includes(0)) {
      let canMove = false;
      const g = this.grid();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (c < 3 && g[r][c] === g[r][c + 1]) canMove = true;
          if (r < 3 && g[r][c] === g[r + 1][c]) canMove = true;
        }
      }
      if (!canMove) {
        this.gameOver.set(true);
        this.triggerHaptic([100, 50, 100]);
        this.saveFinalScore(); 
      }
    }
  }

  private async saveFinalScore() {
    const finalScore = this.score();
    if (finalScore > 0) {
      try {
        await this.apiService.submitScore('2048', finalScore);
      } catch (error) {
        console.error('Failed to save score.', error);
      }
    }
  }

  private triggerHaptic(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  private playSound(soundName: 'win') {
    const audio = new Audio();
    audio.src = `/assets/sounds/${soundName}.mp3`;
    audio.load();
    audio.play().catch(err => console.warn('Audio blocked', err));
  }

  private getEmptyGrid(): number[][] { return Array.from({ length: 4 }, () => Array(4).fill(0)); }
  private cloneGrid(grid: number[][]): number[][] { return grid.map(row => [...row]); }

  getTileColor(value: number): string {
    const colors: { [key: number]: string } = {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e', 4096: '#3c3a32',
      8192: '#3c3a32', 16384: '#1e1b4b'
    };
    return colors[value] || '#3c3a32';
  }

  getTextColor(value: number): string { return value <= 4 ? '#776e65' : '#f9f6f2'; }
}