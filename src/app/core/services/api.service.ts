import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:3000'; 

  currentUser = signal<any>(null);

  // --- NEW AUTH METHODS ---

  async signup(userData: any) {
    const response = await firstValueFrom(
      this.http.post(`${this.baseUrl}/auth/signup`, userData)
    );
    return response;
  }

  async login(identifier: string, password: any) {
    const response: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/auth/login`, { identifier, password })
    );
    
    this.currentUser.set(response);
    return response;
  }

  // --- EXISTING GAME METHODS ---

  async submitScore(gameType: string, value: number) {
    const user = this.currentUser();
    const payload = {
      userId: user ? user.id : 'anonymous', 
      gameType: gameType,
      value: value
    };

    try {
      const response = await firstValueFrom(this.http.post(`${this.baseUrl}/games/score`, payload));
      console.log('Score saved successfully!', response);
      return response;
    } catch (error) {
      console.error('Failed to save score', error);
      throw error;
    }
  }

  async getLeaderboard(gameType: string) {
    return firstValueFrom(this.http.get(`${this.baseUrl}/games/leaderboard?game=${gameType}`));
  }
}