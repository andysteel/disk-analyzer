import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DiskService } from './disk.service';
import type { DiskInfo, FileNode, FileTypeStats, ScanProgress, ScanResult } from '../models/file.models';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockFileNode: FileNode = {
  name: 'test-dir', path: '/home/user/test', size: 1_048_576, sizeFormatted: '1 MB',
  isDir: true, children: [], fileCount: 42, depth: 0,
};
const mockDiskInfo: DiskInfo = {
  path: '/home/user/test', totalSpace: 107_374_182_400, availableSpace: 53_687_091_200,
  usedSpace: 53_687_091_200, totalFormatted: '100 GB', availableFormatted: '50 GB',
  usedFormatted: '50 GB', usagePercent: 50,
};
const mockFileTypeStats: FileTypeStats[] = [
  { extension: 'ts', count: 15, totalSize: 102_400, sizeFormatted: '100 KB', color: '#3178c6' },
];
const mockScanResult: ScanResult = {
  rootNode: mockFileNode, diskInfo: mockDiskInfo, fileTypeStats: mockFileTypeStats,
  largeFiles: [mockFileNode], scannedAt: new Date('2024-01-01T12:00:00Z'),
};

// ─── Tauri Global Mock ────────────────────────────────────────────────────────
// @angular/build:unit-test desabilita vi.mock(). Mockamos via window.__TAURI_INTERNALS__
// que é o ponto de entrada de TODAS as APIs do Tauri v2 (invoke, listen, open, getVersion).

type Callback = (...args: unknown[]) => unknown;

interface TauriMock {
  invoke: ReturnType<typeof vi.fn>;
  _callbacks: Map<number, Callback>;
}

function setupTauriInternals(invokeImpl: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): TauriMock {
  let cbId = 0;
  const _callbacks = new Map<number, Callback>();
  const invoke = vi.fn().mockImplementation(invokeImpl);
  const transformCallback = vi.fn().mockImplementation((cb: Callback) => {
    const id = cbId++;
    _callbacks.set(id, cb);
    return id;
  });
  (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke, transformCallback };
  // _unlisten() em @tauri-apps/api/event.js usa __TAURI_EVENT_PLUGIN_INTERNALS__
  (globalThis as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: vi.fn() };
  return { invoke, _callbacks };
}

