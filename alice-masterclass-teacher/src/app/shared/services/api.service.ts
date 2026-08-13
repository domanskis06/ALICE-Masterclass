import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Which of the three independent sub-masterclasses an Event/Session belongs to. Mirrors
 * `ExerciseKind` in `alice-masterclass-django/masterclass/models.py` - keep these in sync.
 */
export enum ExerciseKind {
  STRANGENESS = 'strangeness',
  JPSI = 'jpsi',
  RAA = 'raa',
}

export interface EventAPI {
  id: number;
  name: string;
  kind: ExerciseKind;
  created: Date;
}

export interface SessionAPI {
  id: number;
  event: string;
  kind: ExerciseKind;
  name: string;
  password: string;
  maxStudents: number;
  created: Date;
}

/**
 * Raw per-system J/psi signals as returned by `GET /api/v1/jpsi_analysis_results/{eventID}/` -
 * one entry per collision system, with one array element per student who submitted it (same
 * "leave the averaging to the client" convention as `StrangenesLargeScaleAnalysisResultAPI`).
 * `nEvents` is only populated for pp/p-Pb; Pb-Pb event counts are a fixed, published constant
 * kept in the teacher app itself (`PBPB_NEVENTS`).
 */
export interface JpsiAnalysisResultAPI {
  system: string;
  signal: number[];
  signalError: number[];
  nEvents: number[];
}

export interface VisualAnalysisResultAPI {
  student: number,
  dataset: number,
  k0: number[],
  lambda: number[],
  antilambda: number[],
  xi: number[],
  antixi?: number[]
}

export enum ParticleType {
  KAON = 'k0',
  LAMBDA = 'lambda',
  ANTI_LAMBDA = 'antilambda',
  XI = 'xi',
  ANTI_XI = 'antixi'
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

export interface StrangenesLargeScaleAnalysisResultAPI {
  particle: ParticleType;
  collision: CollisionType;
  centrality: CentralityType;
  signal: number[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  API_URL: string = '';
  readonly REFRESH_INTERVAL = 10000;
  static readonly TOKEN_KEY: string = 'token';

  private httpOptions = {
    headers: new HttpHeaders({
      'Content-Type':  'application/json'
    })
  };

  constructor(private http: HttpClient) { }

  isAuthenticated(): Observable<boolean> {
    const token = sessionStorage.getItem(ApiService.TOKEN_KEY);

    if (token === null) {
      return of(false);
    } else {
      this.setAuthToken(token);

      return this.get<any>('token').pipe(map(() => true)).pipe(catchError((err) => {
        return of(false);
      }));
    }
  }

  setAuthToken(token: string): void {
    this.httpOptions.headers = this.httpOptions.headers.set('Authorization', `Token ${token}`);
  }

  private get<T>(endpoint: string, params?: Record<string, string>) {
    // Built via HttpParams (rather than string-concatenating a query string onto endpoint)
    // because endpoint always gets a trailing slash appended below - "events?kind=jpsi" would
    // otherwise become the invalid "events?kind=jpsi/".
    let httpParams = new HttpParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        httpParams = httpParams.set(key, value);
      }
    }

    return this.http.get<T>(`${this.API_URL}${endpoint}/`, { ...this.httpOptions, params: httpParams });
  }

  private delete<T>(endpoint: string) {
    return this.http.delete<T>(`${this.API_URL}${endpoint}/`, this.httpOptions);
  }

  private put<T>(endpoint: string, body: any = {}) {
    return this.http.put<T>(`${this.API_URL}${endpoint}/`, body, this.httpOptions);
  }

  private post<T>(endpoint: string, body: any = {}) {
    return this.http.post<T>(`${this.API_URL}${endpoint}/`, body, this.httpOptions);
  }

  autoRefresh(): boolean {
    return true;
  }

  /** Pass `kind` to restrict the dropdown to one sub-masterclass (LSA/VA/JPSI analysis pages);
   * omit it for the session-management pages, which need every event regardless of kind. */
  getEvents(kind?: ExerciseKind): Observable<EventAPI[]> {
    return this.get<EventAPI[]>('events', kind ? { kind } : undefined);
  }

  createEvent(body: any): Observable<any> {
    return this.post('events', body);
  }

  deleteEvent(eventID: number): Observable<any> {
    return this.delete(`events/${eventID}`);
  }

  getSessions(): Observable<SessionAPI[]> {
    return this.get<SessionAPI[]>('sessions');
  }

  createSession(body: any): Observable<any> {
    return this.post('sessions', body);
  }

  deleteSession(sessionID: number): Observable<any> {
    return this.delete(`sessions/${sessionID}`);
  }

  getStrangenessVisualAnalysisResults(sessionID: number): Observable<VisualAnalysisResultAPI[]> {
    return this.get<VisualAnalysisResultAPI[]>(`strangeness_visual_analysis_results/${sessionID}`);
  }

  getStrangenessLargeScaleAnalysisResults(eventID: number): Observable<StrangenesLargeScaleAnalysisResultAPI[]> {
    return this.get<StrangenesLargeScaleAnalysisResultAPI[]>(`strangeness_large_scale_analysis_results/${eventID}`);
  }

  getJpsiAnalysisResults(eventID: number): Observable<JpsiAnalysisResultAPI[]> {
    return this.get<JpsiAnalysisResultAPI[]>(`jpsi_analysis_results/${eventID}`);
  }
}
