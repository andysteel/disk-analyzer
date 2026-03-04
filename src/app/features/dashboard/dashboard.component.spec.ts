import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { DashboardComponent } from './dashboard.component';
import { DiskService } from '../../core/services/disk.service';
import { type DiskInfo, type FileNode, type FileTypeStats, type ScanProgress, type ScanResult, type ScanState } from '../../core/models/file.models';

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const mockFileNode: FileNode = {
  name: 'root',
  path: '/home/user',
  size: 2_097_152,
  sizeFormatted: '2 MB',
  isDir: true,
  children: [
    { name: 'a.ts', path: '/home/user/a.ts', size: 512, sizeFormatted: '512 B', isDir: false, children: [], fileCount: 0, depth: 1 },
  ],
  fileCount: 100,
  depth: 0,
};

const mockDiskInfo: DiskInfo = {
  path: '/home/user',
  totalSpace: 500_000_000_000,
  availableSpace: 250_000_000_000,
  usedSpace: 250_000_000_000,
  totalFormatted: '500 GB',
  availableFormatted: '250 GB',
  usedFormatted: '250 GB',
  usagePercent: 50,
};

const mockFileTypeStats: FileTypeStats[] = [
  { extension: 'ts', count: 20, totalSize: 200_000, sizeFormatted: '200 KB', color: '#3178c6' },
  { extension: 'json', count: 5, totalSize: 50_000, sizeFormatted: '50 KB', color: '#cbcb41' },
  { extension: 'scss', count: 8, totalSize: 100_000, sizeFormatted: '100 KB', color: '#cc6699' },
];

const mockScanResult: ScanResult = {
  rootNode: mockFileNode,
  diskInfo: mockDiskInfo,
  fileTypeStats: mockFileTypeStats,
  largeFiles: [mockFileNode],
  scannedAt: new Date('2024-06-15T10:30:00Z'),
};

// ─── Mock Service Factory ─────────────────────────────────────────────────────

