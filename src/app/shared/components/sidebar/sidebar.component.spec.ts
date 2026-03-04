import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';

/** Drena todas as microtasks pendentes aguardando o próximo ciclo de macrotask. */
function flushAllMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// @angular/build:unit-test desabilita vi.mock().
// Mockamos via window.__TAURI_INTERNALS__ pois getVersion() chama invoke('plugin:app|version').
function setupTauriForVersion(version: string) {
  const invoke = vi.fn().mockImplementation(async (cmd: string) => {
    if (cmd === 'plugin:app|version') return version;
    return undefined;
  });
  const transformCallback = vi.fn().mockReturnValue(0);
  (globalThis as any).__TAURI_INTERNALS__ = { invoke, transformCallback };
  // Garante que _unlisten não falhe se algum listener for criado
  (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: vi.fn() };
  return { invoke };
}

import { SidebarComponent } from './sidebar.component';
import { DiskService } from '../../../core/services/disk.service';
import { DiskInfo, FileNode, FileTypeStats, ScanProgress, ScanResult, ScanState } from '../../../core/models/file.models';

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const mockFileNode: FileNode = {
  name: 'root',
  path: '/home/user/projects',
  size: 2_048_000,
  sizeFormatted: '2 MB',
  isDir: true,
  children: [],
  fileCount: 30,
  depth: 0,
};

const mockDiskInfo: DiskInfo = {
  path: '/home/user/projects',
  totalSpace: 500_000_000_000,
  availableSpace: 300_000_000_000,
  usedSpace: 200_000_000_000,
  totalFormatted: '500 GB',
  availableFormatted: '300 GB',
  usedFormatted: '200 GB',
  usagePercent: 40,
};

const mockScanResult: ScanResult = {
  rootNode: mockFileNode,
  diskInfo: mockDiskInfo,
  fileTypeStats: [],
  largeFiles: [],
  scannedAt: new Date('2024-07-20T15:45:00Z'),
};

// ─── Mock Service Factory ─────────────────────────────────────────────────────

function createMockDiskService(result: ScanResult | null = null, path = '') {
  return {
    scanState: signal<ScanState>('idle'),
    scanProgress: signal<ScanProgress | null>(null),
    scanResult: signal<ScanResult | null>(result),
    currentPath: signal<string>(path),
    errorMessage: signal<string>(''),
    selectDirectory: vi.fn().mockResolvedValue(null),
    startScan: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let component: SidebarComponent;
  let mockDisk: ReturnType<typeof createMockDiskService>;

  async function setup(result: ScanResult | null = null, path = '', version = '1.2.3') {
    mockDisk = createMockDiskService(result, path);
    setupTauriForVersion(version);

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        { provide: DiskService, useValue: mockDisk },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (globalThis as any).__TAURI_INTERNALS__;
    delete (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  // ─── Criação ─────────────────────────────────────────────────────────────────

  describe('Criação', () => {
    it('deve criar o componente com sucesso', async () => {
      await setup();
      expect(component).toBeTruthy();
    });

    it('deve expor o DiskService via propriedade pública "disk"', async () => {
      await setup();
      expect(component.disk).toBe(mockDisk as any);
    });
  });

  // ─── Versão do app ───────────────────────────────────────────────────────────

  describe('appVersion', () => {
    it('deve iniciar appVersion com "..." ou a versão resolvida', async () => {
      await setup(null, '', '9.9.9');
      const initialVersion = component.appVersion();
      expect(initialVersion === '...' || initialVersion === '9.9.9').toBe(true);
    });

    it('deve atualizar appVersion após getVersion resolver', async () => {
      await setup(null, '', '2.5.1');
      await flushAllMicrotasks(); // drena todas as microtasks pendentes do getVersion()
      fixture.detectChanges();
      expect(component.appVersion()).toBe('2.5.1');
    });

    it('deve chamar invoke("plugin:app|version") durante a inicialização', async () => {
      await setup(null, '', '1.0.0');
      await flushAllMicrotasks();
      // O __TAURI_INTERNALS__.invoke configurado dentro de setup() deve ter sido chamado
      const invoke = (globalThis as any).__TAURI_INTERNALS__?.invoke;
      if (invoke) {
        // invoke() usa args = {} como padrão quando não há argumentos
        expect(invoke).toHaveBeenCalledWith('plugin:app|version', {}, undefined);
      } else {
        // Se não houver tauri internals, a versão deve ainda ser '...'
        expect(component.appVersion()).toBe('...');
      }
    });

    it('deve exibir a versão no template após resolução', async () => {
      await setup(null, '', '3.0.0');
      await flushAllMicrotasks();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.version')?.textContent).toContain('3.0.0');
    });
  });

  // ─── Navegação ──────────────────────────────────────────────────────────────

  describe('Links de navegação', () => {
    it('deve exibir o link para /dashboard', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      const links = el.querySelectorAll('a.nav-item');
      const hrefs = Array.from(links).map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.includes('dashboard'))).toBe(true);
    });

    it('deve exibir o link para /scanner', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      const links = el.querySelectorAll('a.nav-item');
      const hrefs = Array.from(links).map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.includes('scanner'))).toBe(true);
    });

    it('deve exibir o link para /settings', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      const links = el.querySelectorAll('a.nav-item');
      const hrefs = Array.from(links).map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.includes('settings'))).toBe(true);
    });

    it('deve exibir 3 links de navegação', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      const links = el.querySelectorAll('a.nav-item');
      expect(links.length).toBe(3);
    });
  });

  // ─── Scan Info ───────────────────────────────────────────────────────────────

  describe('Informações do último scan', () => {
    it('não deve exibir o scan-info quando não há resultado', async () => {
      await setup(null);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.scan-info')).toBeNull();
    });

    it('deve exibir o scan-info quando há resultado', async () => {
      await setup(mockScanResult, '/home/user/projects');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.scan-info')).not.toBeNull();
    });

    it('deve exibir o caminho do scan', async () => {
      await setup(mockScanResult, '/home/user/projects');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.scan-info-path')?.textContent?.trim()).toBe('/home/user/projects');
    });

    it('deve exibir o horário do scan formatado', async () => {
      await setup(mockScanResult, '/home/user/projects');
      const el = fixture.nativeElement as HTMLElement;
      // scannedAt = 2024-07-20T15:45:00Z → formato HH:mm:ss depende do timezone
      const timeEl = el.querySelector('.scan-info-time');
      expect(timeEl).not.toBeNull();
      expect(timeEl?.textContent?.trim()).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('deve mostrar e depois esconder scan-info ao alterar scanResult', async () => {
      await setup(null);
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.scan-info')).toBeNull();

      mockDisk.scanResult.set(mockScanResult);
      mockDisk.currentPath.set('/home/user/projects');
      fixture.detectChanges();

      expect(el.querySelector('.scan-info')).not.toBeNull();

      mockDisk.scanResult.set(null);
      fixture.detectChanges();

      expect(el.querySelector('.scan-info')).toBeNull();
    });
  });

  // ─── Logo ────────────────────────────────────────────────────────────────────

  describe('Logo', () => {
    it('deve exibir o ícone do logo', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.logo-icon')?.textContent?.trim()).toBe('◈');
    });

    it('deve exibir o texto "DISK ANALYZER" no logo', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.logo-text')?.textContent).toContain('DISK');
      expect(el.querySelector('.logo-text')?.textContent).toContain('ANALYZER');
    });
  });
});
