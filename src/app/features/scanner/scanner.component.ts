import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DiskService } from '../../core/services/disk.service';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="scanner">
      <header class="header">
        <h1 class="title">Scanner</h1>
        <p class="subtitle">Select a directory to analyze disk usage</p>
      </header>

      <div class="scan-card">
        <!-- Path selector -->
        <div class="path-row">
          <div class="path-input-wrap">
            <span class="path-icon">◎</span>
            <input
              class="path-input"
              type="text"
              placeholder="Enter path or click Browse…"
              [(ngModel)]="manualPath"
              [disabled]="isScanning"
            />
          </div>
          <button class="btn-outline" (click)="browse()" [disabled]="isScanning">
            Browse
          </button>
        </div>

        <!-- Options -->
        <div class="options-row">
          <label class="option-label">
            Max depth
            <select class="select" [(ngModel)]="maxDepth" [disabled]="isScanning">
              <option [value]="3">3 levels</option>
              <option [value]="5">5 levels</option>
              <option [value]="8">8 levels</option>
              <option [value]="99">Unlimited</option>
            </select>
          </label>
        </div>

        <!-- Action -->
        @if (!isScanning) {
          <button
            class="btn-scan"
            (click)="startScan()"
            [disabled]="!manualPath"
          >
            <span>▶</span> Start Analysis
          </button>
        }

        <!-- Progress -->
        @if (isScanning) {
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">Scanning…</span>
              <button class="btn-ghost-danger" (click)="cancel()">Cancel</button>
            </div>
            <div class="progress-bar">
              <div class="progress-bar-fill"></div>
            </div>
            @if (disk.scanProgress()) {
              <p class="progress-path truncate">
                {{ disk.scanProgress()!.currentPath }}
              </p>
            }
          </div>
        }

        <!-- Error -->
        @if (disk.scanState() === 'error') {
          <div class="error-box">
            <span>⚠</span> {{ disk.errorMessage() }}
          </div>
        }

        <!-- Done -->
        @if (disk.scanState() === 'done') {
          <div class="done-box">
            <span>✓</span> Scan complete — {{ disk.scanResult()!.rootNode.fileCount | number }} files analyzed
            <button class="btn-view" (click)="viewResults()">View Results →</button>
          </div>
        }
      </div>

      <!-- Quick-access paths -->
      <div class="quick-paths">
        <div class="quick-label">Quick access</div>
        <div class="quick-list">
          @for (p of quickPaths; track p.label) {
            <button class="quick-btn" (click)="selectQuick(p.path)" [disabled]="isScanning">
              <span>{{ p.icon }}</span> {{ p.label }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .scanner {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      background: var(--bg-primary);
    }
    .header { }
    .title { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

    .scan-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 700px;
    }
    .path-row { display: flex; gap: 10px; }
    .path-input-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0 12px;
      &:focus-within { border-color: var(--accent); }
    }
    .path-icon { color: var(--accent); font-size: 14px; }
    .path-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 10px 0;
      &::placeholder { color: var(--text-muted); }
      &:disabled { opacity: 0.5; }
    }
    .btn-outline {
      padding: 8px 16px;
      background: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition);
      white-space: nowrap;
      &:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .options-row { display: flex; gap: 16px; }
    .option-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }
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
      padding: 4px 30px 4px 8px;
      cursor: pointer;
      outline: none;
      transition: border-color var(--transition), box-shadow var(--transition);
      &:hover:not(:disabled) { border-color: var(--border-light); }
      &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
      option { background: var(--bg-secondary); color: var(--text-primary); }
    }
    .btn-scan {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px;
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: var(--radius-md);
      font-family: var(--font-display);
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all var(--transition);
      &:hover:not(:disabled) { opacity: 0.85; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    .progress-section { display: flex; flex-direction: column; gap: 8px; }
    .progress-header { display: flex; justify-content: space-between; align-items: center; }
    .progress-label { font-size: 12px; color: var(--accent); }
    .btn-ghost-danger {
      background: none; border: 1px solid var(--danger);
      color: var(--danger); padding: 4px 10px;
      border-radius: var(--radius-sm); font-family: var(--font-mono);
      font-size: 11px; cursor: pointer; transition: all var(--transition);
      &:hover { background: var(--danger); color: #fff; }
    }
    .progress-bar {
      height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%; width: 60%;
      background: linear-gradient(90deg, var(--accent), transparent);
      animation: scanning 1.5s ease-in-out infinite;
    }
    @keyframes scanning {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    .progress-path { font-size: 10px; color: var(--text-muted); max-width: 600px; }

    .error-box {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; background: #ef44441a;
      border: 1px solid var(--danger); border-radius: var(--radius-md);
      color: var(--danger); font-size: 12px;
    }
    .done-box {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 12px 16px; background: var(--accent-dim);
      border: 1px solid var(--accent-border); border-radius: var(--radius-md);
      color: var(--accent); font-size: 12px;
    }
    .btn-view {
      margin-left: auto; background: var(--accent); color: #000;
      border: none; padding: 6px 14px; border-radius: var(--radius-sm);
      font-family: var(--font-mono); font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all var(--transition);
      &:hover { opacity: 0.85; }
    }

    .quick-paths { max-width: 700px; }
    .quick-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
    .quick-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .quick-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 12px; background: var(--bg-secondary);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      color: var(--text-secondary); font-family: var(--font-mono);
      font-size: 12px; cursor: pointer; transition: all var(--transition);
      &:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  `]
})
export class ScannerComponent {
  manualPath = '';
  maxDepth = 5;

  quickPaths = [
    { label: 'Home',      icon: '⌂', path: this.getHome() },
    { label: 'Documents', icon: '📄', path: this.getHome() + '/Documents' },
    { label: 'Downloads', icon: '⬇', path: this.getHome() + '/Downloads' },
    { label: 'Desktop',   icon: '🖥', path: this.getHome() + '/Desktop' },
  ];

  get isScanning(): boolean {
    return this.disk.scanState() === 'scanning';
  }

  constructor(public disk: DiskService, private router: Router, private cdr: ChangeDetectorRef) {}

  async browse(): Promise<void> {
    const path = await this.disk.selectDirectory();
    if (path) {
      this.manualPath = path;
      this.cdr.detectChanges();
    }
  }

  selectQuick(path: string): void {
    this.manualPath = path;
  }

  async startScan(): Promise<void> {
    if (!this.manualPath) return;
    if (typeof this.maxDepth === 'string') this.maxDepth = parseInt(this.maxDepth);
    await this.disk.startScan(this.manualPath, this.maxDepth);
  }

  cancel(): void {
    this.disk.reset();
  }

  viewResults(): void {
    this.router.navigate(['/dashboard']);
  }

  private getHome(): string {
    // Will be replaced by actual OS home at runtime via Rust or env
    return '~';
  }
}
