import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface EventAPI {
  id: number;
  name: string;
  created: Date;
}

export interface SessionAPI {
  id: number;
  event: string;
  name: string;
  password: string;
  maxStudents: number;
  created: Date;
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

  private get<T>(endpoint: string) {
    return this.http.get<T>(`${this.API_URL}${endpoint}/`, this.httpOptions);
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

  getEvents(): Observable<EventAPI[]> {
    return this.get<EventAPI[]>('events');
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
}
