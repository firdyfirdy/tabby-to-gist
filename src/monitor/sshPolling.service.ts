// ---------------------------------------------------------------------------
// SshPollingService — manages concurrent SSH monitoring via child_process.
// Uses the system's `ssh` command to exec monitoring commands on each server.
// Decrypts vault-stored keys via Tabby's FileProvidersService.
// ---------------------------------------------------------------------------
import { Injectable } from '@angular/core'
import { ConfigService, FileProvidersService } from 'tabby-core'
import { BehaviorSubject } from 'rxjs'
import { MonitoredServer, ServerMetrics, MAX_HISTORY_LENGTH } from './interfaces'
import { parseCpu, parseMemory, parseDisk, parseNetDev, parseUptime } from './parsers'

const { spawn, execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

interface PollingHandle {
    profileName: string
    host: string
    port: number
    user: string
    keyPaths: string[]
    tempKeyFiles: string[]
    timer: ReturnType<typeof setInterval> | null
    polling: boolean
}

const MONITOR_CMD = [
    'top -bn1 | grep "Cpu" || top -bn1 | head -5',
    'free -m',
    'df -h /',
    'cat /proc/net/dev',
    'uptime -p 2>/dev/null || uptime',
].join(' && echo "---SEPARATOR---" && ')

@Injectable({ providedIn: 'root' })
export class SshPollingService {
    servers$ = new BehaviorSubject<Map<string, MonitoredServer>>(new Map())

    private handles = new Map<string, PollingHandle>()
    private pollIntervalMs = 3000

    constructor(
        private config: ConfigService,
        private fileProviders: FileProvidersService,
    ) { }

    /** Start monitoring — async because vault decryption is async */
    async addServer(profile: { name: string; host: string; port: number; user: string; password?: string; privateKey?: string }): Promise<void> {
        if (this.handles.has(profile.name)) {
            return
        }

        const server: MonitoredServer = {
            profileName: profile.name,
            host: profile.host,
            port: profile.port,
            user: profile.user,
            status: 'connecting',
            metrics: null,
            metricsHistory: [],
        }

        const map = new Map(this.servers$.value)
        map.set(profile.name, server)
        this.servers$.next(map)

        // Resolve keys — may decrypt vault entries
        let keyPaths: string[] = []
        let tempKeyFiles: string[] = []
        try {
            const result = await this.resolveKeyPaths(profile.name, profile.privateKey)
            keyPaths = result.keyPaths
            tempKeyFiles = result.tempKeyFiles
        } catch (e: any) {
            console.log(`[TabbyMonitor] Key resolution failed: ${e?.message}`)
        }

        const handle: PollingHandle = {
            profileName: profile.name,
            host: profile.host,
            port: profile.port,
            user: profile.user,
            keyPaths,
            tempKeyFiles,
            timer: null,
            polling: false,
        }

        this.handles.set(profile.name, handle)
        this.poll(handle)
        handle.timer = setInterval(() => this.poll(handle), this.pollIntervalMs)
    }

    removeServer(profileName: string): void {
        const handle = this.handles.get(profileName)
        if (handle) {
            if (handle.timer) {
                clearInterval(handle.timer)
            }
            for (const f of handle.tempKeyFiles) {
                try { fs.unlinkSync(f) } catch (_) { /* ignore */ }
            }
            this.handles.delete(profileName)
        }
        const map = new Map(this.servers$.value)
        map.delete(profileName)
        this.servers$.next(map)
    }

    stopAll(): void {
        for (const [name] of this.handles) {
            this.removeServer(name)
        }
    }

    /** Force an immediate refresh for a specific server */
    forceRefresh(profileName: string): void {
        const handle = this.handles.get(profileName)
        if (!handle) {
            return
        }
        // Reset polling timer and poll immediately
        if (handle.timer) {
            clearInterval(handle.timer)
        }
        this.poll(handle)
        handle.timer = setInterval(() => this.poll(handle), this.pollIntervalMs)
    }

    // ── Key Resolution ──────────────────────────────────────────────────

    private async resolveKeyPaths(profileName: string, passedKey?: string): Promise<{ keyPaths: string[]; tempKeyFiles: string[] }> {
        const keyPaths: string[] = []
        const tempKeyFiles: string[] = []

        const profiles: any[] = this.config.store?.profiles ?? []
        const found = profiles.find((p: any) => p.name === profileName && p.type === 'ssh')

        const rawKeys: string[] = []
        if (found?.options?.privateKeys?.length) {
            rawKeys.push(...found.options.privateKeys)
        }
        if (passedKey && !rawKeys.includes(passedKey)) {
            rawKeys.push(passedKey)
        }
        if (found?.options?.keyPaths?.length) {
            rawKeys.push(...found.options.keyPaths)
        }

        console.log(`[TabbyMonitor] Profile "${profileName}" — found ${rawKeys.length} raw key(s)`)

        for (const key of rawKeys) {
            if (!key) {
                continue
            }

            if (key.startsWith('vault://')) {
                // ── Vault-encrypted key: decrypt via FileProvidersService ──
                try {
                    console.log(`[TabbyMonitor] Decrypting vault key: ${key}`)
                    const keyBuffer: Buffer = await this.fileProviders.retrieveFile(key)
                    console.log(`[TabbyMonitor] Vault key size: ${keyBuffer.length} bytes, starts with: ${keyBuffer.slice(0, 30).toString('utf-8')}`)

                    const tmpFile = this.writeTempKey(keyBuffer)
                    if (tmpFile) {
                        keyPaths.push(tmpFile)
                        tempKeyFiles.push(tmpFile)
                        console.log(`[TabbyMonitor] Vault key decrypted → ${tmpFile}`)
                    }
                } catch (e: any) {
                    console.log(`[TabbyMonitor] Vault decrypt failed: ${e?.message}`)
                }
            } else if (key.includes('-----BEGIN') || key.includes('PRIVATE KEY')) {
                // ── Inline key content ──
                const tmpFile = this.writeTempKey(key)
                if (tmpFile) {
                    keyPaths.push(tmpFile)
                    tempKeyFiles.push(tmpFile)
                    console.log(`[TabbyMonitor] Inline key → ${tmpFile}`)
                }
            } else {
                // ── File path ──
                try {
                    if (fs.existsSync(key)) {
                        keyPaths.push(key)
                        console.log(`[TabbyMonitor] Key file: ${key}`)
                    } else {
                        console.log(`[TabbyMonitor] Key file not found: ${key}`)
                    }
                } catch (_) { /* skip */ }
            }
        }

        // Fallback: try default SSH keys in ~/.ssh/
        if (keyPaths.length === 0) {
            const homeDir = os.homedir()
            const defaultKeys = ['id_ed25519', 'id_rsa', 'id_ecdsa']
            for (const keyName of defaultKeys) {
                const keyFile = path.join(homeDir, '.ssh', keyName)
                try {
                    if (fs.existsSync(keyFile)) {
                        keyPaths.push(keyFile)
                        console.log(`[TabbyMonitor] Fallback key: ${keyFile}`)
                        break
                    }
                } catch (_) { /* skip */ }
            }
        }

        console.log(`[TabbyMonitor] Resolved ${keyPaths.length} key(s) for "${profileName}"`)
        return { keyPaths, tempKeyFiles }
    }

    /** Write key content to a temp file with proper permissions */
    private writeTempKey(content: Buffer | string): string | null {
        try {
            const tmpDir = os.tmpdir()
            const tmpFile = path.join(tmpDir, `tabby_monitor_key_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`)

            // Always normalize to LF line endings — OpenSSH rejects CRLF keys
            let keyStr = (Buffer.isBuffer(content) ? content.toString('utf-8') : content)
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
            // Ensure trailing newline — OpenSSH rejects keys without it
            if (!keyStr.endsWith('\n')) {
                keyStr += '\n'
            }
            fs.writeFileSync(tmpFile, keyStr, { encoding: 'utf-8', mode: 0o600 })

            // On Windows, fix ACLs so ssh doesn't reject the key
            if (process.platform === 'win32') {
                try {
                    const user = process.env.USERNAME || process.env.USER || ''
                    execSync(`icacls "${tmpFile}" /inheritance:r /grant:r "${user}:R"`, { stdio: 'ignore' })
                } catch (_) { /* best effort */ }
            }

            return tmpFile
        } catch (e: any) {
            console.log(`[TabbyMonitor] Failed to write temp key: ${e?.message}`)
            return null
        }
    }

    // ── Polling ─────────────────────────────────────────────────────────

    private poll(handle: PollingHandle): void {
        if (handle.polling) {
            return
        }
        handle.polling = true

        const args: string[] = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=8',
            '-o', 'BatchMode=yes',
        ]

        for (const keyPath of handle.keyPaths) {
            args.push('-i', keyPath)
        }

        if (handle.port !== 22) {
            args.push('-p', String(handle.port))
        }
        args.push(`${handle.user}@${handle.host}`)
        args.push(MONITOR_CMD)

        console.log(`[TabbyMonitor] SSH: ssh ${args.slice(0, -1).join(' ')} <cmd>`)

        const child = spawn('ssh', args)
        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
        child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

        child.on('close', (code: number) => {
            handle.polling = false
            if (code !== 0) {
                const errMsg = stderr.trim().split('\n')[0] || `SSH exit code ${code}`
                this.updateStatus(handle.profileName, 'error', errMsg)
                return
            }
            const metrics = this.parseOutput(stdout, handle.profileName)
            this.updateStatus(handle.profileName, 'connected')
            this.pushMetrics(handle.profileName, metrics)
        })

        child.on('error', (err: any) => {
            handle.polling = false
            this.updateStatus(handle.profileName, 'error', err?.message ?? 'Failed to launch ssh')
        })

        setTimeout(() => {
            if (handle.polling) {
                try { child.kill() } catch (_) { /* ignore */ }
            }
        }, 15000)
    }

    // ── Parsing ─────────────────────────────────────────────────────────

    private parseOutput(raw: string, profileName: string): ServerMetrics {
        const sections = raw.split('---SEPARATOR---')
        const cpu = parseCpu(sections[0] ?? '')
        const mem = parseMemory(sections[1] ?? '')
        const disk = parseDisk(sections[2] ?? '')
        const net = parseNetDev(sections[3] ?? '')
        const uptime = parseUptime(sections[4] ?? '')

        const prev = this.servers$.value.get(profileName)?.metrics
        let netRxRate = 0
        let netTxRate = 0
        if (prev && prev.netRxBytes > 0) {
            const elapsed = (Date.now() - prev.timestamp) / 1000
            if (elapsed > 0) {
                netRxRate = Math.round(((net.rxBytes - prev.netRxBytes) / elapsed) / 1024)
                netTxRate = Math.round(((net.txBytes - prev.netTxBytes) / elapsed) / 1024)
                if (netRxRate < 0) { netRxRate = 0 }
                if (netTxRate < 0) { netTxRate = 0 }
            }
        }

        return {
            cpu,
            memUsed: mem.used,
            memTotal: mem.total,
            memPercent: mem.total > 0 ? Math.round((mem.used / mem.total) * 100) : 0,
            diskUsed: disk.used,
            diskTotal: disk.total,
            diskPercent: disk.percent,
            netRxBytes: net.rxBytes,
            netTxBytes: net.txBytes,
            netRxRate,
            netTxRate,
            uptime,
            timestamp: Date.now(),
        }
    }

    private pushMetrics(profileName: string, metrics: ServerMetrics): void {
        const map = new Map(this.servers$.value)
        const existing = map.get(profileName)
        if (!existing) {
            return
        }
        const history = [...existing.metricsHistory, metrics]
        if (history.length > MAX_HISTORY_LENGTH) {
            history.shift()
        }
        map.set(profileName, { ...existing, metrics, metricsHistory: history, status: 'connected' })
        this.servers$.next(map)
    }

    private updateStatus(profileName: string, status: MonitoredServer['status'], errorMessage?: string): void {
        const map = new Map(this.servers$.value)
        const existing = map.get(profileName)
        if (!existing) {
            return
        }
        map.set(profileName, { ...existing, status, errorMessage })
        this.servers$.next(map)
    }
}
