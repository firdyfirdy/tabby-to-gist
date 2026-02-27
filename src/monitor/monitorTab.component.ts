// ---------------------------------------------------------------------------
// MonitorTabComponent — BaseTabComponent that renders the split-view
// monitoring dashboard.
// ---------------------------------------------------------------------------
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone, Injector } from '@angular/core'
import { BaseTabComponent, ConfigService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { SshPollingService } from './sshPolling.service'
import { MonitoredServer, ServerMetrics, MAX_HISTORY_LENGTH } from './interfaces'

@Component({
    selector: 'monitor-tab',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="monitor-root">
            <!-- ── TOOLBAR ── -->
            <div class="monitor-toolbar">
                <div class="toolbar-title">
                    <i class="fas fa-satellite-dish"></i>
                    Server Monitor
                </div>
                <div class="toolbar-actions">
                    <select class="form-control profile-select"
                            [(ngModel)]="selectedProfile"
                            *ngIf="availableProfiles.length">
                        <option value="" disabled>Select SSH Profile…</option>
                        <option *ngFor="let p of availableProfiles" [value]="p.name">
                            {{ p.name }}
                        </option>
                    </select>
                    <button class="btn btn-primary btn-sm ml-2"
                            (click)="addSelectedProfile()"
                            [disabled]="!selectedProfile">
                        <i class="fas fa-plus"></i> Add
                    </button>
                </div>
            </div>

            <!-- ── EMPTY STATE ── -->
            <div class="monitor-empty" *ngIf="servers.length === 0">
                <i class="fas fa-server empty-icon"></i>
                <div class="empty-title">No servers being monitored</div>
                <div class="empty-desc">Select an SSH profile above to start monitoring.</div>
            </div>

            <!-- ── GRID ── -->
            <div class="monitor-grid" [class.layout-1]="servers.length === 1"
                 [class.layout-2]="servers.length === 2"
                 [class.layout-3]="servers.length === 3"
                 [class.layout-4]="servers.length >= 4">
                <div class="server-card" *ngFor="let s of servers; let i = index; trackBy: trackByName"
                     [class.span-full]="servers.length === 3 && i === 2">
                    <!-- Card Header -->
                    <div class="card-header" [class.error]="s.status === 'error'"
                         [class.connecting]="s.status === 'connecting'">
                        <div class="card-title-row">
                            <span class="status-dot" [class.online]="s.status === 'connected'"
                                  [class.offline]="s.status === 'error'"
                                  [class.pending]="s.status === 'connecting'"></span>
                            <span class="card-name">{{ s.profileName }}</span>
                            <span class="card-host">{{ s.user }}@{{ s.host }}:{{ s.port }}</span>
                        </div>
                        <div class="card-header-actions">
                            <button class="btn-header-action" (click)="refreshServer(s.profileName)" title="Refresh now">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn-header-action btn-copy" *ngIf="s.status === 'error'" (click)="copyError(s.errorMessage || 'Connection failed')" title="Copy error">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="btn-header-action btn-remove" (click)="removeServer(s.profileName)" title="Remove">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Connecting / Error State -->
                    <div class="card-body-status" *ngIf="s.status !== 'connected'">
                        <div *ngIf="s.status === 'connecting'" class="status-msg connecting-msg">
                            <i class="fas fa-circle-notch fa-spin"></i> Connecting…
                        </div>
                        <div *ngIf="s.status === 'error'" class="status-msg error-msg">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span class="error-text">{{ s.errorMessage || 'Connection failed' }}</span>
                        </div>
                    </div>

                    <!-- Metrics -->
                    <div class="card-body" *ngIf="s.status === 'connected' && s.metrics">
                        <!-- CPU -->
                        <div class="metric-row">
                            <div class="metric-header">
                                <i class="fas fa-microchip metric-icon cpu-icon"></i>
                                <span class="metric-label">CPU</span>
                                <span class="metric-value" [class.warn]="s.metrics.cpu > 70" [class.crit]="s.metrics.cpu > 90">
                                    {{ s.metrics.cpu }}%
                                </span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill cpu-fill"
                                     [style.width.%]="s.metrics.cpu"
                                     [class.warn]="s.metrics.cpu > 70"
                                     [class.crit]="s.metrics.cpu > 90"></div>
                            </div>
                            <div class="sparkline-container">
                                <svg class="sparkline" viewBox="0 0 120 24" preserveAspectRatio="none">
                                    <polyline [attr.points]="getSparklinePoints(s.metricsHistory, 'cpu')"
                                              class="spark-line cpu-spark" />
                                </svg>
                            </div>
                        </div>

                        <!-- Memory -->
                        <div class="metric-row">
                            <div class="metric-header">
                                <i class="fas fa-memory metric-icon mem-icon"></i>
                                <span class="metric-label">Memory</span>
                                <span class="metric-value" [class.warn]="s.metrics.memPercent > 70" [class.crit]="s.metrics.memPercent > 90">
                                    {{ formatMB(s.metrics.memUsed) }} / {{ formatMB(s.metrics.memTotal) }}
                                    <small>({{ s.metrics.memPercent }}%)</small>
                                </span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill mem-fill"
                                     [style.width.%]="s.metrics.memPercent"
                                     [class.warn]="s.metrics.memPercent > 70"
                                     [class.crit]="s.metrics.memPercent > 90"></div>
                            </div>
                            <div class="sparkline-container">
                                <svg class="sparkline" viewBox="0 0 120 24" preserveAspectRatio="none">
                                    <polyline [attr.points]="getSparklinePoints(s.metricsHistory, 'memPercent')"
                                              class="spark-line mem-spark" />
                                </svg>
                            </div>
                        </div>

                        <!-- Disk -->
                        <div class="metric-row">
                            <div class="metric-header">
                                <i class="fas fa-hdd metric-icon disk-icon"></i>
                                <span class="metric-label">Disk /</span>
                                <span class="metric-value" [class.warn]="s.metrics.diskPercent > 70" [class.crit]="s.metrics.diskPercent > 90">
                                    {{ s.metrics.diskUsed }} / {{ s.metrics.diskTotal }}
                                    <small>({{ s.metrics.diskPercent }}%)</small>
                                </span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill disk-fill"
                                     [style.width.%]="s.metrics.diskPercent"
                                     [class.warn]="s.metrics.diskPercent > 70"
                                     [class.crit]="s.metrics.diskPercent > 90"></div>
                            </div>
                        </div>

                        <!-- Network -->
                        <div class="metric-row">
                            <div class="metric-header">
                                <i class="fas fa-network-wired metric-icon net-icon"></i>
                                <span class="metric-label">Network</span>
                                <span class="metric-value">
                                    <span class="net-rx">▼ {{ s.metrics.netRxRate }} KB/s</span>
                                    <span class="net-tx">▲ {{ s.metrics.netTxRate }} KB/s</span>
                                </span>
                            </div>
                            <div class="sparkline-container dual">
                                <svg class="sparkline" viewBox="0 0 120 24" preserveAspectRatio="none">
                                    <polyline [attr.points]="getNetSparklinePoints(s.metricsHistory, 'netRxRate')"
                                              class="spark-line rx-spark" />
                                    <polyline [attr.points]="getNetSparklinePoints(s.metricsHistory, 'netTxRate')"
                                              class="spark-line tx-spark" />
                                </svg>
                            </div>
                        </div>

                        <!-- Uptime -->
                        <div class="metric-row uptime-row">
                            <div class="metric-header">
                                <i class="fas fa-clock metric-icon uptime-icon"></i>
                                <span class="metric-label">Uptime</span>
                                <span class="metric-value uptime-value">{{ s.metrics.uptime }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        /* ── Root ── */
        :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .monitor-root {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #0d1117;
            color: #c9d1d9;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            overflow: hidden;
        }

        /* ── Toolbar ── */
        .monitor-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: linear-gradient(135deg, #161b22 0%, #1c2333 100%);
            border-bottom: 1px solid rgba(255,255,255,.06);
            flex-shrink: 0;
        }
        .toolbar-title {
            font-size: 16px;
            font-weight: 700;
            letter-spacing: .5px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .toolbar-title i { color: #58a6ff; font-size: 18px; }
        .toolbar-actions { display: flex; align-items: center; }
        .profile-select {
            width: 240px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            color: #c9d1d9;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 13px;
        }
        .profile-select option { background: #1c2333; color: #c9d1d9; }

        /* ── Empty state ── */
        .monitor-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: rgba(255,255,255,.3);
        }
        .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: .4; }
        .empty-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
        .empty-desc { font-size: 13px; }

        /* ── Grid ── */
        .monitor-grid {
            flex: 1;
            display: grid;
            gap: 12px;
            padding: 12px 16px;
            overflow-y: auto;
        }
        /* 1 card — full */
        .monitor-grid.layout-1 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr;
        }
        /* 2 cards — stacked vertical */
        .monitor-grid.layout-2 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
        }
        /* 3 cards — 2 top, 1 spanning bottom */
        .monitor-grid.layout-3 {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
        }
        .server-card.span-full {
            grid-column: 1 / -1;
        }
        /* 4 cards — 2×2 */
        .monitor-grid.layout-4 {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
        }

        /* ── Card ── */
        .server-card {
            background: linear-gradient(145deg, #161b22 0%, #1a1f2e 100%);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 10px;
            overflow: hidden;
            transition: border-color .2s, box-shadow .2s;
        }
        .server-card:hover {
            border-color: rgba(88,166,255,.2);
            box-shadow: 0 0 20px rgba(88,166,255,.05);
        }

        /* Card Header */
        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: rgba(255,255,255,.02);
            border-bottom: 1px solid rgba(255,255,255,.04);
        }
        .card-header.error { border-bottom-color: rgba(248,81,73,.15); }
        .card-header.connecting { border-bottom-color: rgba(210,153,34,.15); }
        .card-title-row { display: flex; align-items: center; gap: 8px; overflow: hidden; }
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
            background: #484f58;
        }
        .status-dot.online { background: #3fb950; box-shadow: 0 0 6px rgba(63,185,80,.4); }
        .status-dot.offline { background: #f85149; box-shadow: 0 0 6px rgba(248,81,73,.4); }
        .status-dot.pending { background: #d29922; animation: pulse-dot 1.5s infinite; }
        @keyframes pulse-dot {
            0%, 100% { opacity: 1; }
            50% { opacity: .4; }
        }
        .card-name {
            font-weight: 600; font-size: 13px; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis;
        }
        .card-host {
            font-size: 11px; color: rgba(255,255,255,.35);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .card-header-actions {
            display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: auto;
        }
        .btn-header-action {
            background: transparent; border: none; color: rgba(255,255,255,.25);
            cursor: pointer; padding: 4px 6px; border-radius: 4px;
            transition: all .15s; font-size: 12px;
        }
        .btn-header-action:hover { color: rgba(255,255,255,.7); background: rgba(255,255,255,.06); }
        .btn-header-action.btn-remove:hover { color: #f85149; background: rgba(248,81,73,.1); }
        .btn-header-action.btn-copy:hover { color: #58a6ff; background: rgba(88,166,255,.1); }

        /* Card Body Status */
        .card-body-status {
            padding: 40px 16px;
            display: flex; align-items: center; justify-content: center;
        }
        .status-msg { font-size: 13px; display: flex; align-items: center; gap: 8px; max-width: 100%; }
        .connecting-msg { color: #d29922; }
        .error-msg { color: #f85149; flex-wrap: wrap; }
        .error-text {
            user-select: text; cursor: text;
            word-break: break-all; flex: 1; min-width: 0;
        }

        /* Card Body Metrics */
        .card-body { padding: 14px 16px 16px; }

        /* ── Metric Row ── */
        .metric-row {
            margin-bottom: 14px;
        }
        .metric-row:last-child { margin-bottom: 0; }
        .metric-header {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            font-size: 12px;
        }
        .metric-icon {
            width: 16px; text-align: center;
            margin-right: 8px; font-size: 11px;
        }
        .cpu-icon { color: #58a6ff; }
        .mem-icon { color: #bc8cff; }
        .disk-icon { color: #f0883e; }
        .net-icon { color: #3fb950; }
        .uptime-icon { color: #79c0ff; }

        .metric-label {
            font-weight: 500; color: rgba(255,255,255,.7);
            margin-right: auto;
        }
        .metric-value {
            font-family: 'Cascadia Code', 'Fira Code', monospace;
            font-size: 12px;
            color: rgba(255,255,255,.85);
        }
        .metric-value.warn { color: #d29922; }
        .metric-value.crit { color: #f85149; }
        .metric-value small {
            font-size: 10px;
            color: rgba(255,255,255,.45);
            margin-left: 2px;
        }

        .net-rx { color: #3fb950; margin-right: 10px; }
        .net-tx { color: #58a6ff; }
        .uptime-value { color: #79c0ff; }

        /* ── Progress Bar ── */
        .progress-track {
            height: 4px;
            background: rgba(255,255,255,.06);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 4px;
        }
        .progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width .6s ease;
        }
        .cpu-fill { background: linear-gradient(90deg, #58a6ff, #388bfd); }
        .mem-fill { background: linear-gradient(90deg, #bc8cff, #a371f7); }
        .disk-fill { background: linear-gradient(90deg, #f0883e, #db6d28); }
        .progress-fill.warn { background: linear-gradient(90deg, #d29922, #bb8009) !important; }
        .progress-fill.crit { background: linear-gradient(90deg, #f85149, #da3633) !important; }

        /* ── Sparkline ── */
        .sparkline-container {
            height: 24px;
            margin-top: 2px;
        }
        .sparkline {
            width: 100%;
            height: 100%;
        }
        .spark-line {
            fill: none;
            stroke-width: 1.5;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .cpu-spark { stroke: rgba(88,166,255,.5); }
        .mem-spark { stroke: rgba(188,140,255,.5); }
        .rx-spark { stroke: rgba(63,185,80,.5); }
        .tx-spark { stroke: rgba(88,166,255,.4); stroke-dasharray: 3 2; }

        .uptime-row .metric-header { margin-bottom: 0; }

        /* ── Scrollbar ── */
        .monitor-grid::-webkit-scrollbar { width: 6px; }
        .monitor-grid::-webkit-scrollbar-track { background: transparent; }
        .monitor-grid::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,.1); border-radius: 3px;
        }
        .monitor-grid::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.2); }
    `],
})
export class MonitorTabComponent extends BaseTabComponent implements OnInit, OnDestroy {
    servers: MonitoredServer[] = []
    availableProfiles: { name: string; host: string; port: number; user: string; password?: string; privateKey?: string }[] = []
    selectedProfile = ''

    private sub: Subscription | null = null

    constructor(
        private polling: SshPollingService,
        private configService: ConfigService,
        private cdr: ChangeDetectorRef,
        private zone: NgZone,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('Server Monitor')
    }

    ngOnInit(): void {
        this.loadAvailableProfiles()
        this.sub = this.polling.servers$.subscribe(map => {
            this.zone.run(() => {
                this.servers = Array.from(map.values())
                this.cdr.markForCheck()
            })
        })
    }

    ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe()
        }
        this.polling.stopAll()
    }

    loadAvailableProfiles(): void {
        const profiles: any[] = this.configService.store?.profiles ?? []
        this.availableProfiles = profiles
            .filter((p: any) => p.type === 'ssh')
            .map((p: any) => ({
                name: p.name,
                host: p.options?.host ?? '',
                port: p.options?.port ?? 22,
                user: p.options?.user ?? 'root',
                password: p.options?.password,
                privateKey: p.options?.privateKeys?.[0],
            }))
    }

    addSelectedProfile(): void {
        const profile = this.availableProfiles.find(p => p.name === this.selectedProfile)
        if (profile) {
            this.polling.addServer(profile)
            this.selectedProfile = ''
        }
    }

    removeServer(name: string): void {
        this.polling.removeServer(name)
    }

    refreshServer(name: string): void {
        this.polling.forceRefresh(name)
    }

    copyError(msg: string): void {
        try {
            const { clipboard } = require('electron')
            clipboard.writeText(msg)
        } catch (_) {
            // Electron clipboard unavailable — ignore
        }
    }

    trackByName(_: number, item: MonitoredServer): string {
        return item.profileName
    }

    // ── Sparkline Helpers ──

    getSparklinePoints(history: ServerMetrics[], key: 'cpu' | 'memPercent'): string {
        if (!history.length) {
            return ''
        }
        const maxPoints = MAX_HISTORY_LENGTH
        const w = 120
        const h = 24
        const padding = 1
        const step = w / (maxPoints - 1 || 1)

        return history.map((m, i) => {
            const val = m[key] as number
            const x = i * step
            const y = h - padding - ((val / 100) * (h - padding * 2))
            return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
    }

    getNetSparklinePoints(history: ServerMetrics[], key: 'netRxRate' | 'netTxRate'): string {
        if (!history.length) {
            return ''
        }
        const maxPoints = MAX_HISTORY_LENGTH
        const w = 120
        const h = 24
        const padding = 1
        const step = w / (maxPoints - 1 || 1)

        // Find max rate for normalisation
        let maxVal = 1
        for (const m of history) {
            const v = m[key] as number
            if (v > maxVal) {
                maxVal = v
            }
        }

        return history.map((m, i) => {
            const val = m[key] as number
            const x = i * step
            const y = h - padding - ((val / maxVal) * (h - padding * 2))
            return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
    }

    formatMB(mb: number): string {
        if (mb >= 1024) {
            return (mb / 1024).toFixed(1) + ' GB'
        }
        return mb + ' MB'
    }
}
