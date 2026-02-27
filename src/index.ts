import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { AppService, ConfigService, ConfigProvider, ProfileProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { GistSyncService } from './gistSync.service'
import { GistSettingsComponent } from './settings.component'
import { GistSyncSettingsTabProvider } from './settings-tab.provider'
import { MonitorTabComponent } from './monitor/monitorTab.component'
import { MonitorProfileProvider } from './monitor/profileProvider'

// ---------------------------------------------------------------------------
// Config defaults registered in Tabby's config store
// ---------------------------------------------------------------------------
class GistSyncConfigProvider extends ConfigProvider {
    defaults = {
        tabbyToGist: {
            enabled: false,
            gistId: '',
            deviceId: '',
            syncInterval: 20,
        },
    }

    platformDefaults = {}
}

@NgModule({
    imports: [CommonModule, FormsModule],
    providers: [
        { provide: SettingsTabProvider, useClass: GistSyncSettingsTabProvider, multi: true },
        { provide: ProfileProvider, useClass: MonitorProfileProvider, multi: true },
    ],
    declarations: [GistSettingsComponent, MonitorTabComponent],
    entryComponents: [MonitorTabComponent],
})
export default class TabbyToGistModule {
    constructor(
        app: AppService,
        config: ConfigService,
        private syncService: GistSyncService,
    ) {
        // Startup Pull — wait until Tabby is fully ready
        app.ready$.subscribe(() => {
            void syncService.startupPull()
        })

        // Auto-Save Push — debounced inside GistSyncService
        config.changed$.subscribe(() => {
            syncService.schedulePush()
        })
    }
}
