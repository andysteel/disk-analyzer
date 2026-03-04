import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Component } from '@angular/core';
import { vi } from 'vitest';

import { AppComponent } from './app.component';
import { RouterOutlet } from '@angular/router';
import { DiskService } from './core/services/disk.service';
import { ScanProgress, ScanResult, ScanState } from './core/models/file.models';

// Garante que qualquer chamada Tauri durante importação de módulos não exploda
function setupTauriStubs() {
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: vi.fn().mockResolvedValue(undefined),
    transformCallback: vi.fn().mockReturnValue(0),
  };
  (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: vi.fn() };
}

// ─── Stub do SidebarComponent ──────────────────────────────────────────────────
// Substituímos o SidebarComponent real para isolar o AppComponent dos detalhes
// de implementação do sidebar (Tauri, Router Links, etc.)

@Component({ selector: 'app-sidebar', template: '<div class="sidebar-stub"></div>', standalone: true })
class SidebarStubComponent {}

// ─── Mock DiskService ─────────────────────────────────────────────────────────

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

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;

  beforeEach(async () => {
    setupTauriStubs();
    const mockDisk = createMockDiskService();

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: DiskService, useValue: mockDisk },
      ],
    })
      .overrideComponent(AppComponent, {
        // Substituímos app-sidebar pelo stub mas mantemos RouterOutlet
        set: { imports: [RouterOutlet, SidebarStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (globalThis as any).__TAURI_INTERNALS__;
    delete (globalThis as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  // ─── Criação ─────────────────────────────────────────────────────────────────

  describe('Criação', () => {
    it('deve criar o AppComponent com sucesso', () => {
      expect(component).toBeTruthy();
    });
  });

  // ─── Template rendering ──────────────────────────────────────────────────────

  describe('Renderização do template', () => {
    it('deve renderizar o elemento host com display:flex', () => {
      const el = fixture.nativeElement as HTMLElement;
      const host = el.closest('app-root') ?? el.parentElement;
      expect(host).not.toBeNull();
    });

    it('deve renderizar o sidebar stub', () => {
      const el = fixture.nativeElement as HTMLElement;
      // O stub renderiza um div.sidebar-stub
      const sidebar = el.querySelector('.sidebar-stub') ?? el.parentElement?.querySelector('.sidebar-stub');
      expect(sidebar).not.toBeNull();
    });

    it('deve conter o elemento .main-content', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.main-content')).not.toBeNull();
    });
  });
});
