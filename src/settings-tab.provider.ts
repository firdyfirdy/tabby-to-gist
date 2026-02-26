import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { GistSettingsComponent } from './settings.component'

@Injectable()
export class GistSyncSettingsTabProvider extends SettingsTabProvider {
    id = 'tabby-to-gist'
    icon = 'cloud'
    title = 'Gist Sync'

    getComponentType(): any {
        return GistSettingsComponent
    }
}
