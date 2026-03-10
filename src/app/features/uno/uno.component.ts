import { Component, signal, computed, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

type Color = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
type Value = '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'Skip'|'Reverse'|'+2'|'Wild'|'+4'|'PlayAll';
type GameMode = '1v1_AI' | 'Local_PassPlay' | '1v1_Wild';

interface Card {
  id: string; color: Color; value: Value; isSpecial: boolean;
}

interface Player {
  id: number; name: string; isAI: boolean; team: number; hand: Card[];
}

@Component({
  selector: 'app-uno',
  standalone: true,
  imports: [RouterLink, DragDropModule],
  templateUrl: './uno.component.html',
  styleUrls: ['./uno.component.scss']
})
export class UnoComponent {
  mode = signal<GameMode | null>(null);
  players = signal<Player[]>([]);
  deck = signal<Card[]>([]);
  discardPile = signal<Card[]>([]);
  turnIndex = signal<number>(0);
  playDirection = signal<1 | -1>(1); 
  activeColor = signal<Color>('red');
  winner = signal<string | null>(null);
  awaitingColorChoice = signal<boolean>(false);
  specialAnimation = signal<string | null>(null); 
  unoCalled = signal<boolean>(false); 
  penaltyMessage = signal<string | null>(null); 
  
  isAnimating = signal<boolean>(false);
  hoveredCard = signal<Card | null>(null);

  isSettingUp = signal<boolean>(false);
  playerSetupList = signal<{ name: string }[]>([]);
  passScreenActive = signal<boolean>(false);
  passCountdown = signal<number>(20);
  private passInterval: any;

  // 💥 NEW: Configuration for Long Press behavior 💥
  // Set this to 150-250ms in the HTML via [cdkDragStartDelay] to enable the "follow path" feel on mobile
  dragDelay = signal<number>(200);

  // Compute if the CURRENT player can call UNO
  canCallUno = computed(() => {
    const currentPlayers = this.players();
    const currentIdx = this.turnIndex();
    if (currentPlayers.length === 0 || !currentPlayers[currentIdx]) return false; 
    
    const activeHand = currentPlayers[currentIdx].hand;
    return activeHand.length > 0 && activeHand.length <= 2 && !this.unoCalled();
  });

  private audioCtx: AudioContext | null = null;

  getSymbol(value: Value): string {
    switch(value) {
      case 'Skip': return 'Ø';
      case 'Reverse': return '⇄';
      case 'Wild': return '❖';
      case '+2': return '+2';
      case '+4': return '+4';
      case 'PlayAll': return 'ALL'; 
      default: return value;
    }
  }

  isComboGlow(card: Card): boolean {
    const hovered = this.hoveredCard();
    if (!hovered || hovered.value !== 'PlayAll') return false;
    return card.color === hovered.color && card.id !== hovered.id;
  }

  startGame(selectedMode: GameMode) {
    if (selectedMode === 'Local_PassPlay') {
      this.isSettingUp.set(true);
      this.mode.set(selectedMode);
      this.playerSetupList.set([{ name: 'Player 1' }, { name: 'Player 2' }]);
    } else {
      this.mode.set(selectedMode);
      this.initGameSession();
    }
  }

  addPlayer() {
    if (this.playerSetupList().length < 4) {
      this.playerSetupList.update(list => [...list, { name: `Player ${list.length + 1}` }]);
      this.playSound('draw');
    }
  }

  removePlayer(index: number) {
    if (this.playerSetupList().length > 2) {
      this.playerSetupList.update(list => list.filter((_, i) => i !== index));
      this.playSound('play');
    }
  }

  updatePlayerName(index: number, event: any) {
    const newName = event.target.value;
    this.playerSetupList.update(list => {
      const newList = [...list];
      newList[index] = { ...newList[index], name: newName };
      return newList;
    });
  }

  confirmLocalSetup() {
    this.isSettingUp.set(false);
    this.initGameSession();
  }

  private initGameSession() {
    this.deck.set(this.shuffle(this.generateDeck()));
    this.setupPlayers(this.mode()!);
    this.dealCards();
    
    let firstCard = this.drawCard();
    while (firstCard.color === 'wild' || firstCard.value === 'PlayAll') {
      this.deck.update(d => [firstCard, ...d]); 
      firstCard = this.drawCard();
    }
    
    this.discardPile.set([firstCard]);
    this.activeColor.set(firstCard.color);
    this.turnIndex.set(0);
    this.winner.set(null);
    this.unoCalled.set(false);
    this.penaltyMessage.set(null);
    this.isAnimating.set(false);
    this.passScreenActive.set(false);
    this.checkAITurn();
  }

  /**
   * 💥 REFINED DRAG AND DROP: FOLLOW THE PATH 💥
   * Handles reordering and playing cards via long-press initiated drag.
   */
  drop(event: CdkDragDrop<Card[]>) {
    // Block drops if game state is suspended or if it's not the active player's turn
    if (this.winner() || this.isAnimating() || this.passScreenActive()) return;

    const currentTurn = this.turnIndex();
    const pIdx = this.mode() === 'Local_PassPlay' ? currentTurn : 0;

    // Handle reordering within hand (Follow path inside the hand)
    if (event.previousContainer === event.container) {
      this.players.update(ps => {
        const playerToUpdate = ps[pIdx];
        const updatedHand = [...playerToUpdate.hand];
        moveItemInArray(updatedHand, event.previousIndex, event.currentIndex);
        
        // Return a fresh array with the updated player to ensure DOM stability
        return ps.map((p, i) => i === pIdx ? { ...p, hand: updatedHand } : p);
      });
    } 
    // Handle playing card (Follow path to the discard pile)
    else {
      const card = event.item.data as Card;
      if (this.isValidPlay(card)) {
        this.playCard(currentTurn, card);
      } else {
        // Haptic feedback for "blocking" an invalid path
        this.triggerHaptic([50, 50]);
      }
    }
  }

  callUno() {
    this.unoCalled.set(true);
    this.playSound('special');
    this.triggerHaptic([100, 50, 100]);
  }

  private triggerHaptic(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  private generateDeck(): Card[] {
    const cards: Card[] = [];
    const colors: Color[] = ['red', 'blue', 'green', 'yellow'];
    let idCounter = 0;
    
    colors.forEach(color => {
      cards.push({ id: `c${idCounter++}`, color, value: '0', isSpecial: false });
      ['1','2','3','4','5','6','7','8','9','Skip','Reverse','+2'].forEach(val => {
        const isSpecial = val === 'Skip' || val === 'Reverse' || val === '+2';
        cards.push({ id: `c${idCounter++}`, color, value: val as Value, isSpecial });
        cards.push({ id: `c${idCounter++}`, color, value: val as Value, isSpecial });
      });

      if (this.mode() === '1v1_Wild') {
        cards.push({ id: `w_pa_${idCounter++}`, color, value: 'PlayAll', isSpecial: true });
        cards.push({ id: `w_pa_${idCounter++}`, color, value: 'PlayAll', isSpecial: true });
      }
    });

    for (let i = 0; i < 4; i++) {
      cards.push({ id: `w${idCounter++}`, color: 'wild', value: 'Wild', isSpecial: true });
      cards.push({ id: `w${idCounter++}`, color: 'wild', value: '+4', isSpecial: true });
    }
    return cards;
  }

  private shuffle(array: Card[]): Card[] {
    return array.sort(() => Math.random() - 0.5);
  }

  private setupPlayers(mode: GameMode) {
    if (mode === '1v1_AI' || mode === '1v1_Wild') {
      this.players.set([
        { id: 0, name: 'You', isAI: false, team: 1, hand: [] },
        { id: 1, name: 'AI Bot', isAI: true, team: 2, hand: [] }
      ]);
    } else if (mode === 'Local_PassPlay') {
      const localPlayers: Player[] = this.playerSetupList().map((p, i) => ({
        id: i,
        name: p.name,
        isAI: false,
        team: i + 1,
        hand: []
      }));
      this.players.set(localPlayers);
    }
  }

  private dealCards() {
    for (let i = 0; i < 7; i++) {
      this.players.update(ps => ps.map(p => ({
        ...p,
        hand: [...p.hand, this.drawCard()]
      })));
    }
  }

  private drawCard(): Card {
    const currentDeck = this.deck();
    if (currentDeck.length === 0) {
      const pile = [...this.discardPile()]; 
      const topCard = pile.pop()!;
      this.deck.set(this.shuffle(pile));
      this.discardPile.set([topCard]);
    }
    const card = this.deck()[this.deck().length - 1];
    this.deck.update(d => d.slice(0, -1));
    return card;
  }

  isValidPlay(card: Card): boolean {
    const topCard = this.discardPile()[this.discardPile().length - 1];
    return card.color === 'wild' || card.color === this.activeColor() || card.value === topCard.value;
  }

  playCard(playerIndex: number, card: Card) {
    if (playerIndex !== this.turnIndex() || this.awaitingColorChoice() || this.winner() || this.isAnimating()) return;
    if (!this.isValidPlay(card)) return;

    if (card.value === 'PlayAll') {
      const colorToPlay = card.color;
      let extraCards: Card[] = [];
      
      this.players.update(ps => {
        const player = ps[playerIndex];
        extraCards = player.hand.filter(c => c.color === colorToPlay && c.id !== card.id);
        const remainingHand = player.hand.filter(c => c.color !== colorToPlay);
        return ps.map((p, i) => i === playerIndex ? { ...p, hand: remainingHand } : p);
      });
      
      this.discardPile.update(dp => [...dp, card]);
      this.playSound('play');
      this.triggerHaptic(15);
      this.hoveredCard.set(null); 

      if (extraCards.length > 0) {
        this.isAnimating.set(true); 
        extraCards.forEach((c, idx) => {
          setTimeout(() => {
            this.discardPile.update(dp => [...dp, c]);
            this.playSound('play');
            this.triggerHaptic(10);
            if (idx === extraCards.length - 1) {
              setTimeout(() => {
                this.isAnimating.set(false);
                this.postPlayChecks(playerIndex, card);
              }, 300); 
            }
          }, (idx + 1) * 150); 
        });
      } else {
        this.postPlayChecks(playerIndex, card);
      }
    } 
    else {
      this.players.update(ps => {
        const remainingHand = ps[playerIndex].hand.filter(c => c.id !== card.id);
        return ps.map((p, i) => i === playerIndex ? { ...p, hand: remainingHand } : p);
      });
      this.discardPile.update(dp => [...dp, card]);
      this.playSound('play');
      this.triggerHaptic(15);
      this.postPlayChecks(playerIndex, card);
    }
  }

  private postPlayChecks(playerIndex: number, card: Card) {
    if (card.isSpecial && card.value !== 'PlayAll') {
      this.playSound('special');
      this.specialAnimation.set(card.value);
      setTimeout(() => this.specialAnimation.set(null), 1000);
    }

    const remainingCards = this.players()[playerIndex].hand.length;

    if (remainingCards === 1) {
      if (this.players()[playerIndex].isAI) {
        this.unoCalled.set(true);
      } else if (!this.unoCalled()) {
        this.triggerHaptic([200, 100, 200]);
        this.penaltyMessage.set("FORGOT TO CALL UNO! +2 CARDS");
        this.forceDraw(playerIndex, 2);
        setTimeout(() => this.penaltyMessage.set(null), 3000);
      }
    } else if (remainingCards > 1 && !this.players()[playerIndex].isAI) {
      this.unoCalled.set(false); 
    }

    if (this.checkWin(playerIndex)) return;

    if (card.color === 'wild') {
      if (this.players()[playerIndex].isAI) {
        this.activeColor.set(['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as Color);
        this.applyEffectsAndNextTurn(card.value);
      } else {
        this.awaitingColorChoice.set(true); 
      }
    } else {
      this.activeColor.set(card.color);
      this.applyEffectsAndNextTurn(card.value);
    }
  }

  selectColor(color: string) {
    this.activeColor.set(color as Color);
    this.awaitingColorChoice.set(false);
    const topCard = this.discardPile()[this.discardPile().length - 1];
    this.applyEffectsAndNextTurn(topCard.value);
  }

  drawFromDeck(playerIndex: number) {
    if (playerIndex !== this.turnIndex() || this.awaitingColorChoice() || this.winner() || this.isAnimating() || this.passScreenActive()) return;
    this.playSound('draw');
    this.triggerHaptic(20);
    this.players.update(ps => ps.map((p, i) => 
      i === playerIndex ? { ...p, hand: [...p.hand, this.drawCard()] } : p
    ));
    this.unoCalled.set(false); 
    this.nextTurn();
  }

  private applyEffectsAndNextTurn(value: Value) {
    let skipSteps = 1;
    let nextIdx = this.getNextPlayerIndex(1);
    
    if (value === 'Reverse') {
      this.playDirection.update(d => (d * -1) as 1 | -1);
      if (this.players().length === 2) skipSteps = 2; 
    } else if (value === 'Skip' || value === 'PlayAll') { 
      skipSteps = 2; 
    } 
    else if (value === '+2') { this.forceDraw(nextIdx, 2); skipSteps = 2; } 
    else if (value === '+4') { this.forceDraw(nextIdx, 4); skipSteps = 2; }
    
    this.nextTurn(skipSteps);
  }

  private forceDraw(playerIdx: number, count: number) {
    this.players.update(ps => ps.map((p, i) => {
      if (i === playerIdx) {
        const newCards = [];
        for (let j = 0; j < count; j++) newCards.push(this.drawCard());
        return { ...p, hand: [...p.hand, ...newCards] };
      }
      return p;
    }));
  }

  private nextTurn(steps = 1) {
    const nextIdx = this.getNextPlayerIndex(steps);
    this.turnIndex.set(nextIdx);

    if (this.mode() === 'Local_PassPlay' && !this.winner()) {
      this.triggerPassScreen();
    } else {
      this.checkAITurn();
    }
  }

  private triggerPassScreen() {
    this.passScreenActive.set(true);
    this.passCountdown.set(20);
    this.playSound('special');
    
    if (this.passInterval) clearInterval(this.passInterval);
    
    this.passInterval = setInterval(() => {
      this.passCountdown.update(v => v - 1);
      if (this.passCountdown() <= 0) {
        this.resumeGame();
      }
    }, 1000);
  }

  resumeGame() {
    if (this.passInterval) clearInterval(this.passInterval);
    this.passScreenActive.set(false);
    this.unoCalled.set(false); 
  }

  private getNextPlayerIndex(steps = 1): number {
    const len = this.players().length;
    let next = (this.turnIndex() + (this.playDirection() * steps)) % len;
    if (next < 0) next += len;
    return next;
  }

  private checkWin(playerIndex: number): boolean {
    if (this.players()[playerIndex].hand.length === 0) {
      this.winner.set(`${this.players()[playerIndex].name} Wins!`);
      return true;
    }
    return false;
  }

  private checkAITurn() {
    const currentPlayer = this.players()[this.turnIndex()];
    if (!currentPlayer || !currentPlayer.isAI || this.winner() || this.isAnimating()) return;
    
    setTimeout(() => {
      const validCards = currentPlayer.hand.filter(c => this.isValidPlay(c));
      if (validCards.length > 0) {
        const cardToPlay = validCards.sort((a, b) => (b.isSpecial ? 1 : 0) - (a.isSpecial ? 1 : 0))[0];
        this.playCard(this.turnIndex(), cardToPlay);
      } else {
        this.drawFromDeck(this.turnIndex());
      }
    }, 1200); 
  }

  private playSound(type: 'draw' | 'play' | 'special') {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    if (type === 'draw') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start();
      osc.stop(now + 0.1);
    } else if (type === 'play') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.start();
      osc.stop(now + 0.1);
    } else if (type === 'special') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start();
      osc.stop(now + 0.3);
    }
  }
}