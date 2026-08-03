import { Component } from '@angular/core';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { ApiService } from './shared/services/api.service';
import { environment } from '../environments/environment';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  title = 'alice-masterclass-teacher';

  readonly LANGUAGES: string[] = ['en', 'pl', 'de', 'fr'];
  readonly languageKey = 'language';

  constructor(
    private apiService: ApiService,
    private translateService: TranslateService
  ) {
    apiService.API_URL = environment.apiUrl;

    this.translateService.setDefaultLang(this.LANGUAGES[0]);

    let language = localStorage.getItem(this.languageKey);
    if (language === null || !this.LANGUAGES.includes(language)) {
      language = this.LANGUAGES[0];
    }
    this.translateService.use(language);

    this.translateService.onLangChange.subscribe((params: LangChangeEvent) => {
      localStorage.setItem(this.languageKey, params.lang);
    });
  }
}
