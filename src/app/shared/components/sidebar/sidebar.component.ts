import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DiskService } from '../../../core/services/disk.service';
import { DatePipe } from '@angular/common';
import { getVersion } from '@tauri-apps/api/app';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DatePipe],
  template: `
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-icon">◈</span>
        <span class="logo-text">DISK<br><strong>ANALYZER</strong></span>
      </div>

      <nav class="nav">
        <a class="nav-item" routerLink="/dashboard" routerLinkActive="active">
          <span class="nav-icon">⬡</span>
          <span>Dashboard</span>
        </a>
        <a class="nav-item" routerLink="/scanner" routerLinkActive="active">
          <span class="nav-icon">◎</span>
          <span>Scanner</span>
        </a>
        <a class="nav-item" routerLink="/settings" routerLinkActive="active">
          <span class="nav-icon">⚙</span>
          <span>Settings</span>
        </a>
      </nav>

      @if (disk.scanResult()) {
        <div class="scan-info">
          <div class="scan-info-label">Last scan</div>
          <div class="scan-info-path truncate">{{ disk.currentPath() }}</div>
          <div class="scan-info-time">{{ disk.scanResult()!.scannedAt | date:'HH:mm:ss' }}</div>
        </div>
      }

      <div class="sidebar-footer">
        <span class="version">v{{ appVersion() }}</span>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 200px;
      min-width: 200px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 20px 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .logo-icon {
      font-size: 24px;
      color: var(--accent);
      line-height: 1;
    }
    .logo-text {
      font-family: var(--font-display);
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.3;
      strong { color: var(--text-primary); font-size: 13px; }
    }
    .nav {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 8px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      transition: all var(--transition);
      cursor: pointer;
      &:hover { background: var(--bg-hover); color: var(--text-primary); }
      &.active {
        background: var(--accent-dim);
        color: var(--accent);
        border: 1px solid var(--accent-border);
      }
    }
    .nav-icon { font-size: 14px; opacity: 0.8; }
    .scan-info {
      margin: 16px 8px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .scan-info-label { font-size: 10px; color: var(--accent); margin-bottom: 4px; letter-spacing: 0.08em; text-transform: uppercase; }
    .scan-info-path { font-size: 11px; color: var(--text-primary); max-width: 160px; }
    .scan-info-time { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
    .sidebar-footer {
      padding: 16px 20px 0;
      border-top: 1px solid var(--border);
    }
    .version { font-size: 10px; color: var(--text-muted); }
  `]
})
export class SidebarComponent {
  appVersion = signal('...');

  constructor(public disk: DiskService) {
    getVersion().then(v => this.appVersion.set(v));
  }
}
