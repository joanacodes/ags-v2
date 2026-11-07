/**
 * Eclipses, typed from NASA's eclipse catalogue (Fred Espenak, eclipse.gsfc.nasa.gov), times of
 * greatest eclipse in UT. The sky scan checks each against its own new or full moon before a row is
 * written: the catalogue is the first source, the scan the second.
 */
export interface Eclipse {
  readonly at: string;
  readonly type: "solar" | "lunar";
  readonly kind: "total" | "annular" | "partial" | "penumbral" | "hybrid";
}

export const ECLIPSE_SOURCE = "NASA eclipse catalogue (eclipse.gsfc.nasa.gov)";

export const ECLIPSES: readonly Eclipse[] = [
  { at: "2026-02-17T12:12:00Z", type: "solar", kind: "annular" },
  { at: "2026-03-03T11:33:00Z", type: "lunar", kind: "total" },
  { at: "2026-08-12T17:46:00Z", type: "solar", kind: "total" },
  { at: "2026-08-28T04:13:00Z", type: "lunar", kind: "partial" },
  { at: "2027-02-06T16:00:00Z", type: "solar", kind: "annular" },
  { at: "2027-02-20T23:12:00Z", type: "lunar", kind: "penumbral" },
  { at: "2027-07-18T16:03:00Z", type: "lunar", kind: "penumbral" },
  { at: "2027-08-02T10:06:00Z", type: "solar", kind: "total" },
  { at: "2027-08-17T07:14:00Z", type: "lunar", kind: "penumbral" },
  { at: "2028-01-12T04:13:00Z", type: "lunar", kind: "partial" },
  { at: "2028-01-26T15:08:00Z", type: "solar", kind: "annular" },
  { at: "2028-07-06T18:19:00Z", type: "lunar", kind: "partial" },
  { at: "2028-07-22T02:55:00Z", type: "solar", kind: "total" },
  { at: "2028-12-31T16:51:00Z", type: "lunar", kind: "total" },
];
