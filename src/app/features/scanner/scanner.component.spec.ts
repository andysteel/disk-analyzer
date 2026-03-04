import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { ScannerComponent } from './scanner.component';
import { DiskService } from '../../core/services/disk.service';
import { type DiskInfo, type FileNode, type ScanProgress, type ScanResult, type ScanState } from '../../core/models/file.models';

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const mockFileNode: FileNode = {
  name: 'home',
  path: '/home/user',
  size: 1_048_576,
  sizeFormatted: '1 MB',
  isDir: true,
  children: [],
  fileCount: 55,
  depth: 0,
};

const mockDiskInfo: DiskInfo = {
  path: '/home/user',
  totalSpace: 100_000_000_000,
  availableSpace: 50_000_000_000,
  usedSpace: 50_000_000_000,
  totalFormatted: '100 GB',
  availableFormatted: '50 GB',
  usedFormatted: '50 GB',
  usagePercent: 50,
};

const mockScanResult: ScanResult = {
  rootNode: mockFileNode,
  diskInfo: mockDiskInfo,
  fileTypeStats: [],
  largeFiles: [],
  scannedAt: new Date(),
};

// ─── Mock Service Factory ─────────────────────────────────────────────────────

function createMockDiskService(state: ScanState = 'idle') {
  // O template do ScannerComponent acessa disk.scanResult()!.rootNode.fileCount no done-box;
  // para evitar null reference, fornecemos scanResult quando state === 'done'
  const result: ScanResult | null = state === 'done' ? mockScanResult : null;
  return {
    scanState: signal<ScanState>(state),
    scanProgress: signal<ScanProgress | null>(null),
    scanResult: signal<ScanResult | null>(result),
    currentPath: signal<string>(''),
    errorMessage: signal<string>(''),
    selectDirectory: vi.fn().mockResolvedValue(null) as ReturnType<typeof vi.fn>,
    startScan: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
    reset: vi.fn(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ScannerComponent', () => {
  let fixture: ComponentFixture<ScannerComponent>;
  let component: ScannerComponent;
  let mockDisk: ReturnType<typeof createMockDiskService>;
  let router: Router;

  async function setup(state: ScanState = 'idle') {
    mockDisk = createMockDiskService(state);

    await TestBed.configureTestingModule({
      imports: [ScannerComponent],
      providers: [
        provideRouter([]),
        { provide: DiskService, useValue: mockDisk },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ─── Criação ────────────────────────────────────────────────────────────────

  describe('Criação', () => {
    it('deve criar o componente com sucesso', async () => {
      await setup();
      expect(component).toBeTruthy();
    });

    it('deve iniciar manualPath como string vazia', async () => {
      await setup();
      expect(component.manualPath).toBe('');
    });

    it('deve iniciar maxDepth como 5', async () => {
      await setup();
      expect(component.maxDepth).toBe(5);
    });

    it('deve ter a lista de quickPaths definida com 4 atalhos', async () => {
      await setup();
      expect(component.quickPaths).toHaveLength(4);
    });

    it('deve conter atalhos para Home, Documents, Downloads e Desktop', async () => {
      await setup();
      const labels = component.quickPaths.map(p => p.label);
      expect(labels).toContain('Home');
      expect(labels).toContain('Documents');
      expect(labels).toContain('Downloads');
      expect(labels).toContain('Desktop');
    });
  });

  // ─── isScanning getter ──────────────────────────────────────────────────────

  describe('isScanning', () => {
    it('deve retornar false quando scanState é "idle"', async () => {
      await setup('idle');
      expect(component.isScanning).toBe(false);
    });

    it('deve retornar true quando scanState é "scanning"', async () => {
      await setup('scanning');
      expect(component.isScanning).toBe(true);
    });

    it('deve retornar false quando scanState é "done"', async () => {
      await setup('done');
      expect(component.isScanning).toBe(false);
    });

    it('deve retornar false quando scanState é "error"', async () => {
      await setup('error');
      expect(component.isScanning).toBe(false);
    });
  });

  // ─── browse() ────────────────────────────────────────────────────────────────

  describe('browse()', () => {
    it('deve definir manualPath quando o diálogo retorna um caminho', async () => {
      await setup();
      mockDisk.selectDirectory.mockResolvedValue('/home/user/Projects');

      await component.browse();

      expect(component.manualPath).toBe('/home/user/Projects');
      expect(mockDisk.selectDirectory).toHaveBeenCalledTimes(1);
    });

    it('não deve alterar manualPath quando o diálogo é cancelado (null)', async () => {
      await setup();
      component.manualPath = '/existing/path';
      mockDisk.selectDirectory.mockResolvedValue(null);

      await component.browse();

      expect(component.manualPath).toBe('/existing/path');
    });

    it('deve chamar selectDirectory do DiskService', async () => {
      await setup();
      mockDisk.selectDirectory.mockResolvedValue('/some/path');

      await component.browse();

      expect(mockDisk.selectDirectory).toHaveBeenCalledTimes(1);
    });
  });

  // ─── selectQuick() ──────────────────────────────────────────────────────────

  describe('selectQuick()', () => {
    it('deve definir manualPath com o caminho rápido selecionado', async () => {
      await setup();
      component.selectQuick('/home/user/Downloads');
      expect(component.manualPath).toBe('/home/user/Downloads');
    });

    it('deve sobrescrever manualPath existente', async () => {
      await setup();
      component.manualPath = '/old/path';
      component.selectQuick('/new/path');
      expect(component.manualPath).toBe('/new/path');
    });
  });

  // ─── startScan() ─────────────────────────────────────────────────────────────

  describe('startScan()', () => {
    it('deve retornar sem chamar disk.startScan quando manualPath está vazio', async () => {
      await setup();
      component.manualPath = '';

      await component.startScan();

      expect(mockDisk.startScan).not.toHaveBeenCalled();
    });

    it('deve chamar disk.startScan com o caminho e maxDepth corretos', async () => {
      await setup();
      component.manualPath = '/home/user/docs';
      component.maxDepth = 5;

      await component.startScan();

      expect(mockDisk.startScan).toHaveBeenCalledWith('/home/user/docs', 5);
    });

    it('deve converter maxDepth string para número antes de chamar disk.startScan', async () => {
      await setup();
      component.manualPath = '/home/user/docs';
      component.maxDepth = '8' as unknown as number;

      await component.startScan();

      expect(component.maxDepth).toBe(8);
      expect(mockDisk.startScan).toHaveBeenCalledWith('/home/user/docs', 8);
    });

    it('deve propagar erro se disk.startScan rejeitar', async () => {
      await setup();
      component.manualPath = '/home/user/docs';
      mockDisk.startScan.mockRejectedValue(new Error('Unexpected error'));

      await expect(component.startScan()).rejects.toThrow('Unexpected error');
    });
  });

  // ─── cancel() ───────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('deve chamar disk.reset()', async () => {
      await setup();
      component.cancel();
      expect(mockDisk.reset).toHaveBeenCalledTimes(1);
    });
  });

  // ─── viewResults() ──────────────────────────────────────────────────────────

  describe('viewResults()', () => {
    it('deve navegar para /dashboard', async () => {
      await setup();
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.viewResults();

      expect(spy).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  // ─── Template rendering ──────────────────────────────────────────────────────

  describe('Renderização do template', () => {
    it('deve exibir o botão "Start Analysis" quando não está escaneando', async () => {
      await setup('idle');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.btn-scan')).not.toBeNull();
    });

    it('deve ocultar o botão "Start Analysis" durante o scan', async () => {
      await setup('scanning');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.btn-scan')).toBeNull();
    });

    it('deve exibir a seção de progresso durante o scan', async () => {
      await setup('scanning');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.progress-section')).not.toBeNull();
    });

    it('deve exibir a caixa de erro quando scanState é "error"', async () => {
      await setup('error');
      mockDisk.errorMessage.set('Permissão negada');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.error-box')).not.toBeNull();
      expect(el.querySelector('.error-box')?.textContent).toContain('Permissão negada');
    });

    it('deve exibir a caixa de sucesso quando scanState é "done"', async () => {
      await setup('done');
      // O template precisa de scanResult para renderizar a done-box sem erros
      mockDisk.scanResult.set(mockScanResult);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.done-box')).not.toBeNull();
    });

    it('deve exibir os botões de quickPaths', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      const quickBtns = el.querySelectorAll('.quick-btn');
      expect(quickBtns.length).toBe(4);
    });

    it('deve exibir o path do progresso quando scanProgress está disponível', async () => {
      await setup('scanning');
      mockDisk.scanProgress.set({ currentPath: '/home/user/src', filesScanned: 25, totalSize: 4096 });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.progress-path')?.textContent?.trim()).toBe('/home/user/src');
    });
  });
});
