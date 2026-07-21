import { TestBed } from '@angular/core/testing';
import { FlightService, getFlightOverlayParent, viewportToOverlayPoint } from './flight.service';

describe('FlightService', () => {
  let service: FlightService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FlightService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose an active flight signal when fly() is called', async () => {
    expect(service.active()).toBeNull();

    const parent = getFlightOverlayParent();
    const expectedFrom = viewportToOverlayPoint(10, 20, parent);
    const expectedTo = viewportToOverlayPoint(100, 200, parent);

    const promise = service.fly({ x: 10, y: 20 }, { x: 100, y: 200 }, { color: '#ff0000' });
    const active = service.active();

    expect(active).not.toBeNull();
    expect(active!.from).toEqual(expectedFrom);
    expect(active!.to).toEqual(expectedTo);
    expect(active!.color).toBe('#ff0000');

    service.notifyDone(active!.id);
    await promise;
    expect(service.active()).toBeNull();
  });

  it('should queue a second flight until the first completes', async () => {
    const parent = getFlightOverlayParent();
    const first = service.fly({ x: 0, y: 0 }, { x: 1, y: 1 });
    const firstId = service.active()!.id;

    let secondResolved = false;
    const second = service.fly({ x: 2, y: 2 }, { x: 3, y: 3 }).then(() => {
      secondResolved = true;
    });

    expect(service.active()!.id).toBe(firstId);

    service.notifyDone(firstId);
    await first;
    await Promise.resolve();

    const secondActive = service.active();
    expect(secondActive).not.toBeNull();
    expect(secondActive!.from).toEqual(viewportToOverlayPoint(2, 2, parent));
    expect(secondResolved).toBeFalse();

    service.notifyDone(secondActive!.id);
    await second;
    expect(secondResolved).toBeTrue();
    expect(service.active()).toBeNull();
  });

  it('should fly between rect centers', async () => {
    const parent = getFlightOverlayParent();
    const source = new DOMRect(0, 0, 100, 40);
    const dest = new DOMRect(200, 100, 50, 20);
    const promise = service.flyBetweenRects(source, dest);
    const active = service.active()!;

    expect(active.from).toEqual(viewportToOverlayPoint(50, 20, parent));
    expect(active.to).toEqual(viewportToOverlayPoint(225, 110, parent));

    service.notifyDone(active.id);
    await promise;
  });
});
