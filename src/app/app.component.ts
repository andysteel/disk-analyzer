import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <app-sidebar />
    <main class="main-content">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    .main-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class AppComponent {}
