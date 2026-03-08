import { Component, signal, computed, effect } from '@angular/core';
import { RouterLink } from '@angular/router';

type Color = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
type Value = '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'Skip'|'Reverse'|'+2'|'Wild'|'+4';
type GameMode = '1v1_AI' | '2v2_AI' | 'Local_PassPlay';

interface Card {
  id: string; color: Color; value: Value; isSpecial: boolean;
}

interface Player {
  id: number; name: string; isAI: boolean; team: number; hand: Card[];
}

@Component({
  selector: 'app-uno',
  standalone: true,
  imports: [RouterLink],
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

  private audioCtx: AudioContext | null = null;

  // Helper for Special Symbols
  getSymbol(value: Value): string {
    switch(value) {
      case 'Skip': return 'Ø';
      case 'Reverse': return '⇄';
      case 'Wild': return '❖';
      case '+2': return '+2';
      case '+4': return '+4';
      default: return value;
    }
  }

  startGame(selectedMode: GameMode) {
    this.mode.set(selectedMode);
    this.deck.set(this.shuffle(this.generateDeck()));
    this.setupPlayers(selectedMode);
    this.dealCards();
    let firstCard = this.drawCard();
    while (firstCard.color === 'wild') {
      this.deck.update(d => [firstCard, ...d]); 
      firstCard = this.drawCard();
    }
    this.discardPile.set([firstCard]);
    this.activeColor.set(firstCard.color);
    this.turnIndex.set(0);
    this.winner.set(null);
    this.checkAITurn();
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
    if (mode === '1v1_AI') {
      this.players.set([
        { id: 0, name: 'You', isAI: false, team: 1, hand: [] },
        { id: 1, name: 'AI Opponent', isAI: true, team: 2, hand: [] }
      ]);
    } else if (mode === '2v2_AI') {
      this.players.set([
        { id: 0, name: 'You (Team 1)', isAI: false, team: 1, hand: [] },
        { id: 1, name: 'AI Bot 1 (Team 2)', isAI: true, team: 2, hand: [] },
        { id: 2, name: 'AI Partner (Team 1)', isAI: true, team: 1, hand: [] },
        { id: 3, name: 'AI Bot 2 (Team 2)', isAI: true, team: 2, hand: [] }
      ]);
    } else {
      this.players.set([
        { id: 0, name: 'Player 1', isAI: false, team: 1, hand: [] },
        { id: 1, name: 'Player 2', isAI: false, team: 2, hand: [] }
      ]);
    }
  }

  private dealCards() {
    for (let i = 0; i < 7; i++) {
      this.players.update(ps => {
        const updatedPlayers = [...ps];
        updatedPlayers.forEach(p => p.hand.push(this.drawCard()));
        return updatedPlayers;
      });
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
    if (playerIndex !== this.turnIndex() || this.awaitingColorChoice() || this.winner()) return;
    if (!this.isValidPlay(card)) return;

    this.players.update(ps => {
      ps[playerIndex].hand = ps[playerIndex].hand.filter(c => c.id !== card.id);
      return [...ps];
    });

    this.discardPile.update(dp => [...dp, card]);
    
    if (card.isSpecial) {
      this.playSound('special');
      this.specialAnimation.set(card.value);
      setTimeout(() => this.specialAnimation.set(null), 1000);
    } else {
      this.playSound('play');
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
    if (playerIndex !== this.turnIndex() || this.awaitingColorChoice() || this.winner()) return;
    this.playSound('draw');
    this.players.update(ps => {
      ps[playerIndex].hand.push(this.drawCard());
      return [...ps];
    });
    this.nextTurn();
  }

  private applyEffectsAndNextTurn(value: Value) {
    let skipSteps = 1;
    let nextIdx = this.getNextPlayerIndex(1);
    if (value === 'Reverse') {
      this.playDirection.update(d => (d * -1) as 1 | -1);
      if (this.players().length === 2) skipSteps = 2; 
    } else if (value === 'Skip') { skipSteps = 2; } 
    else if (value === '+2') { this.forceDraw(nextIdx, 2); skipSteps = 2; } 
    else if (value === '+4') { this.forceDraw(nextIdx, 4); skipSteps = 2; }
    this.nextTurn(skipSteps);
  }

  private forceDraw(playerIdx: number, count: number) {
    this.players.update(ps => {
      for (let i = 0; i < count; i++) ps[playerIdx].hand.push(this.drawCard());
      return [...ps];
    });
  }

  private nextTurn(steps = 1) {
    this.turnIndex.set(this.getNextPlayerIndex(steps));
    this.checkAITurn();
  }

  private getNextPlayerIndex(steps = 1): number {
    const len = this.players().length;
    let next = (this.turnIndex() + (this.playDirection() * steps)) % len;
    if (next < 0) next += len;
    return next;
  }

  private checkWin(playerIndex: number): boolean {
    if (this.players()[playerIndex].hand.length === 0) {
      const team = this.players()[playerIndex].team;
      this.winner.set(this.mode() === '2v2_AI' ? `Team ${team} Wins!` : `${this.players()[playerIndex].name} Wins!`);
      return true;
    }
    return false;
  }

  private checkAITurn() {
    const currentPlayer = this.players()[this.turnIndex()];
    if (!currentPlayer.isAI || this.winner()) return;
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
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    if (type === 'draw') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(400, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.1);
    } else if (type === 'play') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(300, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.2);
    } else if (type === 'special') {
      osc.type = 'square'; osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.5);
    }
  }
}