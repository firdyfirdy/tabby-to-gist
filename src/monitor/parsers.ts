// ---------------------------------------------------------------------------
// Robust regex-based parsers for common Linux command outputs.
// Handles variations across Debian, Ubuntu, RHEL, Alpine, etc.
// ---------------------------------------------------------------------------

/**
 * Parses `top -bn1 | grep "Cpu(s)"` or `top -bn1 | head -5`
 * Extracts total CPU usage percentage.
 *
 * Example outputs:
 *   Debian:  "%Cpu(s):  2.3 us,  0.7 sy,  0.0 ni, 96.7 id,  0.3 wa, ..."
 *   Alpine:  "CPU:   2% usr   0% sys   0% nic  97% idle   0% io ..."
 */
export function parseCpu(output: string): number {
    // Strategy 1: Match idle% from "%Cpu(s):" line → CPU = 100 - idle
    const idleMatch = output.match(
        /Cpu\(s\).*?(\d+\.?\d*)\s*(?:id|idle)/i,
    )
    if (idleMatch) {
        return Math.round((100 - parseFloat(idleMatch[1])) * 10) / 10
    }

    // Strategy 2: Alpine-style "CPU:  97% idle"
    const alpineIdle = output.match(/CPU:.*?(\d+)%\s*idle/i)
    if (alpineIdle) {
        return 100 - parseInt(alpineIdle[1], 10)
    }

    // Strategy 3: If we can find "us" and "sy" percentages, sum them
    const usMatch = output.match(/(\d+\.?\d*)\s*(?:%\s*)?us/i)
    const syMatch = output.match(/(\d+\.?\d*)\s*(?:%\s*)?sy/i)
    if (usMatch && syMatch) {
        return Math.round((parseFloat(usMatch[1]) + parseFloat(syMatch[1])) * 10) / 10
    }

    return 0
}

/**
 * Parses `free -m` output.
 * Returns { used, total } in MB.
 *
 * Example:
 *               total   used   free   shared  buff/cache  available
 *   Mem:         7976   1234   4567      123        2175       6456
 */
export function parseMemory(output: string): { used: number; total: number } {
    const memLine = output.match(
        /Mem:\s+(\d+)\s+(\d+)/i,
    )
    if (memLine) {
        const total = parseInt(memLine[1], 10)
        const used = parseInt(memLine[2], 10)
        return { used, total }
    }
    return { used: 0, total: 0 }
}

/**
 * Parses `df -h /` output.
 * Returns { used, total, percent }.
 *
 * Example:
 *   Filesystem      Size  Used Avail Use% Mounted on
 *   /dev/sda1        50G   12G   35G  26% /
 */
export function parseDisk(output: string): { used: string; total: string; percent: number } {
    const lines = output.trim().split('\n')
    // Find the line containing "/" mount point (skip header)
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/)
        // Typical columns: Filesystem Size Used Avail Use% Mounted
        if (parts.length >= 5) {
            const mountedOn = parts[parts.length - 1]
            if (mountedOn === '/') {
                const total = parts[1]
                const used = parts[2]
                const percentStr = parts[4].replace('%', '')
                return { used, total, percent: parseInt(percentStr, 10) || 0 }
            }
        }
    }
    // Fallback: parse the second line regardless of mount point
    if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/)
        if (parts.length >= 5) {
            const total = parts[1]
            const used = parts[2]
            const percentStr = parts[4].replace('%', '')
            return { used, total, percent: parseInt(percentStr, 10) || 0 }
        }
    }
    return { used: '0', total: '0', percent: 0 }
}

/**
 * Parses `cat /proc/net/dev` output.
 * Returns total RX and TX bytes across all non-loopback interfaces.
 *
 * Example:
 *   Inter-|   Receive ...
 *    face |bytes    packets ...
 *     lo:  123456    789 ...
 *   eth0: 9876543   4567 ...
 */
export function parseNetDev(output: string): { rxBytes: number; txBytes: number } {
    let rxBytes = 0
    let txBytes = 0
    const lines = output.trim().split('\n')

    for (const line of lines) {
        const match = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
        if (match) {
            const iface = match[1]
            if (iface === 'lo') {
                continue // skip loopback
            }
            rxBytes += parseInt(match[2], 10)
            txBytes += parseInt(match[3], 10)
        }
    }

    return { rxBytes, txBytes }
}

/**
 * Parses `uptime -p` or `uptime` output.
 *
 * Example:
 *   `uptime -p`:  "up 5 days, 3 hours, 42 minutes"
 *   `uptime`:     " 10:42:01 up 5 days,  3:42,  2 users,  load average: 0.01, ..."
 */
export function parseUptime(output: string): string {
    // Strategy 1: `uptime -p` output
    const prettyMatch = output.match(/up\s+(.+)/i)
    if (prettyMatch) {
        let result = prettyMatch[1].trim()
        // Clean trailing load average info if present
        const loadIdx = result.indexOf('load average')
        if (loadIdx > -1) {
            result = result.substring(0, loadIdx).replace(/,\s*\d+\s*users?,?\s*$/, '').trim()
        }
        // Remove trailing comma
        result = result.replace(/,\s*$/, '')
        return result || '—'
    }
    return '—'
}
