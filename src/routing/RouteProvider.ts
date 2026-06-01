// Provider-agnostic routing interface — same swappable pattern as MapRenderer.
// App code calls getRouteCached() in ./index; only files under src/routing/<provider>
// know which routing service is used. A billable provider can later sit behind an
// Edge Function without changing this contract.

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteLeg {
  distanceMeters: number
  durationSeconds: number
}

export interface RouteRequest {
  origin: LatLng
  dest: LatLng
  mode?: string
}

export interface RouteProvider {
  getRoute(req: RouteRequest): Promise<RouteLeg | null>
  /** Optional: the full road-shaped path through an ordered list of waypoints. */
  getRoutePath?(points: LatLng[]): Promise<LatLng[] | null>
}
