import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService, EventAPI, SessionAPI, VisualAnalysisResultAPI, StrangenesLargeScaleAnalysisResultAPI, JpsiAnalysisResultAPI, ExerciseKind, ParticleType, CollisionType, CentralityType } from './api.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ApiService', () => {
  let service: ApiService;
  let httpTestingController: HttpTestingController;

  const URL: string = 'https://test-url/';
  const TOKEN: string = 'test-token';

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ApiService);
    httpTestingController = TestBed.inject(HttpTestingController);

    service.API_URL = URL;
    service.setAuthToken(TOKEN);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch events', () => {
    const EVENTS: EventAPI[] = [
      {id: 0, name: 'TEST', kind: ExerciseKind.STRANGENESS, created: new Date(Date.now())},
      {id: 1, name: 'TEST2', kind: ExerciseKind.STRANGENESS, created: new Date(Date.now())},
    ];
    
    service.getEvents().subscribe(data => expect(data).toEqual(EVENTS));

    const req = httpTestingController.expectOne(`${URL}events/`);
    expect(req.request.method).toEqual('GET');
    expect(req.request.params.keys().length).toEqual(0);

    req.flush(EVENTS);

    httpTestingController.verify();
  });

  it('should fetch events filtered by kind', () => {
    const EVENTS: EventAPI[] = [
      {id: 1, name: 'JPSI_EVENT', kind: ExerciseKind.JPSI, created: new Date(Date.now())},
    ];

    service.getEvents(ExerciseKind.JPSI).subscribe(data => expect(data).toEqual(EVENTS));

    const req = httpTestingController.expectOne(
      (r) => r.url === `${URL}events/` && r.params.get('kind') === ExerciseKind.JPSI
    );
    expect(req.request.method).toEqual('GET');

    req.flush(EVENTS);

    httpTestingController.verify();
  });

  it('should create event', () => {
    const body = {
      name: 'TEST_EVENT'
    }
    
    service.createEvent(body).subscribe();

    const req = httpTestingController.expectOne(`${URL}events/`);
    expect(req.request.method).toEqual('POST');

    req.flush('');

    httpTestingController.verify();
  });

  it('should delete event', () => {
    const eventID: number = 0;
    
    service.deleteEvent(eventID).subscribe();

    const req = httpTestingController.expectOne(`${URL}events/${eventID}/`);
    expect(req.request.method).toEqual('DELETE');

    req.flush('');

    httpTestingController.verify();
  });

  it('should fetch sessions', () => {
    const SESSIONS: SessionAPI[] = [
      {id: 1, event: 'TEST', kind: ExerciseKind.STRANGENESS, name: 'TestName', password: 'testpassword', maxStudents: 15, created: new Date(Date.now())},
      {id: 2, event: 'TEST2', kind: ExerciseKind.STRANGENESS, name: 'TestName2', password: 'testpassword2', maxStudents: 30, created: new Date(Date.now())}
    ];
    
    service.getSessions().subscribe(data => expect(data).toEqual(SESSIONS));

    const req = httpTestingController.expectOne(`${URL}sessions/`);
    expect(req.request.method).toEqual('GET');

    req.flush(SESSIONS);

    httpTestingController.verify();
  });

  it('should create session', () => {
    const body = {
      event: 'TEST_EVENT',
      name: 'test-session',
      password: 'password',
      maxStudents: 20
    }
    
    service.createSession(body).subscribe();

    const req = httpTestingController.expectOne(`${URL}sessions/`);
    expect(req.request.method).toEqual('POST');

    req.flush('');

    httpTestingController.verify();
  });

  it('should delete session', () => {
    const sessionID: number = 0;
    
    service.deleteSession(sessionID).subscribe();

    const req = httpTestingController.expectOne(`${URL}sessions/${sessionID}/`);
    expect(req.request.method).toEqual('DELETE');

    req.flush('');

    httpTestingController.verify();
  });

  it('should fetch VSA results', () => {
    const VSA_RESULTS: VisualAnalysisResultAPI[] = [
      {student: 0, dataset: 0, k0: [0.49, 0.48, 0.5], lambda: [], antilambda: [], xi: [], antixi: []},
      {student: 1, dataset: 1, k0: [0.485, 0.49, 0.49], lambda: [], antilambda: [], xi: [], antixi: []},
      {student: 2, dataset: 3, k0: [0.485, 0.49, 0.49], lambda: [], antilambda: [], xi: [], antixi: []},
    ];

    const sessionID: number = 0;
    
    service.getStrangenessVisualAnalysisResults(sessionID).subscribe(data => expect(data).toEqual(VSA_RESULTS));

    const req = httpTestingController.expectOne(`${URL}strangeness_visual_analysis_results/${sessionID}/`);
    expect(req.request.method).toEqual('GET');

    req.flush(VSA_RESULTS);

    httpTestingController.verify();
  });

  it('should fetch LSA results', () => {
    const LSA_RESULTS: StrangenesLargeScaleAnalysisResultAPI[] = [
      {particle: ParticleType.KAON, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
      {particle: ParticleType.LAMBDA, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
      {particle: ParticleType.ANTI_LAMBDA, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
    ];

    const eventID: number = 0;
    
    service.getStrangenessLargeScaleAnalysisResults(eventID).subscribe(data => expect(data).toEqual(LSA_RESULTS));

    const req = httpTestingController.expectOne(`${URL}strangeness_large_scale_analysis_results/${eventID}/`);
    expect(req.request.method).toEqual('GET');

    req.flush(LSA_RESULTS);

    httpTestingController.verify();
  });

  it('should fetch jpsi results', () => {
    const JPSI_RESULTS: JpsiAnalysisResultAPI[] = [
      {system: 'pp', signal: [59, 65], signalError: [8, 9], nEvents: [1000, 1000]},
      {system: 'pbPb_0_5', signal: [34662], signalError: [186], nEvents: []},
    ];

    const eventID: number = 0;

    service.getJpsiAnalysisResults(eventID).subscribe(data => expect(data).toEqual(JPSI_RESULTS));

    const req = httpTestingController.expectOne(`${URL}jpsi_analysis_results/${eventID}/`);
    expect(req.request.method).toEqual('GET');

    req.flush(JPSI_RESULTS);

    httpTestingController.verify();
  });
});
