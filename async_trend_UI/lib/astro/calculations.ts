import type { AstroSummaryRow, AstroTableRow } from "@/lib/types";
import { spawnSync } from "node:child_process";
import path from "node:path";

const IST_TIME_ZONE = "Asia/Kolkata";
const NAKSHATRAS = [
  "Ashwini",
  "Bharani",
  "Krittika",
  "Rohini",
  "Mrigashira",
  "Ardra",
  "Punarvasu",
  "Pushya",
  "Ashlesha",
  "Magha",
  "Purva Phalguni",
  "Uttara Phalguni",
  "Hasta",
  "Chitra",
  "Swati",
  "Vishakha",
  "Anuradha",
  "Jyeshtha",
  "Mula",
  "Purva Ashadha",
  "Uttara Ashadha",
  "Shravana",
  "Dhanishta",
  "Shatabhisha",
  "Purva Bhadrapada",
  "Uttara Bhadrapada",
  "Revati"
] as const;
const KP_LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"] as const;
const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
] as const;

const WEEKDAY_LORDS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"] as const;
const HORA_SEQUENCE = ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"] as const;
const NAKSHATRA_SIZE = 360 / 27;
const PADA_SIZE = NAKSHATRA_SIZE / 4;

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function meanObliquityDeg(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  return (
    23.0 +
    26.0 / 60.0 +
    (21.448 - 46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 3600.0
  );
}

function gmstDeg(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000.0;
  return normalizeDegrees(gmst);
}

function siderealAscendantApprox(date: Date, latitude = 19.054999, longitude = 72.8692035): number {
  const jd = toJulianDay(date);
  const eps = (meanObliquityDeg(jd) * Math.PI) / 180;
  const lst = normalizeDegrees(gmstDeg(jd) + longitude);
  const theta = (lst * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;

  // Matches Swiss Ephemeris houses() ascendant geometry used in reference file.
  const asc =
    (Math.atan2(Math.cos(theta), -(Math.sin(theta) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180) /
    Math.PI;
  return normalizeDegrees(asc);
}

function angleDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function formatDateTimeIST(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}

function formatDateIST(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatTimeIST(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

function buildDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function sunLongitude(date: Date): number {
  const jd = toJulianDay(date);
  const n = jd - 2451545.0;
  const l = normalizeDegrees(280.46 + 0.9856474 * n);
  const g = normalizeDegrees(357.528 + 0.9856003 * n);
  const lambda = l + 1.915 * Math.sin((g * Math.PI) / 180) + 0.02 * Math.sin((2 * g * Math.PI) / 180);
  return normalizeDegrees(lambda);
}

function moonLongitude(date: Date): number {
  const jd = toJulianDay(date);
  const d = jd - 2451543.5;
  const n = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const m = normalizeDegrees(115.3654 + 13.0649929509 * d);
  const e0 = m + ((180 / Math.PI) * e * Math.sin((m * Math.PI) / 180)) * (1 + e * Math.cos((m * Math.PI) / 180));
  const xv = a * (Math.cos((e0 * Math.PI) / 180) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin((e0 * Math.PI) / 180);
  const v = (Math.atan2(yv, xv) * 180) / Math.PI;
  const r = Math.sqrt(xv * xv + yv * yv);
  const xh =
    r *
    (Math.cos((n * Math.PI) / 180) * Math.cos(((v + w) * Math.PI) / 180) -
      Math.sin((n * Math.PI) / 180) * Math.sin(((v + w) * Math.PI) / 180) * Math.cos((i * Math.PI) / 180));
  const yh =
    r *
    (Math.sin((n * Math.PI) / 180) * Math.cos(((v + w) * Math.PI) / 180) +
      Math.cos((n * Math.PI) / 180) * Math.sin(((v + w) * Math.PI) / 180) * Math.cos((i * Math.PI) / 180));
  return normalizeDegrees((Math.atan2(yh, xh) * 180) / Math.PI);
}

function istDateTimeParts(date: Date): { dateDdMmYyyy: string; timeHhMm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return {
    dateDdMmYyyy: `${day}/${month}/${year}`,
    timeHhMm: `${hour}:${minute}`
  };
}

function runMoonAscPython(command: string, args: string[]): { moon: number; ascendant: number } | null {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8"
  });
  if (result.error || result.status !== 0) return null;
  const text = (result.stdout ?? "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { moon?: unknown; ascendant?: unknown };
    const moon = Number(parsed.moon);
    const ascendant = Number(parsed.ascendant);
    if (!Number.isFinite(moon) || !Number.isFinite(ascendant)) return null;
    return { moon, ascendant };
  } catch {
    return null;
  }
}

function moonAscSiderealFromReference(date: Date): { moon: number; ascendant: number } | null {
  const scriptPath = path.join(process.cwd(), "lib", "astro", "moon_asc_calc.py");
  const { dateDdMmYyyy, timeHhMm } = istDateTimeParts(date);

  const direct = runMoonAscPython("python", [scriptPath, dateDdMmYyyy, timeHhMm]);
  if (direct) return direct;

  const pyLauncher = runMoonAscPython("py", ["-3", scriptPath, dateDdMmYyyy, timeHhMm]);
  return pyLauncher;
}

function meanPlanetLongitude(date: Date, offset: number, periodDays: number): number {
  const jd = toJulianDay(date);
  return normalizeDegrees(offset + ((jd - 2451545.0) / periodDays) * 360);
}

function signName(longitude: number): string {
  return SIGNS[Math.floor(normalizeDegrees(longitude) / 30)] ?? SIGNS[0];
}

function degreeInSign(longitude: number): number {
  return normalizeDegrees(longitude) % 30;
}

function nakshatraIndex(longitude: number): number {
  return Math.floor(normalizeDegrees(longitude) / NAKSHATRA_SIZE) % 27;
}

function nakshatraLord(index: number): string {
  return KP_LORDS[index % KP_LORDS.length];
}

function csvGroupForLord(lord: string): { file: string; group: string } {
  const normalized = lord.toLowerCase();
  if (normalized === "moon" || normalized === "venus") return { file: "moon_venus.csv", group: "Moon / Venus" };
  if (normalized === "mercury" || normalized === "mars") return { file: "mercury_mars.csv", group: "Mercury / Mars" };
  if (normalized === "jupiter" || normalized === "ketu") return { file: "jupiter_ketu.csv", group: "Jupiter / Ketu" };
  return { file: "rahu_saturn.csv", group: "Rahu / Saturn / Sun" };
}

export type AstroCore = {
  snapshot: {
    date: string;
    time: string;
    symbol: string;
    referencePrice: number;
    reviewWindow: string;
    weekday: string;
  };
  moonShift: AstroSummaryRow;
  currentPadas: AstroTableRow[];
  nextPadas: AstroTableRow[];
  levels: AstroTableRow[];
  horaTimings: AstroTableRow[];
  aspectMatrix: AstroTableRow[];
  planetaryLevels: AstroTableRow[];
  positions: AstroTableRow[];
  aspects: AstroTableRow[];
  filteredAspects: {
    all: AstroTableRow[];
    withoutMoon: AstroTableRow[];
    withMoon: AstroTableRow[];
    withoutAscendant: AstroTableRow[];
    withAscendant: AstroTableRow[];
    withMoonOrAscendant: AstroTableRow[];
    withoutMoonOrAscendant: AstroTableRow[];
  };
  csvLookupHint: {
    lord: string;
    sunLord: string;
    file: string;
    group: string;
  };
};

export function buildAstroCore(input: {
  date: string;
  time: string;
  symbol: string;
  referencePrice: number;
}): AstroCore {
  const dateTime = buildDateTime(input.date, input.time);
  const reviewWindow = `${formatDateIST(addHours(dateTime, -24 * 45))} to ${formatDateIST(addHours(dateTime, -24))}`;
  const preciseNow = moonAscSiderealFromReference(dateTime);
  const preciseNext = moonAscSiderealFromReference(addHours(dateTime, 1));
  const moonLon = preciseNow?.moon ?? moonLongitude(dateTime);
  const nextHourMoonLon = preciseNext?.moon ?? moonLongitude(addHours(dateTime, 1));
  const moonSpeedPerHour = ((nextHourMoonLon - moonLon + 360) % 360) || 0.55;
  const currentNakIdx = nakshatraIndex(moonLon);
  const nextNakIdx = (currentNakIdx + 1) % NAKSHATRAS.length;
  const prevNakIdx = (currentNakIdx + NAKSHATRAS.length - 1) % NAKSHATRAS.length;
  const currentNakStart = currentNakIdx * NAKSHATRA_SIZE;
  const currentNakEnd = normalizeDegrees(currentNakStart + NAKSHATRA_SIZE);
  const degreesSinceStart = ((moonLon - currentNakStart + 360) % 360);
  const degreesUntilNext = ((currentNakEnd - moonLon + 360) % 360) || NAKSHATRA_SIZE;
  const hoursSincePrevious = degreesSinceStart / Math.max(moonSpeedPerHour, 0.1);
  const hoursUntilNext = degreesUntilNext / Math.max(moonSpeedPerHour, 0.1);
  const previousShift = addHours(dateTime, -hoursSincePrevious);
  const nextShift = addHours(dateTime, hoursUntilNext);
  const currentLord = nakshatraLord(currentNakIdx);
  const sunLon = sunLongitude(dateTime);
  const sunLord = nakshatraLord(nakshatraIndex(sunLon));
  const effectiveLord = currentLord === "Sun" ? sunLord : currentLord;
  const csvGroup = csvGroupForLord(effectiveLord);

  const currentPadas = Array.from({ length: 4 }, (_, index) => {
    const startDeg = currentNakStart + index * PADA_SIZE;
    const endDeg = startDeg + PADA_SIZE;
    const startHours = (startDeg - currentNakStart) / Math.max(moonSpeedPerHour, 0.1);
    const endHours = (endDeg - currentNakStart) / Math.max(moonSpeedPerHour, 0.1);
    return {
      pada: `${NAKSHATRAS[currentNakIdx]} ${index + 1}`,
      start_local_dt: formatDateTimeIST(addHours(previousShift, startHours)),
      end_local_dt: formatDateTimeIST(addHours(previousShift, endHours))
    };
  });

  const nextPadas = Array.from({ length: 4 }, (_, index) => {
    const startHours = index * (PADA_SIZE / Math.max(moonSpeedPerHour, 0.1));
    const endHours = (index + 1) * (PADA_SIZE / Math.max(moonSpeedPerHour, 0.1));
    return {
      pada: `${NAKSHATRAS[nextNakIdx]} ${index + 1}`,
      start_local_dt: formatDateTimeIST(addHours(nextShift, startHours)),
      end_local_dt: formatDateTimeIST(addHours(nextShift, endHours))
    };
  });

  const levels = buildPriceLevels(input.referencePrice);
  const positions = buildPlanetPositions(dateTime, {
    moon: moonLon,
    ascendant: preciseNow?.ascendant
  });
  const aspects = buildAspectRows(dateTime, positions);
  const aspectMatrix = buildAspectMatrix(positions);
  const horaTimings = buildHoraTimings(dateTime);
  const includesMoon = (row: AstroTableRow) => row.Planet1 === "Moon" || row.Planet2 === "Moon";
  const includesAscendant = (row: AstroTableRow) => row.Planet1 === "Ascendant" || row.Planet2 === "Ascendant";

  return {
    snapshot: {
      date: input.date,
      time: input.time,
      symbol: input.symbol || "NIFTY",
      referencePrice: input.referencePrice,
      reviewWindow,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: IST_TIME_ZONE }).format(dateTime)
    },
    moonShift: {
      "Previous Nakshatra": NAKSHATRAS[prevNakIdx],
      "Current Nakshatra": NAKSHATRAS[currentNakIdx],
      "Next Nakshatra": NAKSHATRAS[nextNakIdx],
      "Previous Shift Local Datetime": formatDateTimeIST(previousShift),
      "Current Local Datetime": formatDateTimeIST(dateTime),
      "Next Shift Local Datetime": formatDateTimeIST(nextShift),
      "Previous Lord": nakshatraLord(prevNakIdx),
      "Current Lord": currentLord,
      "Sun Lord": sunLord,
      "Next Lord": nakshatraLord(nextNakIdx),
      "Hours Since Previous": Number(hoursSincePrevious.toFixed(2)),
      "Hours Until Next": Number(hoursUntilNext.toFixed(2)),
      "Current Nakshatra Duration H": Number((hoursSincePrevious + hoursUntilNext).toFixed(2))
    },
    currentPadas,
    nextPadas,
    levels,
    horaTimings,
    aspectMatrix,
    planetaryLevels: positions.map((position) => ({
      Planet: position.Planet,
      Sign: position.Sign,
      Longitude: position.Longitude,
      DegreeInSign: position.DegreeInSign,
      Motion: position.Motion,
      Level: Number((input.referencePrice * (1 + Number(position.Longitude) / 3600)).toFixed(2))
    })),
    positions,
    aspects,
    filteredAspects: {
      all: aspects,
      withoutMoon: aspects.filter((row) => !includesMoon(row)),
      withMoon: aspects.filter((row) => includesMoon(row)),
      withoutAscendant: aspects.filter((row) => !includesAscendant(row)),
      withAscendant: aspects.filter((row) => includesAscendant(row)),
      withMoonOrAscendant: aspects.filter((row) => includesMoon(row) || includesAscendant(row)),
      withoutMoonOrAscendant: aspects.filter((row) => !includesMoon(row) && !includesAscendant(row))
    },
    csvLookupHint: {
      lord: currentLord,
      sunLord,
      file: csvGroup.file,
      group: csvGroup.group
    }
  };
}

function buildPriceLevels(referencePrice: number): AstroTableRow[] {
  const multipliers = [
    ["Support -5%", 0.95],
    ["Support -2%", 0.98],
    ["Reference", 1],
    ["Resistance +2%", 1.02],
    ["Resistance +5%", 1.05]
  ] as const;
  return multipliers.map(([label, multiplier]) => ({
    Band: label,
    Level: Number((referencePrice * multiplier).toFixed(2))
  }));
}

function buildHoraTimings(dateTime: Date): AstroTableRow[] {
  const weekday = dateTime.getDay();
  const startLord = WEEKDAY_LORDS[weekday] ?? WEEKDAY_LORDS[0];
  const startIndex = HORA_SEQUENCE.indexOf(startLord);
  const sunrise = new Date(`${formatDateIST(dateTime)}T06:00:00+05:30`);
  return Array.from({ length: 24 }, (_, index) => {
    const slotStart = addHours(sunrise, index);
    const slotEnd = addHours(sunrise, index + 1);
    const ruler = HORA_SEQUENCE[(startIndex + index) % HORA_SEQUENCE.length];
    return {
      Hora: index + 1,
      Planet: ruler,
      Start: formatTimeIST(slotStart),
      End: formatTimeIST(slotEnd)
    };
  });
}

function buildPlanetPositions(
  dateTime: Date,
  overrides?: { moon?: number; ascendant?: number }
): AstroTableRow[] {
  const sun = sunLongitude(dateTime);
  const moon = overrides?.moon ?? moonLongitude(dateTime);
  const rahu = meanPlanetLongitude(dateTime, 125.1228, -6798.38);
  const ketu = normalizeDegrees(rahu + 180);
  const ascendant = overrides?.ascendant ?? siderealAscendantApprox(dateTime);
  const entries = [
    ["Sun", sun, 0.9856],
    ["Moon", moon, 13.176],
    ["Mercury", meanPlanetLongitude(dateTime, 252.25, 87.969), 1.2],
    ["Venus", meanPlanetLongitude(dateTime, 181.98, 224.701), 1.18],
    ["Mars", meanPlanetLongitude(dateTime, 355.43, 686.98), 0.52],
    ["Jupiter", meanPlanetLongitude(dateTime, 34.35, 4332.59), 0.083],
    ["Saturn", meanPlanetLongitude(dateTime, 50.08, 10759.22), 0.033],
    ["Rahu", rahu, -0.053],
    ["Ketu", ketu, -0.053],
    ["Ascendant", ascendant, 1]
  ] as const;

  return entries.map(([planet, longitude, motion]) => ({
    Planet: planet,
    Longitude: Number(longitude.toFixed(2)),
    Sign: signName(longitude),
    DegreeInSign: Number(degreeInSign(longitude).toFixed(2)),
    Motion: motion < 0 ? "Retrograde" : "Forward",
    Nakshatra: NAKSHATRAS[nakshatraIndex(longitude)],
    Lord: nakshatraLord(nakshatraIndex(longitude))
  }));
}

function buildAspectRows(dateTime: Date, positions: AstroTableRow[]): AstroTableRow[] {
  const rules = [
    ["CONJ", 0],
    ["SEXTILE", 60],
    ["SQUARE", 90],
    ["TRINE", 120],
    ["OPPOSITION", 180]
  ] as const;
  const rows: AstroTableRow[] = [];
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      const p1 = positions[left];
      const p2 = positions[right];
      const distance = angleDifference(Number(p1.Longitude), Number(p2.Longitude));
      const aspect = rules.find((rule) => Math.abs(distance - rule[1]) <= (p1.Planet === "Moon" || p2.Planet === "Moon" ? 8 : 6));
      if (!aspect) continue;
      rows.push({
        Time: formatTimeIST(dateTime),
        Planet1: p1.Planet,
        Planet2: p2.Planet,
        Angle: aspect[0],
        "Main angle": aspect[1],
        "Abs angle": Number(distance.toFixed(2)),
        "Planet1-Sign": p1.Sign,
        "Planet2-Sign": p2.Sign,
        FinalSignal: distance > aspect[1] ? "Separating" : "Applying"
      });
    }
  }
  return rows;
}

function buildAspectMatrix(positions: AstroTableRow[]): AstroTableRow[] {
  return positions.map((row) => {
    const result: AstroTableRow = { Planet: row.Planet as string };
    for (const other of positions) {
      if (other.Planet === row.Planet) {
        result[String(other.Planet)] = "Self";
        continue;
      }
      const distance = angleDifference(Number(row.Longitude), Number(other.Longitude));
      const label =
        Math.abs(distance - 180) <= 6
          ? `Opp (${distance.toFixed(1)}°)`
          : Math.abs(distance - 120) <= 6
            ? `Tri (${distance.toFixed(1)}°)`
            : Math.abs(distance - 90) <= 6
              ? `Sqr (${distance.toFixed(1)}°)`
              : Math.abs(distance - 60) <= 6
                ? `Sex (${distance.toFixed(1)}°)`
                : Math.abs(distance) <= 6
                  ? `Conj (${distance.toFixed(1)}°)`
                  : "";
      result[String(other.Planet)] = label;
    }
    return result;
  });
}
