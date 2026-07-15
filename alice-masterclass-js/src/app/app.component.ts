import { Component } from '@angular/core';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { AppConfig } from '../environments/environment';
import { ApiService } from './shared/services/api.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  readonly LANGUAGES: Array<string> = ['en', 'de']; // 'es' omitted: assets/i18n/es.json is empty
  readonly languageKey: string = 'language';

  constructor(private translateService: TranslateService, private apiService: ApiService) {
    this.translateService.setDefaultLang(this.LANGUAGES[0]);

    let language = localStorage.getItem(this.languageKey);

    if (language === null || !this.LANGUAGES.includes(language)) {
      language = this.LANGUAGES[0];
    }

    this.translateService.use(language);

    this.translateService.onLangChange.subscribe((params: LangChangeEvent) => this.onLangChange(params));

    this.apiService.API_URL = AppConfig.apiUrl;

    this.apiService.init();

    this.apiService.updateTitle();

    if (AppConfig.production) {
      console.log('AppConfig', AppConfig);
      console.log('Run in browser');
    }
  }

  onLangChange(event: LangChangeEvent) {
    localStorage.setItem(this.languageKey, event.lang);
  }
}
