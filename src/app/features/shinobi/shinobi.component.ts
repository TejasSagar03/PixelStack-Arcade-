import { Component, ElementRef, ViewChild, OnInit, OnDestroy, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Character {
  id: string; name: string; title: string; color: string; jutsu: string; special: string; spriteUrl: string;
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
  gameState = signal<'SELECT_HERO' | 'SELECT_BOSS' | 'LOADING' | 'PLAYING' | 'GAMEOVER'>('SELECT_HERO');
  selectedHero = signal<Character | null>(null);
  selectedBoss = signal<Character | null>(null);

  heroes: Character[] = [
    { id: 'naruto', name: 'NARUTO', title: 'Nine-Tails Jinchūriki', color: '#ff7b00', jutsu: 'Shuriken', special: 'RASENGAN', spriteUrl: '' },
    { id: 'sasuke', name: 'SASUKE', title: 'Uchiha Survivor', color: '#0088ff', jutsu: 'Fireball', special: 'CHIDORI', spriteUrl: '' }
  ];

  bosses: Character[] = [
    { id: 'itachi', name: 'ITACHI', title: 'Genjutsu Master', color: '#ff003c', jutsu: 'Crow Clone', special: 'AMATERASU', spriteUrl: '' },
    { id: 'pain', name: 'PAIN', title: 'Leader of Akatsuki', color: '#9d00ff', jutsu: 'Rod Impale', special: 'ALMIGHTY PUSH', spriteUrl: '' },
    { id: 'obito', name: 'OBITO', title: 'The Masked Man', color: '#ffaa00', jutsu: 'Kamui', special: 'WOOD STYLE', spriteUrl: '' },
    { id: 'madara', name: 'MADARA', title: 'Uchiha Ghost', color: '#0054ff', jutsu: 'Gunbai', special: 'METEOR', spriteUrl: '' }
  ];

  // --- 3D ENGINE STATE ---
  private animationFrameId: number = 0;
  private lastTime: number = 0;
  private gameSpeed = 0.5; // Initial slow start
  distance = signal<number>(0);
  chakra = signal<number>(0);
  isSpecialActive = signal<boolean>(false);
  
  private currentLane = 1; // 0: Left, 1: Center, 2: Right
  private laneX = [-200, 0, 200]; // Lane offsets from center
  private player = { x: 0, y: 0, vy: 0, gravity: 2500, jumpPower: -1000, isJumping: false, tilt: 0 };
  
  private obstacles: any[] = [];
  private collectibles: any[] = [];
  private spawnTimer = 0;

  private playerImg = new Image();
  private bossImg = new Image();

  ngOnInit() { this.generatePixelSprites(); }
  ngOnDestroy() { cancelAnimationFrame(this.animationFrameId); }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    if (this.gameState() !== 'PLAYING') return;
    if (e.key === 'ArrowLeft' && this.currentLane > 0) { this.currentLane--; this.player.tilt = -15; }
    if (e.key === 'ArrowRight' && this.currentLane < 2) { this.currentLane++; this.player.tilt = 15; }
    if ((e.key === ' ' || e.key === 'ArrowUp') && !this.player.isJumping) {
      this.player.vy = this.player.jumpPower;
      this.player.isJumping = true;
    }
    if ((e.key === 'Shift' || e.key.toLowerCase() === 'e') && this.chakra() >= 100) this.activateSpecial();
    e.preventDefault();
  }

  private activateSpecial() {
    this.chakra.set(0);
    this.isSpecialActive.set(true);
    const prevSpeed = this.gameSpeed;
    this.gameSpeed *= 2.5;
    setTimeout(() => { this.isSpecialActive.set(false); this.gameSpeed = prevSpeed; }, 3000);
  }

  startGame() {
    if (this.selectedHero() && this.selectedBoss()) {
      this.gameState.set('LOADING');
      setTimeout(() => {
        this.gameState.set('PLAYING');
        setTimeout(() => this.initEngine(), 0); 
      }, 1500);
    }
  }

  private initEngine() {
    this.ctx = this.canvasRef!.nativeElement.getContext('2d')!;
    this.distance.set(0); this.chakra.set(0); this.gameSpeed = 0.5;
    this.obstacles = []; this.collectibles = []; this.currentLane = 1;
    this.player.x = 0; this.player.y = 0; this.player.tilt = 0;
    if (this.selectedHero()) this.playerImg.src = this.selectedHero()!.spriteUrl;
    if (this.selectedBoss()) this.bossImg.src = this.selectedBoss()!.spriteUrl;
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
    this.distance.update(d => d + (this.gameSpeed * dt * 20));
    if (!this.isSpecialActive()) this.gameSpeed += 0.05 * dt; // Acceleration

    // Smooth lane shift
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
      const lane = Math.floor(Math.random() * 3);
      if (isScroll) this.collectibles.push({ lane, z: 1000 });
      else this.obstacles.push({ lane, z: 1000, type: Math.random() > 0.8 ? 'WALL' : 'SPIKE' });
      this.spawnTimer = Math.max(0.2, 0.8 - (this.gameSpeed * 0.05));
    }

    // Process Objects (Z moves from 1000 to 0)
    const process = (arr: any[], isHazard: boolean) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].z -= this.gameSpeed * dt * 500;
        // Collision at Z < 50
        if (arr[i].z < 50 && arr[i].z > -50) {
          if (arr[i].lane === this.currentLane && !this.isSpecialActive()) {
            if (isHazard && (arr[i].type === 'WALL' || !this.player.isJumping)) { this.gameOver(); return; }
            if (!isHazard) { this.chakra.update(c => Math.min(100, c + 20)); arr.splice(i, 1); }
          }
        }
        if (arr[i].z < -100) arr.splice(i, 1);
      }
    };
    process(this.obstacles, true);
    process(this.collectibles, false);
  }

  private draw() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, 800, 400);

    const centerX = 400;
    const horizonY = 150;

    // Road Perspective
    this.ctx.fillStyle = '#111';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 20, horizonY);
    this.ctx.lineTo(centerX + 20, horizonY);
    this.ctx.lineTo(centerX + 600, 400);
    this.ctx.lineTo(centerX - 600, 400);
    this.ctx.fill();

    // Render Entities (Depth Sorting)
    [...this.collectibles, ...this.obstacles].sort((a, b) => b.z - a.z).forEach(ent => {
      const perspective = 300 / (ent.z + 300);
      const x = centerX + (this.laneX[ent.lane] * perspective);
      const y = horizonY + (250 * perspective);
      const size = 100 * perspective;

      this.ctx.shadowBlur = 20 * perspective;
      this.ctx.shadowColor = ent.type ? (this.selectedBoss()?.color || '#f00') : '#ffd700';
      if (ent.type) {
        this.ctx.drawImage(this.bossImg, x - size/2, y - size, size, size);
      } else {
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillRect(x - size/4, y - size/4, size/2, size/2);
      }
    });

    // Player
    const pSize = 80;
    this.ctx.save();
    this.ctx.translate(centerX + this.player.x, 350 + this.player.y);
    this.ctx.rotate(this.player.tilt * Math.PI / 180);
    this.ctx.shadowBlur = this.isSpecialActive() ? 40 : 20;
    this.ctx.shadowColor = this.selectedHero()?.color || '#fff';
    this.ctx.drawImage(this.playerImg, -pSize/2, -pSize, pSize, pSize);
    this.ctx.restore();
  }

  private gameOver() { this.gameState.set('GAMEOVER'); cancelAnimationFrame(this.animationFrameId); }

  private generatePixelSprites() {
    const pal = { 'Y': '#ffe600', 'S': '#fcc', 'B': '#00f', 'O': '#f70', 'K': '#111', 'R': '#f03', 'G': '#999' };
    const n = ['..YYYY..', '.YYYYYY.', '.YSSSSY.', '.BBBBBB.', '..SSSS..', '.OOOOOO.', '.OOOOOO.', '.OOOOOO.', '..OOOO..', '..OOOO..', '..OOOO..', '.KK..KK.'];
    const s = ['..KKKK..', '.KKKKKK.', '.KSSSSK.', '..SSSS..', '..GGGG..', '.GGGGGG.', '.GGGGGG.', '.KKKKKK.', '..KKKK..', '..KKKK..', '..KKKK..', '.KK..KK.'];
    const b = ['..KKKK..', '.KKKKKK.', '.KSSSSK.', '..SSSS..', '..KKKK..', '.KKKKKK.', '.KKRRKK.', '.KKKKKK.', '.KKRRKK.', '.KKKKKK.', '.KKKKKK.', '.KK..KK.'];
    this.heroes[0].spriteUrl = this.buildSprite(n, pal);
    this.heroes[1].spriteUrl = this.buildSprite(s, pal);
    this.bosses.forEach(boss => boss.spriteUrl = this.buildSprite(b, pal));
  }

  private buildSprite(l: string[], p: any): string {
    const c = document.createElement('canvas'); c.width = 40; c.height = 60;
    const x = c.getContext('2d')!;
    l.forEach((row, i) => row.split('').forEach((char, j) => { if(char !== '.') { x.fillStyle = p[char]; x.fillRect(j*5, i*5, 5, 5); }}));
    return c.toDataURL();
  }

  selectHero(h: any) { this.selectedHero.set(h); }
  confirmHero() { if (this.selectedHero()) this.gameState.set('SELECT_BOSS'); }
  selectBoss(b: any) { this.selectedBoss.set(b); }
  goBack() { this.selectedBoss.set(null); this.gameState.set('SELECT_HERO'); }
}