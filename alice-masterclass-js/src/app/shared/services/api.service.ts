import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { shareReplay } from 'rxjs/operators';

export interface Session {
  error: boolean
  name: string
}

export enum ParticleType {
  KAON = 'k0',
  LAMBDA = 'lambda',
  ANTI_LAMBDA = 'antilambda',
  XI = 'xi',
  ANTI_XI = 'antixi',
  BACKGROUND = 'background'
}

export enum CollisionType {
  PP = 'pp',
  PBPB = 'pbpb'
}

export enum CentralityType {
  C000_000 = '000_000',
  C000_010 = '000_010',
  C010_020 = '010_020',
  C020_030 = '020_030',
  C030_040 = '030_040',
  C040_050 = '040_050',
  C050_060 = '050_060',
  C060_070 = '060_070',
  C070_080 = '070_080',
  C080_090 = '080_090',
  C090_100 = '090_100'
}

export interface VisualAnalysisResultsEntry {
  particle: ParticleType,
  mass: number
}

export interface LargeScaleAnalysisResultsEntry {
  particle: ParticleType,
  collision: CollisionType,
  centrality: CentralityType,
  signal: number
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  API_URL: string = '';

  get isAuthenticated(): boolean {
    return this.password !== null && this.sessionName !== null && this.studentID !== null;
  }

  private readonly passwordKey: string = 'password';
  password: string = null;

  private readonly studentIDKey: string = 'studentID';
  studentID: number = null;

  sessionName: string = null;

  constructor(private http: HttpClient, private title: Title, private translateService: TranslateService) { }

  init(): void {
    // try to re-authenticate if password and id is stored
    const password = sessionStorage.getItem(this.passwordKey);
    const id = sessionStorage.getItem(this.studentIDKey);

    if (password !== null && id !== null) {
      this.authenticate(password, parseInt(id));
    }
  }

  authenticate(password: string, studentID: number): Observable<Session> {
    // shareReplay() to only send the request once, regardless of how many
    // subscribers will read the result
    const auth$ = this.put<Session>('check_session', { password: password }).pipe(shareReplay());

    auth$.subscribe((data: Session) => {
      if (!data.error) {
        sessionStorage.setItem(this.passwordKey, password);
        sessionStorage.setItem(this.studentIDKey, studentID.toString());

        this.sessionName = data.name;
        this.password = password;
        this.studentID = studentID;

        this.updateTitle();
      }
    },);

    return auth$;
  }

  updateTitle(): void {
    this.translateService.get('GENERAL.ALICE_MASTERCLASS').subscribe((res: string) => {
      if (this.sessionName === null) {
        this.title.setTitle(`${res}`);
      } else {
        this.title.setTitle(`${res}: ${this.sessionName}`);
      }
    });
  }

  private put<T>(endpoint: string, body: any = {}) {
    return this.http.put<T>(`${this.API_URL}${endpoint}/`, body);
  }

  submitVisualAnalysisResults(results: Map<string, VisualAnalysisResultsEntry[]>, datasetID: number): Observable<any> {
    const body = {
      password: this.password,
      results: {} as Record<string, { particle: ParticleType; mass: number } | Array<{ particle: ParticleType; mass: number }>>
    };

    for (const [key, entries] of Array.from(results.entries())) {
      // Skip entries classified as background
      const samples = entries
        .filter((value) => value.particle !== ParticleType.BACKGROUND)
        .map((value) => ({ particle: value.particle, mass: value.mass }));

      if (samples.length === 0) {
        continue;
      }

      // Single-object form stays backward-compatible; arrays cover multi-V0 events.
      body.results[key] = samples.length === 1 ? samples[0] : samples;
    }

    return this.put(`strangeness_visual_analysis/${this.studentID}/${datasetID}`, body);
  }

  submitLargeScaleAnalysisResults(results: Map<string, LargeScaleAnalysisResultsEntry>): Observable<any> {
    const body = {
      password: this.password,
      results: []
    };

    for (let entry of Array.from(results.entries())) {
      const value: LargeScaleAnalysisResultsEntry = entry[1];

      body.results.push({ particle: value.particle, collision: value.collision, centrality: value.centrality, signal: value.signal });
    }

    return this.put(`strangeness_large_scale_analysis/${this.studentID}`, body);
  }
}
