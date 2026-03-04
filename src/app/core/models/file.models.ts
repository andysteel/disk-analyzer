// ─── File Models ──────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  isDir: boolean;
  children: FileNode[];
  fileCount: number;
  depth: number;
}

export interface ScanProgress {
  currentPath: string;
  filesScanned: number;
  totalSize: number;
}

export interface DiskInfo {
  path: string;
  totalSpace: number;
  availableSpace: number;
  usedSpace: number;
  totalFormatted: string;
  availableFormatted: string;
  usedFormatted: string;
  usagePercent: number;
}

export interface FileTypeStats {
  extension: string;
  count: number;
  totalSize: number;
  sizeFormatted: string;
  color: string;
}

export type ScanState = 'idle' | 'scanning' | 'done' | 'error';

export interface ScanResult {
  rootNode: FileNode;
  diskInfo: DiskInfo;
  fileTypeStats: FileTypeStats[];
  largeFiles: FileNode[];
  scannedAt: Date;
}
