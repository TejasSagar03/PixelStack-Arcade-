import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UnoSocketService {
  private socket: Socket;

  // RxJS Subjects: Think of these as loudspeakers. 
  // When the server tells us something, these broadcast the news to your components.
  public playerJoined$ = new Subject<{ userId: string }>();
  public gameStarted$ = new Subject<{ topCard: any, currentTurn: string, status: string }>();
  public turnAdvanced$ = new Subject<{ currentTurn: string }>();
  public gameError$ = new Subject<{ message: string }>();

  constructor() {
    // Connect to your NestJS backend. 
    // Make sure this port matches where your NestJS server is actually running!
    this.socket = io('http://localhost:3000', {
      withCredentials: true,
    });

    this.setupListeners();
  }

  // --- 1. LISTEN TO THE BACKEND ---
  private setupListeners() {
    this.socket.on('connect', () => console.log('Connected to UNO Server!'));
    this.socket.on('disconnect', () => console.warn('Disconnected from server.'));

    this.socket.on('playerJoined', (data) => this.playerJoined$.next(data));
    this.socket.on('gameStarted', (data) => this.gameStarted$.next(data));
    this.socket.on('turnAdvanced', (data) => this.turnAdvanced$.next(data));
    this.socket.on('gameError', (data) => this.gameError$.next(data));
  }

  // --- 2. TALK TO THE BACKEND ---
  joinRoom(gameId: string, userId: string) {
    this.socket.emit('joinRoom', { gameId, userId });
  }

  startGame(gameId: string) {
    this.socket.emit('startGame', { gameId });
  }

  drawCard(gameId: string, userId: string) {
    this.socket.emit('drawCard', { gameId, userId });
  }

  // Best practice: cleanup when the user leaves the game page
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}