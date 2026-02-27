import { Component, OnInit } from '@angular/core'
import { GistSyncService } from './gistSync.service'
import { KeygenService, KeyType } from './keygen.service'
import { PlatformService } from 'tabby-core'

@Component({
  selector: 'gist-settings',
  template: `
    <div class="tabs-holder">
      <div class="tab-btn" [class.active]="activeTab === 'sync'" (click)="activeTab = 'sync'">Sync</div>
      <div class="tab-btn" [class.active]="activeTab === 'keygen'" (click)="activeTab = 'keygen'">Key Generator</div>
      <div class="tab-btn" [class.active]="activeTab === 'author'" (click)="activeTab = 'author'">About</div>
    </div>

    <!-- ─── SYNC TAB ─── -->
    <div *ngIf="activeTab === 'sync'" class="tab-body">

      <!-- Token -->
      <div class="section">
        <div class="section-header">Step 1 — GitHub Token</div>
        <div class="section-desc">
          Create a <a href="https://github.com/settings/tokens/new?scopes=gist&description=tabby-to-gist" target="_blank">Personal Access Token</a> with <code>gist</code> scope. Stored in Tabby Vault.
        </div>
        <div class="input-row">
          <input type="password" class="form-control" [(ngModel)]="pat" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
          <button class="btn btn-primary ml-2" (click)="savePat()" [disabled]="!pat.trim()">Save to Vault</button>
        </div>
        <div class="status-pill success" *ngIf="patSaved">Token saved</div>
      </div>

      <!-- Gist ID -->
      <div class="section">
        <div class="section-header">Step 2 — Gist ID</div>
        <div class="section-desc">Paste an existing Gist ID, or create a new private Gist automatically.</div>
        <div class="input-row">
          <input type="text" class="form-control" [(ngModel)]="gistId" placeholder="Paste your Gist ID here..." (blur)="save()" />
        </div>
        <div *ngIf="!gistId" class="mt-3">
          <button class="btn btn-outline-info btn-sm" (click)="createGist()" [disabled]="!patSaved">
            No Gist yet? Create one automatically
          </button>
        </div>
        <div class="status-pill success" *ngIf="gistId">Gist ID configured</div>
      </div>

      <!-- Enable -->
      <div class="section">
        <div class="section-header">Step 3 — Enable Sync</div>
        <div class="section-desc">Once token and Gist ID are set, enable automatic syncing.</div>
        <div class="toggle-row">
          <label class="switch">
            <input type="checkbox" [(ngModel)]="enabled" (ngModelChange)="save()" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label" [class.on]="enabled">
            {{ enabled ? 'Sync is ON' : 'Sync is OFF' }}
          </span>
        </div>
      </div>

      <!-- Sync Interval -->
      <div class="section" *ngIf="enabled">
        <div class="section-header">Sync Interval</div>
        <div class="section-desc">How often (in seconds) to automatically push config changes after edits.</div>
        <div class="input-row narrow">
          <input type="number" class="form-control" [(ngModel)]="syncInterval" min="5" max="3600" (blur)="save()" />
          <span class="ml-2 unit-label">seconds</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="section actions-section">
        <div class="section-header">Manual Actions</div>
        <div class="section-desc">Manually pull or push your configuration.</div>
        <div class="btn-row">
          <button class="btn btn-primary mr-2" (click)="doPull()" [disabled]="!gistId || actionLoading">
            {{ actionLoading && actionType === 'pull' ? 'Pulling...' : 'Pull from Gist' }}
          </button>
          <button class="btn btn-secondary" (click)="doPush()" [disabled]="!gistId || actionLoading">
            {{ actionLoading && actionType === 'push' ? 'Pushing...' : 'Push to Gist' }}
          </button>
        </div>
        <div class="action-result" *ngIf="actionResult" [class.error]="actionIsError">
          {{ actionResult }}
        </div>
      </div>
    </div>

    <!-- ─── KEY GENERATOR TAB ─── -->
    <div *ngIf="activeTab === 'keygen'" class="tab-body">

      <div class="section">
        <div class="section-header">Generate SSH Key Pair</div>
        <div class="section-desc">Select a key type and generate a new SSH key pair. Keys are generated locally and never leave your machine.</div>

        <div class="keygen-controls">
          <select class="form-control keygen-select" [(ngModel)]="selectedKeyType">
            <option value="ed25519">Ed25519 (recommended)</option>
            <option value="ecdsa">ECDSA (P-256)</option>
            <option value="rsa">RSA (4096-bit)</option>
          </select>
          <button class="btn btn-primary ml-2" (click)="generateKeys()" [disabled]="generating">
            {{ generating ? 'Generating...' : 'Generate' }}
          </button>
        </div>
      </div>

      <div *ngIf="generatedPrivateKey" class="section">
        <div class="key-block">
          <div class="key-label">
            Private Key
            <span class="key-actions">
              <button class="btn-icon" (click)="copyKey('private')" title="Copy">
                <i [class]="copiedPrivate ? 'fas fa-check' : 'fas fa-copy'"></i>
              </button>
              <button class="btn-icon" (click)="exportKey('private')" title="Export">
                <i class="fas fa-download"></i>
              </button>
            </span>
          </div>
          <textarea class="key-textarea" readonly [value]="generatedPrivateKey" rows="8"></textarea>
        </div>
      </div>

      <div *ngIf="generatedPublicKey" class="section">
        <div class="key-block">
          <div class="key-label">
            Public Key
            <span class="key-actions">
              <button class="btn-icon" (click)="copyKey('public')" title="Copy">
                <i [class]="copiedPublic ? 'fas fa-check' : 'fas fa-copy'"></i>
              </button>
              <button class="btn-icon" (click)="exportKey('public')" title="Export">
                <i class="fas fa-download"></i>
              </button>
            </span>
          </div>
          <textarea class="key-textarea" readonly [value]="generatedPublicKey" rows="4"></textarea>
        </div>
      </div>

    </div>

    <!-- ─── ABOUT TAB ─── -->
    <div *ngIf="activeTab === 'author'" class="tab-body">
      <div class="about-card">
        <div class="about-title">Tabby to Gist Sync</div>
        <div class="about-version">v1.2.0</div>
        <p class="about-desc">
          A lightweight Tabby Terminal plugin that syncs your <code>config.yaml</code>
          to a private GitHub Gist, provides real-time server monitoring, and includes
          a built-in SSH Key Pair Generator.
        </p>

        <div class="about-features">
          <div class="about-feature-item">
            <i class="fas fa-sync-alt"></i>
            <div>
              <strong>Gist Config Sync</strong>
              <div class="about-feature-desc">Auto-sync config across devices via private GitHub Gist with Vault-secured PAT</div>
            </div>
          </div>
          <div class="about-feature-item">
            <i class="fas fa-satellite-dish"></i>
            <div>
              <strong>Server Monitoring</strong>
              <div class="about-feature-desc">Real-time CPU, memory, disk, network & uptime for multiple SSH servers — agentless, cross-platform</div>
            </div>
          </div>
          <div class="about-feature-item">
            <i class="fas fa-key"></i>
            <div>
              <strong>SSH Key Generator</strong>
              <div class="about-feature-desc">Generate Ed25519, ECDSA, RSA key pairs in OpenSSH format with one-click copy & export</div>
            </div>
          </div>
        </div>

        <div class="about-meta">
          <div><strong>Author:</strong> Tri Firdyanto</div>
          <div class="mt-2">
            <strong>Repository:</strong>
            <a href="https://github.com/firdyfirdy/tabby-to-gist" target="_blank">firdyfirdy/tabby-to-gist</a>
          </div>
        </div>
        <div class="about-footer">
          Uses Tabby's native Vault storage for secure token &amp; key management. Atomic file writes prevent config corruption. System SSH for maximum compatibility.
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Tabs ── */
    .tabs-holder {
      display: flex;
      border-bottom: 2px solid rgba(255,255,255,.08);
    }
    .tab-btn {
      padding: 10px 24px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: .3px;
      text-transform: uppercase;
      color: rgba(255,255,255,.4);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all .15s;
    }
    .tab-btn:hover { color: rgba(255,255,255,.7); }
    .tab-btn.active {
      color: #fff;
      border-bottom-color: var(--theme-fg-more, #4fc3f7);
    }

    /* ── Tab body ── */
    .tab-body { padding: 28px 0 0 0; }

    /* ── Sections ── */
    .section {
      margin-bottom: 36px;
      padding-bottom: 28px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    .section:last-child, .actions-section {
      border-bottom: none;
      margin-bottom: 0;
    }
    .section-header {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .section-desc {
      font-size: 12.5px;
      color: rgba(255,255,255,.45);
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .section-desc a { color: var(--theme-fg-more, #4fc3f7); }
    .section-desc code {
      background: rgba(255,255,255,.08);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11px;
    }

    /* ── Inputs ── */
    .input-row {
      display: flex;
      align-items: center;
      max-width: 480px;
    }
    .input-row .form-control { flex: 1; }
    .input-row.narrow { max-width: 160px; }
    .unit-label {
      font-size: 12px;
      color: rgba(255,255,255,.4);
      white-space: nowrap;
    }

    /* ── Status pills ── */
    .status-pill {
      display: inline-block;
      font-size: 11px;
      padding: 3px 12px;
      border-radius: 10px;
      margin-top: 10px;
    }
    .status-pill.success {
      background: rgba(76,175,80,.12);
      color: #81c784;
    }

    /* ── Toggle ── */
    .toggle-row { display: flex; align-items: center; }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      margin: 0;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255,255,255,.15);
      border-radius: 24px;
      transition: .2s;
    }
    .slider:before {
      content: "";
      position: absolute;
      height: 18px; width: 18px;
      left: 3px; bottom: 3px;
      background: #fff;
      border-radius: 50%;
      transition: .2s;
    }
    input:checked + .slider { background: #4caf50; }
    input:checked + .slider:before { transform: translateX(20px); }
    .toggle-label {
      margin-left: 10px;
      font-size: 13px;
      color: rgba(255,255,255,.4);
    }
    .toggle-label.on { color: #81c784; }

    /* ── Action buttons ── */
    .btn-row { display: flex; align-items: center; }

    /* ── Keygen ── */
    .keygen-controls {
      display: flex;
      align-items: center;
      max-width: 400px;
    }
    .keygen-select { flex: 1; }
    .key-block { margin-bottom: 8px; }
    .key-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .key-actions { display: flex; gap: 6px; }
    .btn-icon {
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 4px;
      color: rgba(255,255,255,.6);
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all .15s;
      font-size: 12px;
    }
    .btn-icon:hover {
      background: rgba(255,255,255,.15);
      color: #fff;
    }
    .btn-icon .fa-check { color: #81c784; }
    .key-textarea {
      width: 100%;
      background: rgba(0,0,0,.25);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      color: rgba(255,255,255,.8);
      font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      padding: 12px;
      resize: vertical;
      line-height: 1.5;
    }
    .key-textarea:focus { outline: none; border-color: rgba(255,255,255,.2); }

    /* ── Action result ── */
    .action-result {
      margin-top: 12px;
      font-size: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      background: rgba(76,175,80,.1);
      color: #81c784;
      max-width: 480px;
    }
    .action-result.error {
      background: rgba(244,67,54,.1);
      color: #ef9a9a;
    }

    /* ── About ── */
    .about-card {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      padding: 28px;
    }
    .about-title { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .about-version { font-size: 11px; color: rgba(255,255,255,.35); margin-bottom: 18px; }
    .about-desc {
      font-size: 13px;
      color: rgba(255,255,255,.6);
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .about-features {
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .about-feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 13px;
    }
    .about-feature-item > i {
      color: var(--theme-fg-more, #4fc3f7);
      font-size: 14px;
      margin-top: 2px;
      width: 18px;
      text-align: center;
      flex-shrink: 0;
    }
    .about-feature-item strong {
      color: rgba(255,255,255,.85);
    }
    .about-feature-desc {
      font-size: 11.5px;
      color: rgba(255,255,255,.45);
      margin-top: 2px;
      line-height: 1.4;
    }
    .about-meta { font-size: 13px; color: rgba(255,255,255,.7); }
    .about-meta a { color: var(--theme-fg-more, #4fc3f7); }
    .about-footer {
      margin-top: 20px;
      font-size: 11px;
      color: rgba(255,255,255,.3);
      font-style: italic;
    }
  `]
})
export class GistSettingsComponent implements OnInit {
  activeTab: 'sync' | 'keygen' | 'author' = 'sync'
  enabled = false
  gistId = ''
  pat = ''
  patSaved = false
  syncInterval = 20

