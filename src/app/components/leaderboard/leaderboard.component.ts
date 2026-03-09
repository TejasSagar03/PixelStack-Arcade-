import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.scss']
})
export class LeaderboardComponent implements OnInit {
  @Input() gameType!: string; 
  private apiService = inject(ApiService);

  scores = signal<any[]>([]);
  isLoading = signal<boolean>(true);

  async ngOnInit() {
    await this.fetchLeaderboard();
  }

  async fetchLeaderboard() {
    this.isLoading.set(true);
    try {
      const data: any = await this.apiService.getLeaderboard(this.gameType);
      this.scores.set(data);
    } catch (error) {
      console.error('Failed to load leaderboard', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}