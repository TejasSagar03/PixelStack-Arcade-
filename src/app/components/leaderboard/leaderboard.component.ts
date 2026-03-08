import { Component, OnInit, inject, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service'; // Adjust path if needed

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.scss']
})
export class LeaderboardComponent implements OnInit {
  // This allows us to reuse this leaderboard for ANY game!
  @Input() gameType: string = '2048'; 
  
  private apiService = inject(ApiService);
  
  leaderboardData = signal<any[]>([]);
  isLoading = signal<boolean>(true);

  async ngOnInit() {
    await this.fetchScores();
  }

  async fetchScores() {
    this.isLoading.set(true);
    try {
      // Calls your NestJS backend: GET /games/leaderboard?game=2048
      const data = await this.apiService.getLeaderboard(this.gameType);
      this.leaderboardData.set(data as any[]);
    } catch (error) {
      console.error('Failed to load leaderboard', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}