  actionLoading = false
  actionType: 'pull' | 'push' | null = null
  actionResult = ''
  actionIsError = false

  // Keygen state
  selectedKeyType: KeyType = 'ed25519'
  generating = false
  generatedPrivateKey = ''
  generatedPublicKey = ''
  copiedPrivate = false
  copiedPublic = false

  constructor(
    private syncService: GistSyncService,
    private keygen: KeygenService,
    private platform: PlatformService,
  ) { }

  async ngOnInit(): Promise<void> {
    this.refreshConfig()
    this.patSaved = await this.syncService.hasToken()
  }

  refreshConfig(): void {
    const cfg = this.syncService.getPluginConfig()
    this.enabled = cfg.enabled
    this.gistId = cfg.gistId
    this.syncInterval = cfg.syncInterval
  }

  save(): void {
    this.syncService.savePluginConfig({
      enabled: this.enabled,
      gistId: this.gistId,
      syncInterval: this.syncInterval,
    })
  }

  async savePat(): Promise<void> {
    if (this.pat.trim()) {
      await this.syncService.saveToken(this.pat.trim())
      this.pat = ''
      this.patSaved = true
    }
  }

  async createGist(): Promise<void> {
    if (this.pat.trim()) {
      await this.savePat()
    }
    await this.syncService.createGist()
    this.refreshConfig()
  }

