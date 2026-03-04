import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  type DiskInfo,
  type FileNode,
  type FileTypeStats,
  type ScanProgress,
  type ScanResult,
  type ScanState,
} from '../models/file.models';

@Injectable({ providedIn: 'root' })
export class DiskService {

  scanState = signal<ScanState>('idle');
  scanProgress = signal<ScanProgress | null>(null);
  scanResult = signal<ScanResult | null>(null);
  currentPath = signal<string>('');
  errorMessage = signal<string>('');

  private unlistenProgress?: () => void;


  async selectDirectory(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select a directory to analyze',
    });
    return typeof selected === 'string' ? selected : null;
  }

  async startScan(path: string, maxDepth = 5): Promise<void> {
    this.currentPath.set(path);
    this.scanState.set('scanning');
    this.scanProgress.set(null);
    this.errorMessage.set('');

    if (typeof maxDepth === 'string') maxDepth = parseInt(maxDepth);

    this.unlistenProgress = await listen<ScanProgress>('scan-progress', (event) => {
      this.scanProgress.set(event.payload);
    });

    try {
      const [rootNode, diskInfo, fileTypeStats, largeFiles] = await Promise.all([
        invoke<FileNode>('scan_directory', { path, maxDepth }),
        invoke<DiskInfo>('get_disk_info', { path }),
        invoke<FileTypeStats[]>('get_file_type_stats', { path }),
        invoke<FileNode[]>('get_large_files', { path, limit: 50 }),
      ]);

      this.scanResult.set({
        rootNode,
        diskInfo,
        fileTypeStats,
        largeFiles,
        scannedAt: new Date(),
      });
      this.scanState.set('done');
    } catch (err) {
      this.errorMessage.set(String(err));
      this.scanState.set('error');
    } finally {
      this.unlistenProgress?.();
    }
  }

  reset(): void {
    this.scanState.set('idle');
    this.scanProgress.set(null);
    this.scanResult.set(null);
    this.currentPath.set('');
    this.errorMessage.set('');
    this.unlistenProgress?.();
  }
}
