import {
  type AfterViewInit,
  Component,
  effect,
  type ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import * as d3 from 'd3';
import { DiskService } from '../../core/services/disk.service';
import { type FileNode } from '../../core/models/file.models';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="dashboard">
      <!-- Header -->
      <header class="header">
        <div>
          <h1 class="title">Dashboard</h1>
          @if (disk.scanResult()) {
            <p class="subtitle">{{ disk.currentPath() }}</p>
          }
        </div>
        <button class="btn-primary" (click)="goToScanner()">
          <span>◎</span> New Scan
        </button>
      </header>

      @if (!disk.scanResult()) {
        <!-- Empty state -->
        <div class="empty-state">
          <div class="empty-icon">◎</div>
          <h2>No scan data</h2>
          <p>Run a scan to analyze your disk usage</p>
          <button class="btn-primary large" (click)="goToScanner()">Start Scanning</button>
        </div>
      } @else {
        <!-- Stats cards -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Size</div>
            <div class="stat-value">{{ disk.scanResult()!.diskInfo.totalFormatted }}</div>
            <div class="stat-sub">Total disk space</div>
          </div>
          <div class="stat-card accent">
            <div class="stat-label">Used</div>
            <div class="stat-value">{{ disk.scanResult()!.diskInfo.usedFormatted }}</div>
            <div class="stat-bar">
              <div class="stat-bar-fill" [style.width.%]="disk.scanResult()!.diskInfo.usagePercent"></div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Available</div>
            <div class="stat-value">{{ disk.scanResult()!.diskInfo.availableFormatted }}</div>
            <div class="stat-sub">Free space</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Files</div>
            <div class="stat-value">{{ disk.scanResult()!.rootNode.fileCount | number }}</div>
            <div class="stat-sub">Total files scanned</div>
          </div>
        </div>

        <!-- Treemap + file types -->
        <div class="charts-row">
          <div class="chart-card treemap-card">
            <div class="card-header">
              <span class="card-title">Directory Treemap</span>
              @if (breadcrumbs().length > 0) {
                <button class="btn-ghost" (click)="resetTreemap()">↩ Back to root</button>
              }
            </div>
            <div class="treemap-container" #treemapEl></div>
          </div>

          <div class="chart-card filetypes-card">
            <div class="card-header">
              <span class="card-title">Top File Types</span>
            </div>
            <div class="filetypes-list">
              @for (ft of disk.scanResult()!.fileTypeStats.slice(0, 10); track ft.extension) {
                <div class="ft-item">
                  <div class="ft-dot" [style.background]="ft.color"></div>
                  <span class="ft-ext">.{{ ft.extension }}</span>
                  <div class="ft-bar-wrap">
                    <div class="ft-bar" [style.background]="ft.color + '40'"
                         [style.width.%]="getFileTypePercent(ft.totalSize)">
                      <div class="ft-bar-inner" [style.background]="ft.color"
                           [style.width]="'100%'"></div>
                    </div>
                  </div>
                  <span class="ft-size">{{ ft.sizeFormatted }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Large files table -->
        <div class="chart-card large-files-card">
          <div class="card-header">
            <span class="card-title">Largest Files</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  <th>Path</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                @for (file of disk.scanResult()!.largeFiles.slice(0, 20); track file.path; let i = $index) {
                  <tr>
                    <td class="td-index">{{ i + 1 }}</td>
                    <td class="td-name">{{ file.name }}</td>
                    <td class="td-path truncate">{{ file.path }}</td>
                    <td class="td-size">{{ file.sizeFormatted }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .dashboard {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      background: var(--bg-primary);
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }
    .title {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .subtitle {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      max-width: 500px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition);
      &:hover { opacity: 0.85; }
      &.large { padding: 12px 24px; font-size: 14px; margin-top: 16px; }
    }
    .btn-ghost {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 11px;
      cursor: pointer;
      transition: all var(--transition);
      &:hover { border-color: var(--accent); color: var(--accent); }
    }
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-secondary);
      .empty-icon { font-size: 48px; color: var(--accent); opacity: 0.3; }
      h2 { font-family: var(--font-display); font-size: 20px; color: var(--text-primary); }
      p { font-size: 13px; }
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 16px;
      &.accent { border-color: var(--accent-border); background: var(--accent-dim); }
    }
    .stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .stat-value { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .stat-sub { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
    .stat-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .stat-bar-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 600ms ease; }

    .charts-row {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 12px;
      min-height: 380px;
    }
    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .card-title { font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--text-primary); }

    .treemap-container { flex: 1; overflow: hidden; }

    .filetypes-list { padding: 12px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .ft-item { display: flex; align-items: center; gap: 8px; }
    .ft-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .ft-ext { font-size: 11px; color: var(--text-primary); width: 46px; flex-shrink: 0; }
    .ft-bar-wrap { flex: 1; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
    .ft-bar { height: 100%; border-radius: 3px; transition: width 500ms ease; }
    .ft-size { font-size: 10px; color: var(--text-muted); width: 56px; text-align: right; flex-shrink: 0; }

    .large-files-card { min-height: 0; }
    .table-wrap { overflow-y: auto; max-height: 260px; }
    .table { width: 100%; border-collapse: collapse; }
    .table thead th {
      position: sticky; top: 0;
      background: var(--bg-tertiary);
      padding: 8px 14px;
      text-align: left;
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid var(--border);
    }
    .table tbody tr { border-bottom: 1px solid var(--border); transition: background var(--transition); }
    .table tbody tr:hover { background: var(--bg-hover); }
    .table td { padding: 7px 14px; font-size: 12px; }
    .td-index { color: var(--text-muted); width: 30px; }
    .td-name { color: var(--text-primary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .td-path { color: var(--text-muted); max-width: 300px; font-size: 11px; }
    .td-size { color: var(--accent); white-space: nowrap; text-align: right; }
  `]
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('treemapEl') treemapEl!: ElementRef<HTMLDivElement>;

  readonly disk = inject(DiskService);
  private readonly router = inject(Router);

  private currentNode: FileNode | null = null;

  constructor() {
    effect(() => {
      const result = this.disk.scanResult();
      if (result && this.treemapEl) {
        this.currentNode = result.rootNode;
        this.renderTreemap(result.rootNode);
      }
    });
  }

  ngAfterViewInit(): void {
    const result = this.disk.scanResult();
    if (result) {
      this.currentNode = result.rootNode;
      this.renderTreemap(result.rootNode);
    }
  }

  breadcrumbs() {
    return [];
  }

  goToScanner(): void {
    this.router.navigate(['/scanner']);
  }

  resetTreemap(): void {
    const result = this.disk.scanResult();
    if (result) {
      this.currentNode = result.rootNode;
      this.renderTreemap(result.rootNode);
    }
  }

  getFileTypePercent(size: number): number {
    const result = this.disk.scanResult();
    if (!result || result.fileTypeStats.length === 0) return 0;
    const max = result.fileTypeStats[0].totalSize;
    return max > 0 ? (size / max) * 100 : 0;
  }

  private renderTreemap(node: FileNode): void {
    const container = this.treemapEl?.nativeElement;
    if (!container) return;

    d3.select(container).selectAll('*').remove();

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const colors = d3.schemeTableau10;

    // Build hierarchy from children
    const hierarchy = d3.hierarchy<FileNode>(node)
      .sum(d => (!d.isDir || !d.children.length) ? d.size : 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const treemap = d3.treemap<FileNode>()
      .size([width, height])
      .paddingOuter(3)
      .paddingInner(1)
      .round(true);

    const root = treemap(hierarchy);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const cell = svg.selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        // Drill into parent dir
        if (d.parent && d.parent.data.isDir && d.parent !== root) {
          this.renderTreemap(d.parent.data);
        }
      });

    cell.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', (_d, i) => colors[i % colors.length] + 'cc')
      .attr('rx', 2)
      .on('mouseover', function () {
        d3.select(this).attr('fill', (_d, i) => colors[i % colors.length]);
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill', (_d, i) => colors[i % colors.length] + 'cc');
      });

    cell.append('title')
      .text(d => `${d.data.name}\n${d.data.sizeFormatted}`);

    cell.filter(d => (d.x1 - d.x0) > 48 && (d.y1 - d.y0) > 20)
      .append('text')
      .attr('x', 4)
      .attr('y', 13)
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => {
        const w = d.x1 - d.x0 - 8;
        const name = d.data.name;
        return name.length * 6 < w ? name : name.slice(0, Math.floor(w / 6)) + '…';
      });

    cell.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 32)
      .append('text')
      .attr('x', 4)
      .attr('y', 25)
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.data.sizeFormatted);
  }
}
