import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-racing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './racing.component.html',
  styleUrls: ['./racing.component.scss']
})
export class RacingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  Math = Math;

  // Game State
  gameState = signal<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');
  score = signal<number>(0);
  isHit = signal<boolean>(false);
  
  // Nitrous State
  nitroLevel = signal<number>(100);
  isNitrousActive = signal<boolean>(false);

  // Engine Variables
  private animationFrameId: number = 0;
  private lastTime: number = 0;
  private baseSpeed = 300; 
  private difficultyMultiplier = 1;
  private globalTime = 0;
  
  // Input tracking
  private keys = { left: false, right: false, space: false, shift: false };

  // Game Entities
  private canvasW = 400;
  private canvasH = 600;
  private laneWidth = 400 / 3;

  private player = { x: 180, y: 500, width: 40, height: 70, color: '#00ffaa', speed: 450 };
  private enemies: any[] = [];
  private projectiles: any[] = [];
  private particles: any[] = [];
  private roadLines: any[] = [];
  
  private enemySpawnTimer = 0;
  private enemySpawnInterval = 1000;
  private fireCooldownTimer = 0;
  private fireRate = 0.2; // Seconds between shots

  // Audio Context
  private audioCtx: AudioContext | null = null;
  private isNitroSoundPlaying = false;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.initRoadLines();
    this.drawStartScreen();
  }

  ngOnDestroy() { 
    cancelAnimationFrame(this.animationFrameId); 
    if (this.audioCtx) this.audioCtx.close();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = true;
    if (e.key === ' ') { this.keys.space = true; e.preventDefault(); }
    if (e.key === 'Shift') { this.keys.shift = true; e.preventDefault(); }
    
    // Pause Controls
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      this.togglePause();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
    if (e.key === ' ') this.keys.space = false;
    if (e.key === 'Shift') { 
      this.keys.shift = false; 
      this.isNitroSoundPlaying = false; 
    }
  }

  setKey(key: string, value: boolean) {
    if (key === 'Left') this.keys.left = value;
    if (key === 'Right') this.keys.right = value;
    if (key === 'Space') this.keys.space = value;
    if (key === 'Shift') {
      this.keys.shift = value;
      if (!value) this.isNitroSoundPlaying = false;
    }
  }

  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  startGame() {
    this.initAudio();
    this.playSound('start');
    this.gameState.set('PLAYING');
    this.score.set(0);
    this.nitroLevel.set(100);
    this.difficultyMultiplier = 1;
    this.enemySpawnInterval = 1000;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.isHit.set(false);
    this.player.x = this.canvasW / 2 - this.player.width / 2;
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  togglePause() {
    if (this.gameState() === 'PLAYING') {
      this.gameState.set('PAUSED');
      this.playSound('pause');
      cancelAnimationFrame(this.animationFrameId);
    } else if (this.gameState() === 'PAUSED') {
      this.gameState.set('PLAYING');
      this.playSound('start');
      this.lastTime = performance.now(); // Reset time so physics don't jump
      this.gameLoop(this.lastTime);
    }
  }

  private gameOver() {
    this.gameState.set('GAMEOVER');
    this.isHit.set(true);
    this.isNitrousActive.set(false);
    this.playSound('crash');
    cancelAnimationFrame(this.animationFrameId);
  }

  private gameLoop(timestamp: number) {
    if (this.gameState() !== 'PLAYING') return;
    const dt = (timestamp - this.lastTime) / 1000; 
    this.lastTime = timestamp;
    this.globalTime += dt;

    this.update(dt);
    this.draw();

    this.animationFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  private update(dt: number) {
    let currentRoadSpeed = this.baseSpeed * this.difficultyMultiplier;
    
    // Nitrous Logic
    if (this.keys.shift && this.nitroLevel() > 0) {
      if (!this.isNitrousActive()) {
        this.playSound('nitro');
        this.isNitroSoundPlaying = true;
      }
      this.isNitrousActive.set(true);
      currentRoadSpeed *= 2.5; 
      this.nitroLevel.update(n => Math.max(0, n - 25 * dt)); 
      this.score.update(s => s + (50 * dt)); 
    } else {
      this.isNitrousActive.set(false);
      this.isNitroSoundPlaying = false;
      this.nitroLevel.update(n => Math.min(100, n + 5 * dt)); 
    }

    // Player Movement
    if (this.keys.left) this.player.x -= this.player.speed * dt;
    if (this.keys.right) this.player.x += this.player.speed * dt;
    if (this.player.x < 10) this.player.x = 10;
    if (this.player.x + this.player.width > this.canvasW - 10) this.player.x = this.canvasW - this.player.width - 10;

    // Weapons Firing
    this.fireCooldownTimer -= dt;
    if (this.keys.space && this.fireCooldownTimer <= 0) {
      this.playSound('fire');
      this.projectiles.push({
        x: this.player.x + (this.player.width / 2) - 3,
        y: this.player.y - 10,
        width: 6, height: 20, speed: 800
      });
      this.fireCooldownTimer = this.fireRate;
    }

    // Scroll Road
    for (let line of this.roadLines) {
      line.y += currentRoadSpeed * dt;
      if (line.y > this.canvasH) line.y = -line.height;
    }

    // Enemy Spawner
    this.enemySpawnTimer += dt * 1000;
    if (this.enemySpawnTimer > this.enemySpawnInterval) {
      this.spawnEnemy();
      this.enemySpawnTimer = 0;
    }

    // Projectile Physics
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      let p = this.projectiles[i];
      p.y -= p.speed * dt;
      if (p.y < -50) this.projectiles.splice(i, 1);
    }

    // Enemy Physics & Collisions
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      let enemy = this.enemies[i];
      enemy.y += (currentRoadSpeed * enemy.speedFactor) * dt;

      if (this.checkCollision(this.player, enemy)) {
        this.spawnExplosion(this.player.x + 20, this.player.y + 20, '#ff003c');
        this.gameOver();
        return;
      }

      let hit = false;
      for (let j = this.projectiles.length - 1; j >= 0; j--) {
        if (this.checkCollision(this.projectiles[j], enemy)) {
          this.projectiles.splice(j, 1);
          hit = true;
          break; 
        }
      }

      if (hit) {
        this.playSound('explosion');
        this.spawnExplosion(enemy.x + 20, enemy.y + 35, enemy.isCop ? '#0054ff' : '#ffaa00');
        this.score.update(s => s + (enemy.isCop ? 50 : 10));
        this.enemies.splice(i, 1);
        continue;
      }

      if (enemy.y > this.canvasH) {
        this.enemies.splice(i, 1);
        this.score.update(s => s + 5);
        if (this.score() % 100 < 5 && this.score() > 10) {
          this.difficultyMultiplier += 0.1;
          this.enemySpawnInterval = Math.max(300, this.enemySpawnInterval - 50);
        }
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  private checkCollision(rect1: any, rect2: any): boolean {
    const margin = 3; 
    return (
      rect1.x + margin < rect2.x + rect2.width - margin &&
      rect1.x + rect1.width - margin > rect2.x + margin &&
      rect1.y + margin < rect2.y + rect2.height - margin &&
      rect1.y + rect1.height - margin > rect2.y + margin
    );
  }

  private spawnEnemy() {
    const lane = Math.floor(Math.random() * 3);
    const w = 40;
    const xPos = (lane * this.laneWidth) + (this.laneWidth / 2) - (w / 2);
    const isCop = Math.random() > 0.8;
    
    this.enemies.push({
      x: xPos, y: -80, width: w, height: 70,
      color: isCop ? '#111' : ['#ff003c', '#ffe600', '#b400ff'][Math.floor(Math.random() * 3)],
      isCop: isCop,
      speedFactor: isCop ? 0.9 : 0.6 + Math.random() * 0.3
    });
  }

  private spawnExplosion(x: number, y: number, color: string) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 400,
        vy: (Math.random() - 0.5) * 400,
        life: 0.3 + Math.random() * 0.3,
        color: color
      });
    }
  }

  private initRoadLines() {
    for (let i = 0; i < 6; i++) {
      this.roadLines.push({ y: i * 120, height: 60 });
    }
  }

  private draw() {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.canvasW, this.canvasH);

    if (this.isNitrousActive()) {
      this.ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
      this.ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    }

    this.ctx.shadowBlur = this.isNitrousActive() ? 20 : 10;
    this.ctx.shadowColor = this.isNitrousActive() ? '#00f0ff' : '#00ffaa';
    this.ctx.strokeStyle = this.isNitrousActive() ? '#00f0ff' : '#00ffaa';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(5, 0); this.ctx.lineTo(5, this.canvasH);
    this.ctx.moveTo(this.canvasW - 5, 0); this.ctx.lineTo(this.canvasW - 5, this.canvasH);
    this.ctx.stroke();

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    if (this.isNitrousActive()) this.ctx.fillStyle = 'rgba(0, 240, 255, 0.5)'; 
    for (let line of this.roadLines) {
      let stretch = this.isNitrousActive() ? 40 : 0; 
      this.ctx.fillRect(this.laneWidth - 2, line.y, 4, line.height + stretch);
      this.ctx.fillRect((this.laneWidth * 2) - 2, line.y, 4, line.height + stretch);
    }

    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#00ffaa';
    this.ctx.fillStyle = '#fff';
    for (let p of this.projectiles) {
      this.ctx.fillRect(p.x, p.y, p.width, p.height);
    }
    this.ctx.shadowBlur = 0;

    for (let enemy of this.enemies) {
      this.drawCar(enemy.x, enemy.y, enemy.width, enemy.height, enemy.color, true, enemy.isCop);
    }

    for (let pt of this.particles) {
      this.ctx.fillStyle = pt.color;
      this.ctx.globalAlpha = pt.life * 2; 
      this.ctx.fillRect(pt.x, pt.y, 4, 4);
    }
    this.ctx.globalAlpha = 1.0;

    this.drawCar(this.player.x, this.player.y, this.player.width, this.player.height, this.player.color, false, false);
    
    if (this.isNitrousActive()) {
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.fillStyle = '#fff';
      const flicker = Math.random() * 15;
      this.ctx.fillRect(this.player.x + 8, this.player.y + this.player.height, 6, 15 + flicker);
      this.ctx.fillRect(this.player.x + this.player.width - 14, this.player.y + this.player.height, 6, 15 + flicker);
      this.ctx.shadowBlur = 0;
    }
  }

  private drawStartScreen() {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    this.ctx.strokeStyle = '#00ffaa';
    this.ctx.lineWidth = 2;
    for(let i=0; i<this.canvasW; i+= 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.canvasW/2, this.canvasH);
      this.ctx.lineTo(i, 0);
      this.ctx.stroke();
    }
  }

  private drawCar(x: number, y: number, w: number, h: number, color: string, isEnemy: boolean, isCop: boolean) {
    this.ctx.fillStyle = color;
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = isCop ? '#fff' : color;
    this.ctx.fillRect(x, y + 5, w, h - 10);
    this.ctx.shadowBlur = 0; 

    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(x + 5, y + 20, w - 10, h - 40);

    if (isCop) {
      const flash = Math.floor(this.globalTime * 8) % 2 === 0;
      this.ctx.fillStyle = flash ? '#ff0000' : '#111';
      this.ctx.fillRect(x + 5, y + 30, (w-10)/2, 6);
      this.ctx.fillStyle = !flash ? '#0054ff' : '#111';
      this.ctx.fillRect(x + 5 + (w-10)/2, y + 30, (w-10)/2, 6);
    }

    this.ctx.fillStyle = isEnemy ? '#fff' : '#ff0000';
    const lightY = isEnemy ? y : y + h - 5;
    this.ctx.fillRect(x + 2, lightY, 8, 5);
    this.ctx.fillRect(x + w - 10, lightY, 8, 5);
    
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(x - 2, y + 10, 4, 15);
    this.ctx.fillRect(x + w - 2, y + 10, 4, 15);
    this.ctx.fillRect(x - 2, y + h - 25, 4, 15);
    this.ctx.fillRect(x + w - 2, y + h - 25, 4, 15);
  }

  // --- RETRO AUDIO SYNTHESIZER ---
  private playSound(type: 'fire' | 'explosion' | 'crash' | 'nitro' | 'start' | 'pause') {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    switch (type) {
      case 'fire':
        // High pitched "pew"
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
        
      case 'explosion':
        // Low rumble "boom"
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'crash':
        // Harsher, longer crash noise
        osc.type = 'square';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(1, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'nitro':
        // Rising frequency "whoosh"
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.5);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'start':
        // Happy "Ready, Set, Go" blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'pause':
        // Descending blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(220, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
    }
  }
}