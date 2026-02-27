import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { Injectable } from '@angular/core'

export interface KeyPairResult {
    privateKey: string
    publicKey: string
}

export type KeyType = 'ed25519' | 'ecdsa' | 'rsa'

@Injectable({ providedIn: 'root' })
export class KeygenService {

    generate(type: KeyType): KeyPairResult {
        const tmpDir = os.tmpdir()
        const keyFile = path.join(tmpDir, `tabby_keygen_${Date.now()}`)
        const pubFile = `${keyFile}.pub`

        try {
            // Build ssh-keygen command
            const args = this.buildArgs(type, keyFile)
            execSync(`ssh-keygen ${args}`, { stdio: 'pipe' })

            const privateKey = fs.readFileSync(keyFile, 'utf-8')
            const publicKey = fs.readFileSync(pubFile, 'utf-8')

            return { privateKey, publicKey }
        } finally {
            // Cleanup temp files
            try { fs.unlinkSync(keyFile) } catch (_) { /* ignore */ }
            try { fs.unlinkSync(pubFile) } catch (_) { /* ignore */ }
        }
    }

    private buildArgs(type: KeyType, keyFile: string): string {
        const base = `-f "${keyFile}" -N "" -q`

        switch (type) {
            case 'ed25519':
                return `-t ed25519 ${base}`
            case 'ecdsa':
                return `-t ecdsa -b 256 ${base}`
            case 'rsa':
                return `-t rsa -b 4096 ${base}`
        }
    }
}
