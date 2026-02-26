import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Injectable } from '@angular/core'
import { Octokit } from '@octokit/rest'
import { v4 as uuidv4 } from 'uuid'
import {
    ConfigService,
    NotificationsService,
    VaultService,
    VaultSecret,
} from 'tabby-core'
import type { GistMeta, GistSyncConfig } from './interfaces'

const CONFIG_FILENAME = 'config.yaml'
const META_FILENAME = 'meta.json'
const VAULT_SECRET_TYPE = 'tabby-to-gist'
const VAULT_SECRET_KEY = { id: 'github-pat' }
const DEBOUNCE_MS = 3000

function getTabbyConfigDir(): string {
    const base = process.env.APPDATA ?? path.join(os.homedir(), '.config')
    return path.join(base, 'tabby')
}

@Injectable({ providedIn: 'root' })
export class GistSyncService {
    private octokit: Octokit | null = null
    private pushTimer: ReturnType<typeof setTimeout> | null = null
    private syncLoopTimer: ReturnType<typeof setInterval> | null = null
    private readonly configDir: string = getTabbyConfigDir()

    constructor(
        private config: ConfigService,
        private notifications: NotificationsService,
        private vault: VaultService,
    ) { }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    /** Called once on app startup, or manually. Returns a status message. */
    async startupPull(): Promise<string> {
        const cfg = this.getPluginConfig()

        // Start the background sync loop right away if enabled
        this.restartSyncLoop()

        if (!cfg.enabled && !cfg.gistId) return 'Sync is not configured.'
        if (!cfg.gistId) return 'No Gist ID configured.'

        const token = await this.getToken()
        if (!token) {
            this.notifications.error('[tabby-to-gist] No PAT found in vault.')
            return 'No PAT found in vault.'
        }

        this.octokit = new Octokit({ auth: token })

        try {
            const { data: gist } = await this.octokit.gists.get({ gist_id: cfg.gistId })
            const remoteMeta = this.parseGistMeta(gist)
            const localMeta = this.readLocalMeta()

            if (!remoteMeta) return 'Remote Gist has no meta yet. Push first.'

            const remoteTs = new Date(remoteMeta.last_updated).getTime()
            const localTs = localMeta ? new Date(localMeta.last_updated).getTime() : 0

            if (remoteTs > localTs) {
                const remoteConfigContent = gist.files?.[CONFIG_FILENAME]?.content
                if (!remoteConfigContent) return 'Remote config file is empty.'

                this.atomicWrite(path.join(this.configDir, CONFIG_FILENAME), remoteConfigContent)
                this.writeLocalMeta(remoteMeta)
                await this.config.load()
                this.notifications.info('[tabby-to-gist] Config pulled from Gist.')
                return 'Pull successful. Config updated from Gist.'
            } else {
                return 'Local config is already up to date.'
            }
        } catch (err: unknown) {
            const msg = `Pull failed: ${String(err)}`
            this.notifications.error(`[tabby-to-gist] ${msg}`)
            return msg
        }
    }

