import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { SettingsComponent } from './settings.component';
import { DiskService } from '../../core/services/disk.service';
import { ScanProgress, ScanResult, ScanState } from '../../core/models/file.models';

// ─── Mock Service Factory ─────────────────────────────────────────────────────

function createMockDiskService() {
  return {
    scanState: signal<ScanState>('idle'),
    scanProgress: signal<ScanProgress | null>(null),
    scanResult: signal<ScanResult | null>(null),
    currentPath: signal<string>(''),
    errorMessage: signal<string>(''),
    selectDirectory: vi.fn().mockResolvedValue(null),
    startScan: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let mockDisk: ReturnType<typeof createMockDiskService>;

  beforeEach(async () => {
    mockDisk = createMockDiskService();

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [{ provide: DiskService, useValue: mockDisk }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  // ─── Criação ─────────────────────────────────────────────────────────────────

  describe('Criação', () => {
    it('deve criar o componente com sucesso', () => {
      expect(component).toBeTruthy();
    });

    it('deve expor o DiskService via propriedade pública "disk"', () => {
      expect(component.disk).toBe(mockDisk as any);
    });
  });

  // ─── Valores padrão ──────────────────────────────────────────────────────────

  describe('Valores padrão', () => {
    it('deve iniciar defaultDepth com 5', () => {
      expect(component.defaultDepth).toBe(5);
    });

    it('deve iniciar skipHidden como true', () => {
      expect(component.skipHidden).toBe(true);
    });
  });

  // ─── clearData() ─────────────────────────────────────────────────────────────

  describe('clearData()', () => {
    it('deve chamar disk.reset()', () => {
      component.clearData();
      expect(mockDisk.reset).toHaveBeenCalledTimes(1);
    });

    it('deve chamar disk.reset() cada vez que clearData() é invocado', () => {
      component.clearData();
      component.clearData();
      expect(mockDisk.reset).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Mutação das propriedades ─────────────────────────────────────────────────

  describe('Mutação das propriedades', () => {
    it('deve aceitar novos valores para defaultDepth', () => {
      component.defaultDepth = 8;
      expect(component.defaultDepth).toBe(8);
    });

    it('deve aceitar novos valores para skipHidden', () => {
      component.skipHidden = false;
      expect(component.skipHidden).toBe(false);
    });
  });

  // ─── Template rendering ──────────────────────────────────────────────────────

  describe('Renderização do template', () => {
    it('deve exibir o título "Settings"', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.title')?.textContent?.trim()).toBe('Settings');
    });

    it('deve exibir o subtítulo com a descrição', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.subtitle')?.textContent?.trim()).toBe('Customize analyzer behavior');
    });

    it('deve exibir o botão "Clear" para limpar dados', () => {
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('.btn-danger');
      expect(btn).not.toBeNull();
      expect(btn?.textContent?.trim()).toBe('Clear');
    });

    it('deve exibir dois cards de configurações', () => {
      const el = fixture.nativeElement as HTMLElement;
      const cards = el.querySelectorAll('.settings-card');
      expect(cards.length).toBe(2);
    });

    it('deve exibir a seção "Scan Options"', () => {
      const el = fixture.nativeElement as HTMLElement;
      const sections = Array.from(el.querySelectorAll('.section-title')).map(e =>
        e.textContent?.trim()
      );
      expect(sections.some(s => s?.includes('Scan Options'))).toBe(true);
    });

    it('deve exibir a seção "Data"', () => {
      const el = fixture.nativeElement as HTMLElement;
      const sections = Array.from(el.querySelectorAll('.section-title')).map(e =>
        e.textContent?.trim()
      );
      expect(sections.some(s => s?.includes('Data'))).toBe(true);
    });

    it('deve chamar clearData() quando o botão "Clear" é clicado', () => {
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('.btn-danger') as HTMLButtonElement;
      const spy = vi.spyOn(component, 'clearData');

      btn.click();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
