import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private document = inject(DOCUMENT);

  isLoginMode = signal(true);
  isLoading = signal(false); 
  showSuccessModal = signal(false); 
  
  authData = { name: '', email: '', username: '', password: '', identifier: '' };

  ngOnInit() {
    // Keep theme consistent when entering the Auth page
    const savedTheme = localStorage.getItem('pixelstack-theme');
    if (savedTheme === 'light') {
      this.document.body.classList.add('light-theme');
      this.document.body.classList.remove('dark-theme');
    }
  }

  toggleMode() { 
    this.isLoginMode.update(val => !val); 
  }

  async handleSubmit() {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    
    try {
      if (this.isLoginMode()) {
        const user = await this.apiService.login(this.authData.identifier, this.authData.password);
        console.log('Logged in!', user);
        this.router.navigate(['/']); 
      } else {
        const newUser = await this.apiService.signup(this.authData);
        console.log('Signed up!', newUser);
        this.showSuccessModal.set(true); 
      } 
    } catch (err: any) {
      console.error('FULL AUTH ERROR:', err); 
      const backendMessage = err.error?.message || err.message || 'Unknown error occurred';
      alert('Backend rejected the request: ' + backendMessage); 
    } finally {
      this.isLoading.set(false);
    }
  }

  // Notice how this sits completely on its own, OUTSIDE of handleSubmit!
  closeModalAndLogin() {
    this.showSuccessModal.set(false);
    this.isLoginMode.set(true);
  }
}