    /** Schedules a debounced push. Call this on every config change. */
    schedulePush(): void {
        const cfg = this.getPluginConfig()
        this.restartSyncLoop() // Refresh interval if config changed

        if (!cfg.enabled || !cfg.gistId) return

        if (this.pushTimer) clearTimeout(this.pushTimer)
        this.pushTimer = setTimeout(() => void this.push(cfg), DEBOUNCE_MS)
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private restartSyncLoop(): void {
        if (this.syncLoopTimer) {
            clearInterval(this.syncLoopTimer)
            this.syncLoopTimer = null
        }

        const cfg = this.getPluginConfig()
        if (!cfg.enabled || !cfg.gistId) return

        // Interval is in seconds, convert to MS
        const intervalMs = Math.max(5, cfg.syncInterval) * 1000
        this.syncLoopTimer = setInterval(() => {
            // Background sync pull. (We do a pull. If there's new data, it updates locally. 
            // The push is handled by config change debounce).
            void this.backgroundPull(cfg)
        }, intervalMs)
    }

    private async backgroundPull(cfg: GistSyncConfig): Promise<void> {
        const token = await this.getToken()
        if (!token) return

        if (!this.octokit) this.octokit = new Octokit({ auth: token })

        try {
            const { data: gist } = await this.octokit.gists.get({ gist_id: cfg.gistId })
            const remoteMeta = this.parseGistMeta(gist)
            if (!remoteMeta) return

            const localMeta = this.readLocalMeta()
            const remoteTs = new Date(remoteMeta.last_updated).getTime()
            const localTs = localMeta ? new Date(localMeta.last_updated).getTime() : 0

            if (remoteTs > localTs) {
                const remoteConfigContent = gist.files?.[CONFIG_FILENAME]?.content
                if (remoteConfigContent) {
                    this.atomicWrite(path.join(this.configDir, CONFIG_FILENAME), remoteConfigContent)
                    this.writeLocalMeta(remoteMeta)
                    await this.config.load()
                    this.notifications.info('[tabby-to-gist] Config auto-synced from remote background check.')
                }
            }
        } catch (_) { // Silent fail for background tasks
            // ignore
        }
    }

    private async push(cfg: GistSyncConfig): Promise<string> {
        const token = await this.getToken()
        if (!token) return 'No PAT found.'

        if (!this.octokit) this.octokit = new Octokit({ auth: token })

        try {
            const configContent = fs.readFileSync(
                path.join(this.configDir, CONFIG_FILENAME),
                'utf-8',
            )
            const meta: GistMeta = {
                last_updated: new Date().toISOString(),
                device_id: cfg.deviceId,
            }

            await this.octokit.gists.update({
                gist_id: cfg.gistId,
                files: {
                    [CONFIG_FILENAME]: { content: configContent },
                    [META_FILENAME]: { content: JSON.stringify(meta, null, 2) },
                },
            })

            this.writeLocalMeta(meta)
            this.notifications.info('[tabby-to-gist] Config pushed to Gist.')
            return 'Push successful. Config uploaded to Gist.'
        } catch (err: unknown) {
            const msg = `Push failed: ${String(err)}`
            this.notifications.error(`[tabby-to-gist] ${msg}`)
            return msg
        }
    }

    /** Manual push — returns a status message */
    async forcePush(): Promise<string> {
        const cfg = this.getPluginConfig()
        if (!cfg.gistId) return 'No Gist ID configured.'
        return this.push(cfg)
    }

    async createGist(): Promise<void> {
        const token = await this.getToken()
        if (!token) {
            this.notifications.error('[tabby-to-gist] Please save your PAT first.')
            return
        }

        this.octokit = new Octokit({ auth: token })

        try {
            const configContent = fs.readFileSync(path.join(this.configDir, CONFIG_FILENAME), 'utf-8')
            const meta: GistMeta = {
                last_updated: new Date().toISOString(),
                device_id: this.getPluginConfig().deviceId,
            }

            const { data: gist } = await this.octokit.gists.create({
                description: 'Tabby Terminal Configuration Backup',
                public: false,
                files: {
                    [CONFIG_FILENAME]: { content: configContent },
                    [META_FILENAME]: { content: JSON.stringify(meta, null, 2) },
                },
            })

            if (gist.id) {
                this.savePluginConfig({ gistId: gist.id })
                this.notifications.info(`[tabby-to-gist] Created new private Gist: ${gist.id}`)
            }
        } catch (err: unknown) {
            this.notifications.error(`[tabby-to-gist] Failed to create Gist: ${String(err)}`)
        }
    }

    getPluginConfig(): GistSyncConfig {
        const stored = this.config.store?.['tabbyToGist'] as Partial<GistSyncConfig> | undefined
        return {
            gistId: stored?.gistId ?? '',
            enabled: stored?.enabled ?? false,
            deviceId: stored?.deviceId ?? this.ensureDeviceId(),
            syncInterval: stored?.syncInterval ?? 20,
        }
    }

    savePluginConfig(partial: Partial<GistSyncConfig>): void {
        if (!this.config.store['tabbyToGist']) this.config.store['tabbyToGist'] = {}
        Object.assign(this.config.store['tabbyToGist'], partial)
        this.config.save()
    }

    private ensureDeviceId(): string {
        const id = uuidv4()
        this.savePluginConfig({ deviceId: id })
        return id
    }

    /** Check if a PAT exists in vault (used by UI to show saved state) */
    async hasToken(): Promise<boolean> {
        const token = await this.getToken()
        return token !== null && token.length > 0
    }

    private async getToken(): Promise<string | null> {
        try {
            const secret = await this.vault.getSecret(VAULT_SECRET_TYPE, VAULT_SECRET_KEY)
            return secret?.value ?? null
        } catch {
            return null
        }
    }

    /** Store PAT in vault — called from the settings component */
    async saveToken(token: string): Promise<void> {
        const secret: VaultSecret = {
            type: VAULT_SECRET_TYPE,
            key: VAULT_SECRET_KEY,
            value: token,
        }

        const existing = await this.vault.getSecret(VAULT_SECRET_TYPE, VAULT_SECRET_KEY)
        if (existing) {
            await this.vault.updateSecret(existing, secret)
        } else {
            await this.vault.addSecret(secret)
        }

        // Reset octokit so it picks up the new token on next operation
        this.octokit = null
    }

    /** Atomic file write: write to a temp path then rename */
    private atomicWrite(targetPath: string, content: string): void {
        const tmpPath = `${targetPath}.tmp`
        fs.writeFileSync(tmpPath, content, 'utf-8')
        fs.renameSync(tmpPath, targetPath)
    }

    private readLocalMeta(): GistMeta | null {
        const metaPath = path.join(this.configDir, META_FILENAME)
        if (!fs.existsSync(metaPath)) return null
        try {
            return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as GistMeta
        } catch {
            return null
        }
    }

    private writeLocalMeta(meta: GistMeta): void {
        const metaPath = path.join(this.configDir, META_FILENAME)
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    }

    private parseGistMeta(gist: { files?: Record<string, { content?: string } | null> }): GistMeta | null {
        const content = gist.files?.[META_FILENAME]?.content
        if (!content) return null
        try {
            return JSON.parse(content) as GistMeta
        } catch {
            return null
        }
    }
}