/** Factory de invoke que retorna dados corretos por padrão, com overrides por comando. */
function defaultInvoke(overrides: Record<string, unknown> = {}) {
  return async (cmd: string): Promise<unknown> => {
    switch (cmd) {
      case 'scan_directory':       return overrides['scan_directory']       ?? mockFileNode;
      case 'get_disk_info':        return overrides['get_disk_info']        ?? mockDiskInfo;
      case 'get_file_type_stats':  return overrides['get_file_type_stats']  ?? mockFileTypeStats;
      case 'get_large_files':      return overrides['get_large_files']      ?? [mockFileNode];
      case 'plugin:event|listen':  return overrides['plugin:event|listen']  ?? 0;
      case 'plugin:event|unlisten': return undefined;
      case 'plugin:dialog|open':   return overrides['plugin:dialog|open']   ?? null;
      default:                     return undefined;
    }
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DiskService', () => {
  let service: DiskService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DiskService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    delete (globalThis as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  // ─── Estado inicial ──────────────────────────────────────────────────────────

  describe('Estado inicial dos signals', () => {
    it('deve iniciar scanState como "idle"', () => { expect(service.scanState()).toBe('idle'); });
    it('deve iniciar scanProgress como null', () => { expect(service.scanProgress()).toBeNull(); });
    it('deve iniciar scanResult como null', () => { expect(service.scanResult()).toBeNull(); });
    it('deve iniciar currentPath como string vazia', () => { expect(service.currentPath()).toBe(''); });
    it('deve iniciar errorMessage como string vazia', () => { expect(service.errorMessage()).toBe(''); });
  });

  // ─── selectDirectory ────────────────────────────────────────────────────────

  describe('selectDirectory()', () => {
    it('deve retornar o caminho quando o diálogo retorna string', async () => {
      setupTauriInternals(defaultInvoke({ 'plugin:dialog|open': '/home/user/Documents' }));
      expect(await service.selectDirectory()).toBe('/home/user/Documents');
    });

    it('deve retornar null quando o diálogo é cancelado', async () => {
      setupTauriInternals(defaultInvoke({ 'plugin:dialog|open': null }));
      expect(await service.selectDirectory()).toBeNull();
    });

    it('deve retornar null quando o diálogo retorna um array (múltipla seleção)', async () => {
      setupTauriInternals(defaultInvoke({ 'plugin:dialog|open': ['/path/a', '/path/b'] }));
      expect(await service.selectDirectory()).toBeNull();
    });
  });

  // ─── startScan – sucesso ────────────────────────────────────────────────────

  describe('startScan() – sucesso', () => {
    let tauri: TauriMock;

    beforeEach(() => {
      tauri = setupTauriInternals(defaultInvoke());
    });

    it('deve definir currentPath com o caminho informado', async () => {
      await service.startScan('/home/user', 5);
      expect(service.currentPath()).toBe('/home/user');
    });

    it('deve definir scanState como "done" ao finalizar com sucesso', async () => {
      await service.startScan('/home/user', 5);
      expect(service.scanState()).toBe('done');
    });

    it('deve preencher scanResult.rootNode com o nó retornado por scan_directory', async () => {
      await service.startScan('/home/user', 5);
      expect(service.scanResult()?.rootNode).toEqual(mockFileNode);
    });

    it('deve preencher scanResult.diskInfo com dados do get_disk_info', async () => {
      await service.startScan('/home/user', 5);
      expect(service.scanResult()?.diskInfo).toEqual(mockDiskInfo);
    });

    it('deve preencher scanResult.fileTypeStats com get_file_type_stats', async () => {
      await service.startScan('/home/user', 5);
      expect(service.scanResult()?.fileTypeStats).toEqual(mockFileTypeStats);
    });

    it('deve registrar scannedAt como instância de Date', async () => {
      await service.startScan('/home/user', 5);
      expect(service.scanResult()?.scannedAt).toBeInstanceOf(Date);
    });

    it('deve limpar errorMessage no início do scan', async () => {
      service.errorMessage.set('Erro anterior');
      await service.startScan('/home/user', 5);
      expect(service.errorMessage()).toBe('');
    });

    it('deve usar maxDepth padrão de 5 quando não informado', async () => {
      await service.startScan('/home/user');
      expect(tauri.invoke).toHaveBeenCalledWith('scan_directory', { path: '/home/user', maxDepth: 5 }, undefined);
    });

    it('deve converter maxDepth string para número', async () => {
      await service.startScan('/home/user', '8' as unknown as number);
      expect(tauri.invoke).toHaveBeenCalledWith('scan_directory', { path: '/home/user', maxDepth: 8 }, undefined);
    });

    it('deve registrar listener via plugin:event|listen com evento correto', async () => {
      await service.startScan('/home/user', 5);
      expect(tauri.invoke).toHaveBeenCalledWith(
        'plugin:event|listen',
        expect.objectContaining({ event: 'scan-progress' }),
        undefined
      );
    });

    it('deve chamar plugin:event|unlisten no bloco finally (sucesso)', async () => {
      await service.startScan('/home/user', 5);
      expect(tauri.invoke).toHaveBeenCalledWith(
        'plugin:event|unlisten',
        expect.objectContaining({ event: 'scan-progress' }),
        undefined
      );
    });

    it('deve invocar scan_directory com path e maxDepth corretos', async () => {
      await service.startScan('/home/user/docs', 3);
      expect(tauri.invoke).toHaveBeenCalledWith('scan_directory', { path: '/home/user/docs', maxDepth: 3 }, undefined);
    });

    it('deve invocar get_large_files com limit 50', async () => {
      await service.startScan('/home/user', 5);
      expect(tauri.invoke).toHaveBeenCalledWith('get_large_files', { path: '/home/user', limit: 50 }, undefined);
    });

    it('deve atualizar scanProgress quando o callback de progresso é acionado', async () => {
      await service.startScan('/home/user', 5);
      // O handler capturado via transformCallback é o callback de scan-progress
      const handler = tauri._callbacks.get(0);
      expect(handler).toBeDefined();
      const progress: ScanProgress = { currentPath: '/home/user/src', filesScanned: 15, totalSize: 2048 };
      handler?.({ payload: progress });
      expect(service.scanProgress()).toEqual(progress);
    });
  });

  // ─── startScan – falha ──────────────────────────────────────────────────────

  describe('startScan() – falha', () => {
    it('deve definir scanState como "error" quando invoke rejeita', async () => {
      setupTauriInternals(async (cmd) => {
        if (cmd === 'plugin:event|listen') return 0;
        if (cmd === 'plugin:event|unlisten') return undefined;
        throw new Error('Permission denied');
      });
      await service.startScan('/home/user', 5);
      expect(service.scanState()).toBe('error');
    });

    it('deve preencher errorMessage com a mensagem do erro', async () => {
      setupTauriInternals(async (cmd) => {
        if (cmd === 'plugin:event|listen') return 0;
        if (cmd === 'plugin:event|unlisten') return undefined;
        throw new Error('Access denied');
      });
      await service.startScan('/home/user', 5);
      expect(service.errorMessage()).toBe('Error: Access denied');
    });

    it('deve chamar unlisten no bloco finally mesmo quando scan falha', async () => {
      const tauri = setupTauriInternals(async (cmd) => {
        if (cmd === 'plugin:event|listen') return 0;
        if (cmd === 'plugin:event|unlisten') return undefined;
        throw new Error('Scan error');
      });
      await service.startScan('/home/user', 5);
      expect(tauri.invoke).toHaveBeenCalledWith(
        'plugin:event|unlisten',
        expect.objectContaining({ event: 'scan-progress' }),
        undefined
      );
    });

    it('deve aceitar erros não-Error (string) como errorMessage', async () => {
      setupTauriInternals(async (cmd) => {
        if (cmd === 'plugin:event|listen') return 0;
        if (cmd === 'plugin:event|unlisten') return undefined;
        throw 'string-error';
      });
      await service.startScan('/home/user', 5);
      expect(service.errorMessage()).toBe('string-error');
      expect(service.scanState()).toBe('error');
    });

    it('deve propagar exceção quando listen falha (listen está fora do try/catch no serviço)', async () => {
      setupTauriInternals(async () => { throw new Error('IPC error'); });
      await expect(service.startScan('/home/user', 5)).rejects.toThrow('IPC error');
    });
  });

  // ─── reset ──────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('deve redefinir scanState para "idle"', () => {
      service.scanState.set('done');
      service.reset();
      expect(service.scanState()).toBe('idle');
    });

    it('deve redefinir scanProgress para null', () => {
      service.scanProgress.set({ currentPath: '/x', filesScanned: 5, totalSize: 100 });
      service.reset();
      expect(service.scanProgress()).toBeNull();
    });

    it('deve redefinir scanResult para null', () => {
      service.scanResult.set(mockScanResult);
      service.reset();
      expect(service.scanResult()).toBeNull();
    });

    it('deve redefinir currentPath para string vazia', () => {
      service.currentPath.set('/home/user');
      service.reset();
      expect(service.currentPath()).toBe('');
    });

    it('deve redefinir errorMessage para string vazia', () => {
      service.errorMessage.set('Algum erro');
      service.reset();
      expect(service.errorMessage()).toBe('');
    });

    it('deve chamar plugin:event|unlisten após um scan completo', async () => {
      const tauri = setupTauriInternals(defaultInvoke());
      await service.startScan('/home/user', 5);
      const before = tauri.invoke.mock.calls.filter(([c]) => c === 'plugin:event|unlisten').length;
      service.reset();
      const after = tauri.invoke.mock.calls.filter(([c]) => c === 'plugin:event|unlisten').length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
