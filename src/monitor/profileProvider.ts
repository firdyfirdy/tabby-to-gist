// ---------------------------------------------------------------------------
// MonitorProfileProvider — Adds "Server Monitoring" to Tabby's
// "Profiles & Connections" modal.
// ---------------------------------------------------------------------------
import { Injectable } from '@angular/core'
import { ProfileProvider, NewTabParameters, PartialProfile, Profile } from 'tabby-core'
import { MonitorTabComponent } from './monitorTab.component'

export interface MonitorProfile extends Profile {
    type: 'server-monitor'
}

@Injectable()
export class MonitorProfileProvider extends ProfileProvider<MonitorProfile> {
    id = 'server-monitor'
    name = 'Server Monitoring'
    settingsComponent = undefined

    configDefaults = {
        options: {},
    }

    async getBuiltinProfiles(): Promise<PartialProfile<MonitorProfile>[]> {
        return [{
            id: 'server-monitor-dashboard',
            type: 'server-monitor',
            name: 'Server Monitoring',
            icon: 'fas fa-satellite-dish',
            options: {},
            isBuiltin: true,
        }]
    }

    async getNewTabParameters(_profile: MonitorProfile): Promise<NewTabParameters<MonitorTabComponent>> {
        return {
            type: MonitorTabComponent,
            inputs: {},
        }
    }

    getDescription(_profile: PartialProfile<MonitorProfile>): string {
        return 'Real-time server monitoring dashboard'
    }
}
