# TASK-0015 — Forecast (horoscopes past and future)

**Status:** built, in testing by the owner (approved 2026-11-01). Page: `/charts/:id/forecast`.

## What it does
For one birth chart and a stretch of time, past or future, every timing signal is computed, weighed and ranked. It
says when, and which part of life is emphasised, never what will happen ("Timing activates potential; it does not
create guaranteed events": `knowledge/engine/temporal/timing_rules.json`).

## The method: five layers
| Time scale | Technique | Source |
|---|---|---|
| Life chapters | Zodiacal releasing from the Lots of Spirit and Fortune: levels 1 and 2, periods by sign (Aries 15, Taurus 8, Gemini 20, Cancer 25, Leo 19, Virgo 20, Libra 8, Scorpio 15, Sagittarius 12, Capricorn 27, Aquarius 30, Pisces 12 years of 360 days as Valens counts them, or calendar years of 365.2425 days when chosen on the page), peaks angular to Fortune, loosing of the bond | Vettius Valens, *Anthology*, Book IV; Chris Brennan, *Hellenistic Astrology* (2017) |
| The year | Annual profections (one sign a year from the Ascendant, the sign's traditional ruler as lord of the year, the modern tropical one beside it) | same |
| The year | Solar return (Placidus, cast at the birthplace unless another place is given) | Abu Ma'shar, *On the Revolutions of the Years of Nativities* (trans. B. Dykes, 2019) |
| Months to years | Secondary progressions (Sun, Moon, Mercury, Venus, Mars; the progressed Moon's sign and house changes; progressed stations) and solar arcs (every natal point moved by the progressed Sun's arc) | Steven Forrest, *The Changing Sky* (1986); Noel Tyl, *Solar Arcs* (2001) |
| Weeks and days | Transits of Jupiter, Saturn, Chiron, Uranus, Neptune, Pluto and the true node to every natal point, with retrograde passes and stations; eclipses within 3° of a natal point; new and full moons and Mars as triggers inside active windows | Robert Hand, *Planets in Transit* (1976); eclipses computed, cf. Espenak & Meeus, *Five Millennium Canon of Solar Eclipses* (NASA, 2006) |

Orbs: transits 1.5° approaching and 1° separating; progressions and solar arcs 1°; eclipses 3°; triggers 1°.

## The weighting
`src/forecast/score.ts`, recorded as a draft engine rule in `knowledge/engine/temporal/forecast_weighting.json`:
what moves, the aspect, the natal point met (lights and angles first, then the chart ruler), a station on the point,
the lord of the year, the year's profected sign, a peak of releasing from Spirit, and convergence: when k different
techniques meet the same point in overlapping windows, each weighs 1 + 0.5 (k − 1) times more. Key period: 10 and
above; notable: 5 and above. Starting values, to be tuned with the look-back marks.

## The look-back test
Looking back, each period can be marked "I recognise this period" or "Not really". The page shows the share
recognised per tier and per technique: if the method works for a person, key periods are recognised far more often
than weak signals. Marks are kept in `forecast_marks` (migration `202611010010_forecast_marks.sql`, run by hand in
the Supabase SQL Editor); until it is run they live in server memory and the page says so.

## Calculation
Positions: astronomy-engine 2.1.19 (MIT), geocentric apparent, true ecliptic and equinox of date (tropical). True
node: Meeus, *Astronomical Algorithms*, 2nd ed., ch. 47. Chiron, which astronomy-engine does not have:
`src/forecast/chiron.ts` integrates its orbit (Newton's equations under the Sun and the eight planets, whose positions
astronomy-engine gives; fourth-order Runge–Kutta, 16-day steps) from its heliocentric position and velocity at
J2000.0, read on 2026-11-01 from the Swiss Ephemeris asteroid file `seas_18.se1` (DE441), the ephemeris FreeAstroAPI
uses for natal Chiron. Only those six numbers are taken; no Swiss Ephemeris code or file is in AGS. Checked against
that file from 1900 to 2100 (within 0.6″ from 1990 to 2010, 19″ from 1950 to 2050, 44″ at worst) and against
published dates: perihelion on 14 February 1996 (NASA NSSDC), the ingresses into Aries (2018–2019) and Taurus
(2026–2027), the stations of 3 August 2026 (0°52′ Taurus) and 6 January 2027 (26°16′ Aries). Computed from 1900 to
2100; a stretch beyond is forecast without Chiron, and says so. Angles and Placidus cusps for the solar returns:
`src/forecast/houses.ts`, checked against the horizon (Ascendant at altitude 0, Midheaven on the meridian). The birth
moment in UT is taken from the zone's own history (IANA), then the stored offset. Natal positions are the chart's own.

## Library
New entries, DRAFT until the owner validates them: `techniques/solar_arc_directions`, `techniques/eclipses`,
`techniques/lunations`, `techniques/planetary_returns`. The page labels them "draft entry".

## Birth time
The owner's rule (2026-11-01): there is always a birth time, or no reading. A chart without one gets no forecast: the
page says so before anything is computed, and the API answers 422 with the same words.

## Limits (said on the page)
- Transiting Chiron is computed from 1900 to 2100; a stretch beyond is forecast without it.

## Next
1. Tune the weights from the marks once a few charts are tested.
2. A written reading of a forecast in the library's words (as the readings do), once the signals are trusted.
3. ~~A Chiron ephemeris for transiting Chiron~~: done (2026-11-01), see Calculation.
