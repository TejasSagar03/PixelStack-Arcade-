import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface CharData {
  expected: string;
  typed: string | null;
  state: 'pending' | 'correct' | 'incorrect';
}

interface LeaderboardEntry { name: string; wpm: number; accuracy: number; date: string; }

@Component({
  selector: 'app-typing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './typing.component.html',
  styleUrls: ['./typing.component.scss']
})
export class TypingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('matrixCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('mobileInput', { static: false }) mobileInputRef?: ElementRef<HTMLInputElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private matrixInterval: any;
  private timerInterval: any;

  Math = Math;

  gameState = signal<'START' | 'PLAYING' | 'GAMEOVER' | 'LEADERBOARD'>('START');
  timeLimit = 60; 
  timeLeft = signal<number>(this.timeLimit);
  hasStartedTyping = signal<boolean>(false);
  
  textData = signal<CharData[]>([]);
  currentIndex = signal<number>(0);
  
  correctChars = signal<number>(0);
  totalTyped = signal<number>(0);
  leaderboard = signal<LeaderboardEntry[]>([]);

  private audioCtx: any = null;

  wpm = computed(() => {
    const minutesElapsed = (this.timeLimit - this.timeLeft()) / 60;
    if (minutesElapsed === 0) return 0;
    return Math.round((this.correctChars() / 5) / minutesElapsed);
  });

  accuracy = computed(() => {
    if (this.totalTyped() === 0) return 100;
    return Math.round((this.correctChars() / this.totalTyped()) * 100);
  });

  private snippets = [
    "function initMatrix() {\n  const canvas = document.getElementById('matrix');\n  const ctx = canvas.getContext('2d');\n  canvas.width = window.innerWidth;\n  canvas.height = window.innerHeight;\n  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';\n  return ctx;\n}",
    "const calculateWPM = (correctChars, timeElapsed) => {\n  const minutes = timeElapsed / 60;\n  const words = correctChars / 5;\n  return Math.floor(words / minutes);\n};\nconsole.log(calculateWPM(250, 60));",
    "class CyberNinja extends Player {\n  constructor(name, speed) {\n    super(name);\n    this.speed = speed;\n    this.weapon = 'Kunai';\n  }\n  dash() {\n    this.x += this.speed;\n  }\n}",
    "@keyframes glitch-anim {\n  0% { clip-path: inset(20% 0 80% 0); }\n  20% { clip-path: inset(60% 0 10% 0); }\n  40% { clip-path: inset(40% 0 50% 0); }\n  60% { clip-path: inset(80% 0 5% 0); }\n  100% { clip-path: inset(10% 0 70% 0); }\n}"
  ];

  ngAfterViewInit() { this.initMatrix(); this.loadLeaderboard(); }

  ngOnDestroy() { clearInterval(this.matrixInterval); clearInterval(this.timerInterval); if (this.audioCtx) this.audioCtx.close(); }

  private initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  // FORCE KEYBOARD OPEN WHEN CLICKING ANYWHERE
  @HostListener('window:click')
  handleWindowClick() {
    if (this.gameState() === 'PLAYING') this.focusMobileKeyboard();
  }

  // --- 1. THE MOBILE INPUT FIX ---
  onMobileInput(event: Event) {
    if (this.gameState() !== 'PLAYING') return;
    const inputElement = event.target as HTMLInputElement;
    const inputType = (event as any).inputType; 
    const value = inputElement.value;

    if (!this.hasStartedTyping()) { this.hasStartedTyping.set(true); this.startTimer(); }

    if (inputType === 'deleteContentBackward') {
      this.handleBackspace();
    } else if (inputType === 'insertLineBreak') {
      this.processTyping('\n'); 
    } else if (value.length > 0) {
      // Loop handles whole words if mobile autocorrect injects a chunk!
      for (let i = 0; i < value.length; i++) {
        this.processTyping(value[i]);
      }
    }
    
    inputElement.value = ''; // Instantly clear to prevent buildup
  }

  focusMobileKeyboard() {
    if (this.mobileInputRef) this.mobileInputRef.nativeElement.focus();
  }

  // --- 2. THE DESKTOP DOUBLE-FIRE FIX ---
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    if (this.gameState() !== 'PLAYING') return;
    
    // Ignore modifiers
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

    // If on Mobile, the keyboard sends 'Unidentified' or 229. We ignore it here so onMobileInput handles it perfectly!
    if (e.key === 'Unidentified' || e.keyCode === 229) return;

    // PREVENT DEFAULT! This stops the Desktop browser from sending the key to the hidden input, killing the double-fire bug!
    e.preventDefault(); 

    if (!this.hasStartedTyping()) { this.hasStartedTyping.set(true); this.startTimer(); }

    if (e.key === 'Backspace') {
      this.handleBackspace();
      return;
    }
    
    const keyToProcess = e.key === 'Enter' ? '\n' : e.key;
    this.processTyping(keyToProcess);
  }

  // --- 3. SMART BACKSPACE ---
  private handleBackspace() {
    if (this.currentIndex() > 0) {
      let stepsBack = 1;
      const data = this.textData();
      
      // If we are backspacing into an Auto-Indent, delete all the spaces at once!
      if (data[this.currentIndex() - 1].expected === ' ' && data[this.currentIndex() - 1].typed === ' ') {
         let tempIdx = this.currentIndex() - 1;
         let spaceCount = 0;
         while (tempIdx >= 0 && data[tempIdx].expected === ' ') { spaceCount++; tempIdx--; }
         if (tempIdx >= 0 && data[tempIdx].expected === '\n') stepsBack = spaceCount;
      }

      this.currentIndex.update(i => i - stepsBack);
      
      this.textData.update(d => {
        const newData = [...d];
        for(let i = 0; i < stepsBack; i++) {
           newData[this.currentIndex() + i].state = 'pending';
           newData[this.currentIndex() + i].typed = null;
        }
        return newData;
      });
      
      this.triggerHaptic(5);
      this.playSound('backspace');
    }
  }

  // --- 4. AUTO-INDENT FIX ---
  private processTyping(key: string) {
    const index = this.currentIndex();
    const data = this.textData();
    if (index >= data.length) { this.endGame(); return; }

    const expectedChar = data[index].expected;
    const isCorrect = key === expectedChar;

    this.totalTyped.update(t => t + 1);
    if (isCorrect) this.correctChars.update(c => c + 1);

    this.textData.update(d => {
      const newData = [...d];
      newData[index].typed = key;
      newData[index].state = isCorrect ? 'correct' : 'incorrect';
      return newData;
    });

    this.currentIndex.update(i => i + 1);

    if (!isCorrect) { 
      this.triggerHaptic([20, 20]); this.playSound('error'); 
    } else { 
      this.triggerHaptic(5); this.playSound('click'); 
      
      // AUTO-INDENT: If you correctly hit Enter, auto-fill the spaces on the next line!
      if (expectedChar === '\n') {
         let nextIdx = this.currentIndex();
         let spacesToSkip = 0;
         while (nextIdx < data.length && data[nextIdx].expected === ' ') { spacesToSkip++; nextIdx++; }
         
         if (spacesToSkip > 0) {
           this.textData.update(d => {
             const newData = [...d];
             for(let s = 0; s < spacesToSkip; s++) {
               newData[this.currentIndex() + s].typed = ' ';
               newData[this.currentIndex() + s].state = 'correct';
             }
             return newData;
           });
           this.currentIndex.update(i => i + spacesToSkip);
           this.correctChars.update(c => c + spacesToSkip);
           this.totalTyped.update(t => t + spacesToSkip);
         }
      }
    }

    if (this.currentIndex() >= data.length) this.endGame();
  }

  startGame() {
    this.initAudio(); 
    this.gameState.set('PLAYING');
    this.timeLeft.set(this.timeLimit);
    this.hasStartedTyping.set(false);
    this.correctChars.set(0); this.totalTyped.set(0); this.currentIndex.set(0);
    clearInterval(this.timerInterval);

    const randomSnippet = this.snippets[Math.floor(Math.random() * this.snippets.length)];
    const parsedData: CharData[] = randomSnippet.split('').map(char => ({ expected: char, typed: null, state: 'pending' }));
    this.textData.set(parsedData);

    setTimeout(() => this.focusMobileKeyboard(), 100);
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      this.timeLeft.update(t => t - 1);
      if (this.timeLeft() <= 0) this.endGame();
    }, 1000);
  }

  private endGame() {
    clearInterval(this.timerInterval); this.playSound('finish'); this.saveToLeaderboard(); this.gameState.set('GAMEOVER');
  }

  private loadLeaderboard() {
    const saved = localStorage.getItem('pixelstack-typing-wpm');
    if (saved) this.leaderboard.set(JSON.parse(saved));
  }

  private saveToLeaderboard() {
    if (this.totalTyped() === 0) return;
    const newEntry: LeaderboardEntry = { name: 'GUEST_HACKER', wpm: this.wpm(), accuracy: this.accuracy(), date: new Date().toLocaleDateString() };
    this.leaderboard.update(lb => {
      const updated = [...lb, newEntry].sort((a, b) => b.wpm - a.wpm).slice(0, 10);
      localStorage.setItem('pixelstack-typing-wpm', JSON.stringify(updated));
      return updated;
    });
  }

  showLeaderboard() { this.gameState.set('LEADERBOARD'); }

  private initMatrix() {
    const canvas = this.canvasRef.nativeElement; this.ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*';
    const fontSize = 14; const columns = canvas.width / fontSize;
    const drops: number[] = []; for(let x = 0; x < columns; x++) drops[x] = 1;
    this.matrixInterval = setInterval(() => {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'; this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.ctx.fillStyle = '#0f0'; this.ctx.font = fontSize + 'px monospace';
      for(let i = 0; i < drops.length; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        this.ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if(drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }, 33);
  }

  private triggerHaptic(pattern: number | number[]) { 
    if (typeof navigator !== 'undefined' && (navigator as any).vibrate) (navigator as any).vibrate(pattern);
  }

  private playSound(type: 'click' | 'error' | 'backspace' | 'finish') {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const now = this.audioCtx.currentTime; const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain();
    osc.connect(gain); gain.connect(this.audioCtx.destination);
    
    if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.03); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03); osc.start(now); osc.stop(now + 0.03); }
    else if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    else if (type === 'backspace') { osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(200, now + 0.04); gain.gain.setValueAtTime(0.06, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04); osc.start(now); osc.stop(now + 0.04); }
    else if (type === 'finish') { osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(880, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.4); osc.start(now); osc.stop(now + 0.4); }
  }
}