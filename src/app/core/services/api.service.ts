import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment'; 

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl; 

  // 1. Initialize from localStorage so user survives page refreshes!
  currentUser = signal<any>(this.getStoredUser());

  private getStoredUser() {
    const stored = localStorage.getItem('pixelstack_user');
    return stored ? JSON.parse(stored) : null;
  }

  async signup(userData: any) {
    return await firstValueFrom(
      this.http.post(`${this.baseUrl}/auth/signup`, userData)
    );
  }

  async login(identifier: string, password: any) {
    const response: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/auth/login`, { identifier, password })
    );
    
    // 2. Save the user locally so they stay logged in
    this.currentUser.set(response);
    localStorage.setItem('pixelstack_user', JSON.stringify(response));

    return response;
  }

  logout() {
    this.currentUser.set(null);
    localStorage.removeItem('pixelstack_user');
  }

  // --- GAME METHODS ---

  async submitScore(gameType: string, value: number) {
    const user = this.currentUser();

    // 3. Safeguard: Prevent database crashes by blocking 'anonymous'
    if (!user) {
      console.warn('Driver not logged in. Score will not be saved.');
      return; 
    }

    const payload = {
      userId: user.id, // Sends the actual database UUID
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