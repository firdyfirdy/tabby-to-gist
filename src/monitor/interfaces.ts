// ---------------------------------------------------------------------------
// Data models for the Server Monitor dashboard
// ---------------------------------------------------------------------------

export interface ServerMetrics {
    cpu: number            // Total CPU usage %
    memUsed: number        // Memory used in MB
    memTotal: number       // Memory total in MB
    memPercent: number     // Memory usage %
    diskUsed: string       // Disk used (human-readable, e.g., "12G")
    diskTotal: string      // Disk total (human-readable, e.g., "50G")
    diskPercent: number    // Disk usage %
    netRxBytes: number     // Network received bytes (current sample)
    netTxBytes: number     // Network transmitted bytes (current sample)
    netRxRate: number      // Network RX rate in KB/s
    netTxRate: number      // Network TX rate in KB/s
    uptime: string         // Uptime string (e.g., "5 days, 3:42")
    timestamp: number      // When this snapshot was taken
}

export interface MonitoredServer {
    profileName: string
    host: string
    port: number
    user: string
    status: 'connecting' | 'connected' | 'error' | 'disconnected'
    errorMessage?: string
    metrics: ServerMetrics | null
    metricsHistory: ServerMetrics[]   // Last N snapshots for sparkline
}

export const EMPTY_METRICS: ServerMetrics = {
    cpu: 0,
    memUsed: 0,
    memTotal: 0,
    memPercent: 0,
    diskUsed: '0',
    diskTotal: '0',
    diskPercent: 0,
    netRxBytes: 0,
    netTxBytes: 0,
    netRxRate: 0,
    netTxRate: 0,
    uptime: '—',
    timestamp: Date.now(),
}

export const MAX_HISTORY_LENGTH = 30
