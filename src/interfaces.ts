/** Configuration stored by the plugin (PAT is vault-only, not here) */
export interface GistSyncConfig {
    /** Private GitHub Gist ID */
    gistId: string
    /** Whether sync is active */
    enabled: boolean
    /** Stable device identifier (auto-generated on first run, stored in config) */
    deviceId: string
    /** Sync interval in seconds */
    syncInterval: number
}

/** Shape of the meta.json file stored inside the Gist */
export interface GistMeta {
    last_updated: string // ISO-8601
    device_id: string
}
