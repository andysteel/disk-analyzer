import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiskService } from '../../core/services/disk.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="settings">
      <header class="header">
        <h1 class="title">Settings</h1>
        <p class="subtitle">Customize analyzer behavior</p>
      </header>

      <div class="settings-card">
        <div class="section-title">Scan Options</div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Default max depth</div>
            <div class="setting-desc">How many directory levels deep to scan</div>
          </div>
          <select class="select" [(ngModel)]="defaultDepth">
            <option [value]="3">3 levels</option>
            <option [value]="5">5 levels (recommended)</option>
            <option [value]="8">8 levels</option>
            <option [value]="99">Unlimited</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Skip hidden files</div>
            <div class="setting-desc">Exclude dot-files and hidden directories</div>
          </div>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="skipHidden" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Data</div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">Clear scan data</div>
            <div class="setting-desc">Remove cached scan results</div>
          </div>
          <button class="btn-danger" (click)="clearData()">Clear</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      background: var(--bg-primary);
    }
    .title { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .settings-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      max-width: 640px;
    }
    .section-title {
      padding: 14px 20px;
      font-family: var(--font-display);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid var(--border);
    }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 20px;
      border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .setting-name { font-size: 13px; color: var(--text-primary); }
    .setting-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .select {
      appearance: none;
      -webkit-appearance: none;
      background: var(--bg-primary)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2300d9a6'/%3E%3C/svg%3E")
        no-repeat right 10px center;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 6px 30px 6px 10px;
      cursor: pointer;
      outline: none;
      transition: border-color var(--transition), box-shadow var(--transition);
      &:hover { border-color: var(--border-light); }
      &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
      option { background: var(--bg-secondary); color: var(--text-primary); }
    }
    .toggle { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute; inset: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 11px;
      transition: all var(--transition);
      &::before {
        content: '';
        position: absolute;
        width: 16px; height: 16px;
        left: 2px; top: 2px;
        background: var(--text-muted);
        border-radius: 50%;
        transition: all var(--transition);
      }
    }
    .toggle input:checked + .toggle-slider {
      background: var(--accent-dim);
      border-color: var(--accent);
      &::before { transform: translateX(18px); background: var(--accent); }
    }
    .btn-danger {
      padding: 7px 14px; background: none;
      border: 1px solid var(--danger); border-radius: var(--radius-sm);
      color: var(--danger); font-family: var(--font-mono);
      font-size: 12px; cursor: pointer; transition: all var(--transition);
      &:hover { background: var(--danger); color: #fff; }
    }
  `]
})
export class SettingsComponent {
  defaultDepth = 5;
  skipHidden = true;

  constructor(public disk: DiskService) {}

  clearData(): void {
    this.disk.reset();
  }
}
