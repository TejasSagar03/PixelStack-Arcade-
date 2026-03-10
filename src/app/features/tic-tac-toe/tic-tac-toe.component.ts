import { Component, signal, computed, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

interface GameResult {
  winner: 'X' | 'O' | 'Draw' | null;
  line: number[] | null;
}

@Component({
  selector: 'app-tic-tac-toe',
  standalone: true,
  imports: [RouterLink, NgClass],
  templateUrl: './tic-tac-toe.component.html',
  styleUrls: ['./tic-tac-toe.component.scss'],
  animations: [
    trigger('popIn', [
      transition(':enter', [
        style({ transform: 'scale(0.5)', opacity: 0 }),
        animate('0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)', 
          style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ])
  ]
})
export class TicTacToeComponent {
  board = signal<('X' | 'O' | null)[]>(Array(9).fill(null));
  xIsNext = signal<boolean>(true);
  gameMode = signal<'PvP' | 'PvE'>('PvE'); 
  
  result = computed(() => this.calculateWinner(this.board()));
  currentPlayer = computed(() => this.xIsNext() ? 'X' : 'O');

  constructor() {
    effect(() => {
      if (this.gameMode() === 'PvE' && !this.xIsNext() && !this.result().winner) {
        setTimeout(() => this.makeComputerMove(), 600);
      }
    });
  }

  setMode(mode: 'PvP' | 'PvE') {
    this.gameMode.set(mode);
    this.resetGame();
  }

  makeMove(index: number) {
    if (this.board()[index] || this.result().winner || (this.gameMode() === 'PvE' && !this.xIsNext())) {
      return;
    }
    this.updateBoard(index);
  }

  private makeComputerMove() {
    const bestMove = this.getSmartMove(this.board());
    if (bestMove !== -1) this.updateBoard(bestMove);
  }

  private updateBoard(index: number) {
    this.board.update(b => {
      const newBoard = [...b];
      newBoard[index] = this.xIsNext() ? 'X' : 'O';
      return newBoard;
    });
    this.xIsNext.update(val => !val);
    
    // Haptics on every move
    this.triggerHaptic(10);

    // Check for win right after move
    const res = this.result();
    if (res.winner && res.winner !== 'Draw') {
      this.playSound('win');
      this.triggerHaptic([50, 50, 100]);
    }
  }

  resetGame() {
    this.board.set(Array(9).fill(null));
    this.xIsNext.set(true);
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

  private getSmartMove(board: ('X' | 'O' | null)[]): number {
    const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
    for (const [a, b, c] of lines) {
      if (board[a] === 'O' && board[b] === 'O' && !board[c]) return c;
      if (board[a] === 'O' && board[c] === 'O' && !board[b]) return b;
      if (board[b] === 'O' && board[c] === 'O' && !board[a]) return a;
    }
    for (const [a, b, c] of lines) {
      if (board[a] === 'X' && board[b] === 'X' && !board[c]) return c;
      if (board[a] === 'X' && board[c] === 'X' && !board[b]) return b;
      if (board[b] === 'X' && board[c] === 'X' && !board[a]) return a;
    }
    if (!board[4]) return 4;
    const emptySpots = board.map((v, i) => v === null ? i : null).filter(v => v !== null) as number[];
    if (emptySpots.length === 0) return -1;
    return emptySpots[Math.floor(Math.random() * emptySpots.length)];
  }

  private calculateWinner(squares: ('X' | 'O' | null)[]): GameResult {
    const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
    for (const [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: [a, b, c] };
      }
    }
    if (!squares.includes(null)) return { winner: 'Draw', line: null };
    return { winner: null, line: null };
  }

  getAnnouncementText(): string {
    const res = this.result();
    if (res.winner === 'Draw') return "It's a Draw!";
    if (this.gameMode() === 'PvE') {
      return res.winner === 'X' ? 'You Win! 🎉' : 'AI Wins! 🤖';
    }
    return `Player ${res.winner} Wins! 🏆`;
  }
}