function createMockDiskService(overrides: Partial<{ result: ScanResult | null; state: ScanState }> = {}) {
  return {
    scanState: signal<ScanState>(overrides.state ?? 'idle'),
    scanProgress: signal<ScanProgress | null>(null),
    scanResult: signal<ScanResult | null>(overrides.result ?? null),
    currentPath: signal<string>(overrides.result ? '/home/user' : ''),
    errorMessage: signal<string>(''),
    selectDirectory: vi.fn().mockResolvedValue(null),
    startScan: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let mockDisk: ReturnType<typeof createMockDiskService>;
  let router: Router;

  async function setup(result: ScanResult | null = null) {
    mockDisk = createMockDiskService({ result });

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DiskService, useValue: mockDisk },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ─── Criação do componente ──────────────────────────────────────────────────

  describe('Criação', () => {
    it('deve criar o componente com sucesso', async () => {
      await setup();
      expect(component).toBeTruthy();
    });

    it('deve expor o DiskService via propriedade pública "disk"', async () => {
      await setup();
      expect(component.disk).toBe(mockDisk);
    });
  });

  // ─── Estado vazio (sem scan) ────────────────────────────────────────────────

  describe('Estado vazio (sem scanResult)', () => {
    beforeEach(async () => setup(null));

    it('deve exibir o empty-state quando não há resultado de scan', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.empty-state')).not.toBeNull();
    });

    it('não deve exibir stats-grid quando não há resultado', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.stats-grid')).toBeNull();
    });

    it('não deve exibir a tabela de arquivos grandes quando não há resultado', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.large-files-card')).toBeNull();
    });
  });

  // ─── Estado com dados ────────────────────────────────────────────────────────

  describe('Estado com scanResult', () => {
    beforeEach(async () => setup(mockScanResult));

    it('não deve exibir o empty-state quando há resultado', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.empty-state')).toBeNull();
    });

    it('deve exibir o stats-grid', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.stats-grid')).not.toBeNull();
    });

    it('deve exibir o caminho atual no subtítulo', () => {
      const el = fixture.nativeElement as HTMLElement;
      const subtitle = el.querySelector('.subtitle');
      expect(subtitle?.textContent?.trim()).toBe('/home/user');
    });

    it('deve exibir o total de arquivos escaneados', () => {
      const el = fixture.nativeElement as HTMLElement;
      const statValues = el.querySelectorAll('.stat-value');
      const textos = Array.from(statValues).map(e => e.textContent?.trim());
      expect(textos.some(t => t?.includes('100'))).toBe(true);
    });

    it('deve exibir o tamanho total do disco', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('500 GB');
    });

    it('deve exibir o espaço usado', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('250 GB');
    });

    it('deve exibir a lista de tipos de arquivo', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.filetypes-list')).not.toBeNull();
    });

    it('deve exibir a tabela de maiores arquivos', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.large-files-card')).not.toBeNull();
    });
  });

  // ─── Navegação ──────────────────────────────────────────────────────────────

  describe('goToScanner()', () => {
    beforeEach(async () => setup());

    it('deve navegar para /scanner ao chamar goToScanner()', async () => {
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.goToScanner();

      expect(spy).toHaveBeenCalledWith(['/scanner']);
    });
  });

  // ─── breadcrumbs ────────────────────────────────────────────────────────────

  describe('breadcrumbs()', () => {
    beforeEach(async () => setup());

    it('deve retornar array vazio', () => {
      expect(component.breadcrumbs()).toEqual([]);
    });
  });

  // ─── getFileTypePercent ──────────────────────────────────────────────────────

  describe('getFileTypePercent()', () => {
    it('deve retornar 0 quando não há scanResult', async () => {
      await setup(null);
      expect(component.getFileTypePercent(50_000)).toBe(0);
    });

    it('deve retornar 0 quando fileTypeStats é vazio', async () => {
      const resultSemStats: ScanResult = { ...mockScanResult, fileTypeStats: [] };
      await setup(resultSemStats);
      expect(component.getFileTypePercent(50_000)).toBe(0);
    });

    it('deve retornar 0 quando o tamanho máximo é zero', async () => {
      const resultZeroSize: ScanResult = {
        ...mockScanResult,
        fileTypeStats: [{ extension: 'x', count: 1, totalSize: 0, sizeFormatted: '0 B', color: '#fff' }],
      };
      await setup(resultZeroSize);
      expect(component.getFileTypePercent(0)).toBe(0);
    });

    it('deve calcular a porcentagem corretamente em relação ao maior tipo', async () => {
      await setup(mockScanResult);
      // Max é mockFileTypeStats[0].totalSize = 200_000
      // Para 100_000 → 50%
      expect(component.getFileTypePercent(100_000)).toBe(50);
    });

    it('deve retornar 100 para o maior tipo de arquivo', async () => {
      await setup(mockScanResult);
      expect(component.getFileTypePercent(200_000)).toBe(100);
    });
  });

  // ─── resetTreemap ────────────────────────────────────────────────────────────

  describe('resetTreemap()', () => {
    it('deve re-renderizar o treemap com o rootNode quando há resultado', async () => {
      await setup(mockScanResult);
      // Verifica que a chamada não lança exceção (renderTreemap retorna cedo no JSDOM pois clientWidth=0)
      expect(() => component.resetTreemap()).not.toThrow();
    });

    it('não deve lançar exceção quando não há resultado de scan', async () => {
      await setup(null);
      expect(() => component.resetTreemap()).not.toThrow();
    });
  });

  // ─── Reatividade dos signals ─────────────────────────────────────────────────

  describe('Reatividade dos signals', () => {
    it('deve exibir empty-state e depois stats ao alterar scanResult', async () => {
      await setup(null);
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.empty-state')).not.toBeNull();

      mockDisk.scanResult.set(mockScanResult);
      mockDisk.currentPath.set('/home/user');
      fixture.detectChanges();

      expect(el.querySelector('.empty-state')).toBeNull();
      expect(el.querySelector('.stats-grid')).not.toBeNull();
    });
  });
});