  async doPull(): Promise<void> {
    this.actionLoading = true
    this.actionType = 'pull'
    this.actionResult = ''
    const result = await this.syncService.startupPull()
    this.actionResult = result
    this.actionIsError = result.toLowerCase().includes('fail')
    this.actionLoading = false
  }

  async doPush(): Promise<void> {
    this.actionLoading = true
    this.actionType = 'push'
    this.actionResult = ''
    const result = await this.syncService.forcePush()
    this.actionResult = result
    this.actionIsError = result.toLowerCase().includes('fail')
    this.actionLoading = false
  }

  // ── Keygen ──

  generateKeys(): void {
    this.generating = true
    setTimeout(() => {
      const result = this.keygen.generate(this.selectedKeyType)
      this.generatedPrivateKey = result.privateKey
      this.generatedPublicKey = result.publicKey
      this.generating = false
    }, 50)
  }

  copyKey(which: 'private' | 'public'): void {
    const text = which === 'private' ? this.generatedPrivateKey : this.generatedPublicKey
    this.platform.setClipboard({ text })
    if (which === 'private') {
      this.copiedPrivate = true
      setTimeout(() => { this.copiedPrivate = false }, 2000)
    } else {
      this.copiedPublic = true
      setTimeout(() => { this.copiedPublic = false }, 2000)
    }
  }

  async exportKey(which: 'private' | 'public'): Promise<void> {
    const text = which === 'private' ? this.generatedPrivateKey : this.generatedPublicKey
    const defaultName = which === 'private' ? `id_${this.selectedKeyType}` : `id_${this.selectedKeyType}.pub`
    const data = Buffer.from(text, 'utf-8')
    try {
      const download = await this.platform.startDownload(defaultName, 0o600, data.length)
      if (download) {
        await download.write(data)
        download.close()
      }
    } catch (_) {
      // user cancelled
    }
  }
}
