import type { AstroTableRow } from "@/lib/types";

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseCards(html: string, className: string): string[] {
  const regex = new RegExp(`<div[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "gi");
  return Array.from(html.matchAll(regex)).map((match) => match[1]);
}

export function parseAstroCards(html: string): AstroTableRow[] {
  const cards = html.match(/<div[^>]+class="[^"]*dpAstroCard[^"]*"[\s\S]*?<\/div>\s*<\/div>?/gi) ?? [];
  return cards.map((card) => {
    const title = card.match(/dpAstroCardTitle[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const content = card.match(/dpAstroCardContent[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    return {
      Title: stripHtml(title),
      Content: stripHtml(content)
    };
  });
}

export function parseIndraYogaTable(html: string): AstroTableRow[] {
  const cards = html.match(/<div[^>]+class="[^"]*dpElementCard[^"]*"[\s\S]*?<\/div>\s*<\/div>?/gi) ?? [];
  return cards.map((card) => {
    const monthYear = card.match(/dpCardTitle[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? "";
    const day = card.match(/dpDay[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const weekday = card.match(/dpWeekDay[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const yoga = card.match(/dpElementTitle[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const values = Array.from(card.matchAll(/dpValue[^>]*>([\s\S]*?)<\/div>/gi)).map((match) => stripHtml(match[1]));
    return {
      "Month-Year": stripHtml(monthYear),
      Day: stripHtml(day),
      Weekday: stripHtml(weekday),
      Yoga: stripHtml(yoga),
      Begins: values[0] ?? "",
      Ends: values[1] ?? ""
    };
  });
}

export function parsePlanetGochar(html: string): AstroTableRow[] {
  const cards = html.match(/<div[^>]+class="[^"]*dpCard[^"]*"[\s\S]*?<\/div>\s*<\/div>?/gi) ?? [];
  return cards
    .map((card) => {
      const title = card.match(/dpTitle[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const values = Array.from(card.matchAll(/dpValue[^>]*>([\s\S]*?)<\/div>/gi)).map((match) => stripHtml(match[1]));
      const message = card.match(/dpMessage[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const zodiac = stripHtml(title).split(/\s+/)[0] ?? "";
      return {
        Zodiac: zodiac,
        Datetime: values[0] ?? "",
        Note: stripHtml(message),
        "Direct Info": stripHtml(title)
      };
    })
    .filter((row) => row.Zodiac);
}

export function parsePlanetRetrograde(html: string): AstroTableRow[] {
  const cards = html.match(/<div[^>]+class="[^"]*dpCard[^"]*"[\s\S]*?<\/div>\s*<\/div>?/gi) ?? [];
  return cards
    .map((card) => {
      const title = card.match(/dpTitle[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const values = Array.from(card.matchAll(/dpValue[^>]*>([\s\S]*?)<\/div>/gi)).map((match) => stripHtml(match[1]));
      const zodiac = stripHtml(title).split(/\s+/)[0] ?? "";
      return {
        Planet: zodiac,
        "Direct Info": stripHtml(title),
        "Retrograde On": values[0] ?? "",
        "Progressive On": values[1] ?? "",
        "Retrograde Days": values[2] ?? ""
      };
    })
    .filter((row) => row.Planet);
}

export function parseYogaRows(yogaPages: AstroTableRow[][]): AstroTableRow[] {
  return yogaPages.flatMap((rows) => rows);
}

export function selectMonth(rows: AstroTableRow[], monthName: string, year: number): AstroTableRow[] {
  return rows.filter((row) => JSON.stringify(row).includes(monthName) || JSON.stringify(row).includes(String(year)));
}

export function hasLikelyHtmlDocument(html: string): boolean {
  return /<html[\s>]/i.test(html) || /dp(Card|AstroCard|ElementCard)/i.test(html);
}

export function buildFetchHeaders(): HeadersInit {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
  };
}
