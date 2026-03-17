import { Component, ElementRef, ViewChild, OnInit, OnDestroy, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Character {
  id: string; name: string; title: string; color: string; jutsu: string; special: string;
  imgUrl: string; backImgUrl?: string; 
  sfxUrl?: string; 
}

@Component({
  selector: 'app-shinobi',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shinobi.component.html',
  styleUrls: ['./shinobi.component.scss']
})
export class ShinobiComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  Math = Math;
  // ADDED 'PAUSED' STATE
  gameState = signal<'SELECT_HERO' | 'SELECT_BOSS' | 'LOADING' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('SELECT_HERO');
  selectedHero = signal<Character | null>(null);
  selectedBoss = signal<Character | null>(null);

  heroes: Character[] = [
    { id: 'naruto', name: 'NARUTO', title: 'Nine-Tails Jinchūriki', color: '#ff7b00', jutsu: 'Shuriken', special: 'RASENGAN', imgUrl: '/assets/naruto_front.png', backImgUrl: '/assets/naruto_back.png', sfxUrl: '/assets/sounds/rasengan.mp3' },
    { id: 'sasuke', name: 'SASUKE', title: 'Uchiha Survivor', color: '#0088ff', jutsu: 'Fireball', special: 'CHIDORI', imgUrl: '/assets/sasuke_front.png', backImgUrl: '/assets/sasuke_back.png', sfxUrl: '/assets/sounds/chidori.mp3' }
  ];

  bosses: Character[] = [
    { id: 'itachi', name: 'ITACHI', title: 'Genjutsu Master', color: '#ff003c', jutsu: 'Crow Clone', special: 'AMATERASU', imgUrl: '/assets/itachi_front.png' },
    { id: 'pain', name: 'PAIN', title: 'Leader of Akatsuki', color: '#9d00ff', jutsu: 'Rod Impale', special: 'ALMIGHTY PUSH', imgUrl: '/assets/pain_front.png' },
    { id: 'obito', name: 'OBITO', title: 'The Masked Man', color: '#ffaa00', jutsu: 'Kamui', special: 'WOOD STYLE', imgUrl: '/assets/obito_front.png' },
    { id: 'madara', name: 'MADARA', title: 'Uchiha Ghost', color: '#0054ff', jutsu: 'Gunbai', special: 'METEOR', imgUrl: '/assets/madara_front.png' }
  ];

  private bgm = new Audio('/assets/sounds/battle_music.mp3');
  private sfx = new Audio();

  private animationFrameId: number = 0;
  private lastTime: number = 0;
  private gameSpeed = 600; 
  distance = signal<number>(0);
  chakra = signal<number>(0);
  isSpecialActive = signal<boolean>(false);
  
  private currentLane = 1; 
  private laneX = [-250, 0, 250]; 
  
  private player = { x: 0, y: 0, vy: 0, gravity: 3000, jumpPower: -1200, isJumping: false, tilt: 0 };
  private entities: any[] = [];
  private spawnTimer = 0;
  private fov = 300; 

  private playerImg: any = new Image();
  private bossImg: any = new Image();

  // --- TOUCH GESTURE TRACKING ---
  private touchStartX = 0;
  private touchStartY = 0;

  ngOnInit() {}
  ngOnDestroy() { cancelAnimationFrame(this.animationFrameId); this.bgm.pause(); }

  // --- KEYBOARD CONTROLS ---
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'Escape') { this.togglePause(); return; }
    if (this.gameState() !== 'PLAYING') return;

    if (e.key === 'ArrowLeft' && this.currentLane > 0) { this.currentLane--; this.player.tilt = -15; }
    if (e.key === 'ArrowRight' && this.currentLane < 2) { this.currentLane++; this.player.tilt = 15; }
    if ((e.key === ' ' || e.key === 'ArrowUp') && !this.player.isJumping) {
      this.player.vy = this.player.jumpPower; this.player.isJumping = true;
    }
    if ((e.key === 'Shift' || e.key.toLowerCase() === 'e') && this.chakra() >= 100) this.activateSpecial();
    e.preventDefault();
  }

  // --- MOBILE SWIPE CONTROLS ---
  onTouchStart(e: TouchEvent) {
    if (this.gameState() !== 'PLAYING') return;
    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
  }

  onTouchEnd(e: TouchEvent) {
    if (this.gameState() !== 'PLAYING') return;
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const dx = touchEndX - this.touchStartX;
    const dy = touchEndY - this.touchStartY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal Swipe
      if (dx > 40 && this.currentLane < 2) { this.currentLane++; this.player.tilt = 15; }
      else if (dx < -40 && this.currentLane > 0) { this.currentLane--; this.player.tilt = -15; }
    } else {
      // Vertical Swipe or Tap
      if (dy < -40 && !this.player.isJumping) {
        this.player.vy = this.player.jumpPower; this.player.isJumping = true;
      } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && this.chakra() >= 100) {
        this.activateSpecial(); // Tap to trigger Jutsu
      }
    }
    e.preventDefault();
  }

  // --- PAUSE LOGIC ---
  togglePause() {
    if (this.gameState() === 'PLAYING') {
      this.gameState.set('PAUSED');
      cancelAnimationFrame(this.animationFrameId);
      this.bgm.pause();
    } else if (this.gameState() === 'PAUSED') {
      this.gameState.set('PLAYING');
      this.lastTime = performance.now(); // Prevents the time-delta teleport bug!
      this.bgm.play();
      this.gameLoop(this.lastTime);
    }
  }

  private activateSpecial() {
    this.chakra.set(0); this.isSpecialActive.set(true);
    if (this.selectedHero()?.sfxUrl) {
      this.sfx.src = this.selectedHero()!.sfxUrl!; this.sfx.volume = 1.0;
      this.sfx.play().catch(e => console.log('SFX Blocked', e));
    }
    const prevSpeed = this.gameSpeed; this.gameSpeed *= 2.5;
    setTimeout(() => { this.isSpecialActive.set(false); this.gameSpeed = prevSpeed; }, 3000);
  }

  startGame() {
    if (this.selectedHero() && this.selectedBoss()) {
      this.gameState.set('LOADING');
      this.bgm.loop = true; this.bgm.volume = 0.4;
      this.bgm.play().catch(e => console.log('BGM Blocked.'));
      setTimeout(() => { this.gameState.set('PLAYING'); setTimeout(() => this.initEngine(), 0); }, 1500);
    }
  }

  private removeSolidBackground(img: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const bgR = data[0], bgG = data[1], bgB = data[2];
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - bgR) < 30 && Math.abs(data[i+1] - bgG) < 30 && Math.abs(data[i+2] - bgB) < 30) data[i+3] = 0; 
      }
      ctx.putImageData(imgData, 0, 0);
    } catch(e) {}
    return canvas;
  }

  private initEngine() {
    this.ctx = this.canvasRef!.nativeElement.getContext('2d')!;
    this.distance.set(0); this.chakra.set(0); this.gameSpeed = 600;
    this.entities = []; this.currentLane = 1;
    this.player.x = 0; this.player.y = 0; this.player.tilt = 0;
    
    if (this.selectedHero()?.backImgUrl) {
      const pImg = new Image(); pImg.src = this.selectedHero()!.backImgUrl!;
      pImg.onload = () => { this.playerImg = this.removeSolidBackground(pImg); };
    }
    if (this.selectedBoss()?.imgUrl) {
      const bImg = new Image(); bImg.src = this.selectedBoss()!.imgUrl!;
      bImg.onload = () => { this.bossImg = this.removeSolidBackground(bImg); };
    }

    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  private gameLoop(timestamp: number) {
    if (this.gameState() !== 'PLAYING') return;
    const dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    this.update(dt);
    this.draw();
    this.animationFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  private update(dt: number) {
    this.distance.update(d => d + (this.gameSpeed * dt * 0.1));
    if (!this.isSpecialActive()) this.gameSpeed += 15 * dt;

    const targetX = this.laneX[this.currentLane];
    this.player.x += (targetX - this.player.x) * 0.2;
    this.player.tilt *= 0.8;

    if (this.player.isJumping) {
      this.player.vy += this.player.gravity * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y >= 0) { this.player.y = 0; this.player.isJumping = false; this.player.vy = 0; }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const isScroll = Math.random() > 0.6;
      this.entities.push({ lane: Math.floor(Math.random() * 3), z: 2000, type: isScroll ? 'SCROLL' : 'BOSS' });
      this.spawnTimer = Math.max(0.3, 1.2 - (this.gameSpeed * 0.0005));
    }

    for (let i = this.entities.length - 1; i >= 0; i--) {
      let ent = this.entities[i];
      ent.z -= this.gameSpeed * dt;

      if (ent.z < 50 && ent.z > -50) {
        if (ent.lane === this.currentLane) {
          if (ent.type === 'BOSS' && !this.isSpecialActive()) {
            if (!this.player.isJumping) { this.gameOver(); return; }
          } else if (ent.type === 'SCROLL') {
            this.chakra.update(c => Math.min(100, c + 15));
            this.entities.splice(i, 1);
            continue;
          }
        }
      }
      if (ent.z < -100) this.entities.splice(i, 1);
    }
  }

  private draw() {
    this.ctx.clearRect(0, 0, 800, 400);

    const cx = 400; const cy = 180; 

    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.lineWidth = 2;
    this.laneX.forEach(lx => {
      this.ctx.beginPath();
      this.ctx.moveTo(cx + (lx * (this.fov / (this.fov + 2000))), cy);
      this.ctx.lineTo(cx + (lx * 3), 400);
      this.ctx.stroke();
    });

    this.entities.sort((a, b) => b.z - a.z).forEach(ent => {
      if (ent.z < 0) return;
      const scale = this.fov / (this.fov + ent.z); 
      const x = cx + (this.laneX[ent.lane] * scale);
      const y = cy + (150 * scale); 
      
      if (ent.type === 'BOSS') {
        const w = 150 * scale; const h = 200 * scale;
        if (this.bossImg.width) { this.ctx.drawImage(this.bossImg, x - w/2, y - h, w, h); }
      } else {
        const w = 60 * scale; const h = 40 * scale;
        this.ctx.fillStyle = '#ffd700';
        this.ctx.shadowBlur = 10; this.ctx.shadowColor = '#ffd700';
        this.ctx.fillRect(x - w/2, y - h, w, h);
        this.ctx.shadowBlur = 0;
      }
    });

    const pSize = 140; 
    this.ctx.save();
    this.ctx.translate(cx + this.player.x, 320 + this.player.y);
    this.ctx.rotate(this.player.tilt * Math.PI / 180);
    
    if (this.isSpecialActive()) {
      this.ctx.shadowBlur = 40; this.ctx.shadowColor = this.selectedHero()?.color || '#fff';
    }

    if (this.playerImg.width) {
      this.ctx.drawImage(this.playerImg, -pSize/2, -pSize, pSize, pSize);
    }
    this.ctx.restore();
  }

  private gameOver() { 
    this.gameState.set('GAMEOVER'); cancelAnimationFrame(this.animationFrameId); 
    this.bgm.pause(); this.bgm.currentTime = 0;
  }

  selectHero(h: any) { this.selectedHero.set(h); }
  confirmHero() { if (this.selectedHero()) this.gameState.set('SELECT_BOSS'); }
  selectBoss(b: any) { this.selectedBoss.set(b); }
  goBack() { this.selectedBoss.set(null); this.gameState.set('SELECT_HERO'); }
}