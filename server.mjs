import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const CACHE_TTL = 1000 * 60 * 20;
const cache = new Map();

const teams = [
  ["ATL", "Atlanta Hawks", "Atlanta", "Hawks", "East", "Southeast", 1610612737, "ATL", "#e03a3e", "#c1d32f"],
  ["BOS", "Boston Celtics", "Boston", "Celtics", "East", "Atlantic", 1610612738, "BOS", "#007a33", "#ba9653"],
  ["BKN", "Brooklyn Nets", "Brooklyn", "Nets", "East", "Atlantic", 1610612751, "BRK", "#000000", "#ffffff"],
  ["CHA", "Charlotte Hornets", "Charlotte", "Hornets", "East", "Southeast", 1610612766, "CHO", "#1d1160", "#00788c"],
  ["CHI", "Chicago Bulls", "Chicago", "Bulls", "East", "Central", 1610612741, "CHI", "#ce1141", "#000000"],
  ["CLE", "Cleveland Cavaliers", "Cleveland", "Cavaliers", "East", "Central", 1610612739, "CLE", "#6f263d", "#ffb81c"],
  ["DAL", "Dallas Mavericks", "Dallas", "Mavericks", "West", "Southwest", 1610612742, "DAL", "#00538c", "#002b5e"],
  ["DEN", "Denver Nuggets", "Denver", "Nuggets", "West", "Northwest", 1610612743, "DEN", "#0e2240", "#fec524"],
  ["DET", "Detroit Pistons", "Detroit", "Pistons", "East", "Central", 1610612765, "DET", "#c8102e", "#1d42ba"],
  ["GSW", "Golden State Warriors", "Golden State", "Warriors", "West", "Pacific", 1610612744, "GSW", "#1d428a", "#ffc72c"],
  ["HOU", "Houston Rockets", "Houston", "Rockets", "West", "Southwest", 1610612745, "HOU", "#ce1141", "#000000"],
  ["IND", "Indiana Pacers", "Indiana", "Pacers", "East", "Central", 1610612754, "IND", "#002d62", "#fdbb30"],
  ["LAC", "LA Clippers", "Los Angeles", "Clippers", "West", "Pacific", 1610612746, "LAC", "#c8102e", "#1d428a"],
  ["LAL", "Los Angeles Lakers", "Los Angeles", "Lakers", "West", "Pacific", 1610612747, "LAL", "#552583", "#fdb927"],
  ["MEM", "Memphis Grizzlies", "Memphis", "Grizzlies", "West", "Southwest", 1610612763, "MEM", "#5d76a9", "#12173f"],
  ["MIA", "Miami Heat", "Miami", "Heat", "East", "Southeast", 1610612748, "MIA", "#98002e", "#f9a01b"],
  ["MIL", "Milwaukee Bucks", "Milwaukee", "Bucks", "East", "Central", 1610612749, "MIL", "#00471b", "#eee1c6"],
  ["MIN", "Minnesota Timberwolves", "Minnesota", "Timberwolves", "West", "Northwest", 1610612750, "MIN", "#0c2340", "#78be20"],
  ["NOP", "New Orleans Pelicans", "New Orleans", "Pelicans", "West", "Southwest", 1610612740, "NOP", "#0c2340", "#c8102e"],
  ["NYK", "New York Knicks", "New York", "Knicks", "East", "Atlantic", 1610612752, "NYK", "#006bb6", "#f58426"],
  ["OKC", "Oklahoma City Thunder", "Oklahoma City", "Thunder", "West", "Northwest", 1610612760, "OKC", "#007ac1", "#ef3b24"],
  ["ORL", "Orlando Magic", "Orlando", "Magic", "East", "Southeast", 1610612753, "ORL", "#0077c0", "#c4ced4"],
  ["PHI", "Philadelphia 76ers", "Philadelphia", "76ers", "East", "Atlantic", 1610612755, "PHI", "#006bb6", "#ed174c"],
  ["PHX", "Phoenix Suns", "Phoenix", "Suns", "West", "Pacific", 1610612756, "PHO", "#1d1160", "#e56020"],
  ["POR", "Portland Trail Blazers", "Portland", "Trail Blazers", "West", "Northwest", 1610612757, "POR", "#e03a3e", "#000000"],
  ["SAC", "Sacramento Kings", "Sacramento", "Kings", "West", "Pacific", 1610612758, "SAC", "#5a2d81", "#63727a"],
  ["SAS", "San Antonio Spurs", "San Antonio", "Spurs", "West", "Southwest", 1610612759, "SAS", "#c4ced4", "#000000"],
  ["TOR", "Toronto Raptors", "Toronto", "Raptors", "East", "Atlantic", 1610612761, "TOR", "#ce1141", "#000000"],
  ["UTA", "Utah Jazz", "Utah", "Jazz", "West", "Northwest", 1610612762, "UTA", "#002b5c", "#f9a01b"],
  ["WAS", "Washington Wizards", "Washington", "Wizards", "East", "Southeast", 1610612764, "WAS", "#002b5c", "#e31837"]
].map(([abbr, name, city, nickname, conference, division, teamId, brRef, primary, secondary]) => ({
  abbr,
  name,
  city,
  nickname,
  conference,
  division,
  teamId,
  brRef,
  hoopshype: `${city} ${nickname}`.toLowerCase().replace(/la clippers/, "los angeles clippers").replace(/\s+/g, "_"),
  primary,
  secondary
}));

teams.find((team) => team.abbr === "LAL").hoopshype = "los_angeles_lakers";
teams.find((team) => team.abbr === "NYK").hoopshype = "new_york_knicks";
teams.find((team) => team.abbr === "NOP").hoopshype = "new_orleans_pelicans";
teams.find((team) => team.abbr === "GSW").hoopshype = "golden_state_warriors";
teams.find((team) => team.abbr === "OKC").hoopshype = "oklahoma_city_thunder";
teams.find((team) => team.abbr === "SAS").hoopshype = "san_antonio_spurs";

const capLines = {
  "2026-27": {
    cap: 164_961_000,
    minimum: 148_465_000,
    tax: 200_428_000,
    firstApron: 209_015_000,
    secondApron: 221_686_000,
    source: "https://www.blazersedge.com/nba-news-rumors/113970/nba-sets-salary-cap-for-2026-27-season"
  },
  "2025-26": {
    cap: 154_647_000,
    minimum: 139_182_000,
    tax: 187_895_000,
    firstApron: 195_945_000,
    secondApron: 207_824_000,
    source: "https://www.nba.com/news/nba-salary-cap-for-2025-26-season-set"
  }
};

const sourceLinks = {
  nbaStats: "https://www.nba.com/stats",
  nbaTeams: "https://www.nba.com/teams",
  basketballReference: "https://www.basketball-reference.com/contracts/",
  hoopshype: "https://hoopshype.com/salaries/",
  salarySwish: "https://www.salaryswish.com/",
  fanspoDraftPicks: "https://fanspo.com/nba/teams"
};

const salarySwishTeams = {
  ATL: "hawks",
  BOS: "celtics",
  BKN: "nets",
  CHA: "hornets",
  CHI: "bulls",
  CLE: "cavaliers",
  DAL: "mavericks",
  DEN: "nuggets",
  DET: "pistons",
  GSW: "warriors",
  HOU: "rockets",
  IND: "pacers",
  LAC: "clippers",
  LAL: "lakers",
  MEM: "grizzlies",
  MIA: "heat",
  MIL: "bucks",
  MIN: "timberwolves",
  NOP: "pelicans",
  NYK: "knicks",
  OKC: "thunder",
  ORL: "magic",
  PHI: "sixers",
  PHX: "suns",
  POR: "trailblazers",
  SAC: "kings",
  SAS: "spurs",
  TOR: "raptors",
  UTA: "jazz",
  WAS: "wizards"
};

const fanspoTeams = {
  ATL: "Hawks/1",
  BOS: "Celtics/2",
  BKN: "Nets/3",
  CHA: "Hornets/4",
  CHI: "Bulls/5",
  CLE: "Cavaliers/6",
  DAL: "Mavericks/7",
  DEN: "Nuggets/8",
  DET: "Pistons/9",
  GSW: "Warriors/10",
  HOU: "Rockets/11",
  IND: "Pacers/12",
  LAC: "Clippers/13",
  LAL: "Lakers/14",
  MEM: "Grizzlies/15",
  MIA: "Heat/16",
  MIL: "Bucks/17",
  MIN: "Timberwolves/18",
  NOP: "Pelicans/19",
  NYK: "Knicks/20",
  OKC: "Thunder/21",
  ORL: "Magic/22",
  PHI: "76ers/23",
  PHX: "Suns/24",
  POR: "Trail%20Blazers/25",
  SAC: "Kings/26",
  SAS: "Spurs/27",
  TOR: "Raptors/28",
  UTA: "Jazz/29",
  WAS: "Wizards/30"
};

function currentDefaults() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  const activeSeason = `${start}-${String(start + 1).slice(-2)}`;
  const statsSeason = month >= 7 ? `${start - 1}-${String(start).slice(-2)}` : activeSeason;
  return {
    activeSeason,
    statsSeason,
    salarySeason: activeSeason
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function normalizeSeasonType(value = "Regular Season") {
  return value.replace(/\+/g, " ");
}

function moneyToNumber(value) {
  if (!value || value === "-") return 0;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function htmlDecode(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]*>/g, "")
    .trim();
}

function extractAttr(html, attr) {
  const match = html.match(new RegExp(`${attr}=["']([^"']*)["']`, "i"));
  return match ? htmlDecode(match[1]) : "";
}

function seasonLabel(start) {
  return `${start}/${String(start + 1).slice(-2)}`;
}

function optionLabels(season) {
  return [
    season?.teamOption ? "Team option" : "",
    season?.playerOption ? "Player option" : "",
    season?.qualifyingOffer ? "Qualifying offer" : "",
    season?.twoWayContract ? "Two-way" : ""
  ].filter(Boolean);
}

function tableRows(resultSet) {
  if (!resultSet) return [];
  const headers = resultSet.headers || resultSet.Headers || [];
  const rows = resultSet.rowSet || resultSet.RowSet || [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function cached(key, producer, forceRefresh = false) {
  const item = cache.get(key);
  if (!forceRefresh && item && Date.now() - item.created < CACHE_TTL) return { ...item.value, cached: true };
  const value = await producer();
  cache.set(key, { created: Date.now(), value });
  return value;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function nbaStats(endpoint, params) {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return fetchJson(url, {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
    Origin: "https://www.nba.com",
    Referer: "https://www.nba.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true"
  });
}

function commonDashParams(season, seasonType, perMode = "PerGame") {
  return {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    GameSegment: "",
    Height: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    MeasureType: "Base",
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PaceAdjust: "N",
    PerMode: perMode,
    Period: "0",
    PlusMinus: "N",
    Rank: "N",
    Season: season,
    SeasonSegment: "",
    SeasonType: seasonType,
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    TwoWay: "0",
    VsConference: "",
    VsDivision: ""
  };
}

async function getTeamStats(season, seasonType) {
  const data = await nbaStats("leaguedashteamstats", commonDashParams(season, seasonType));
  return tableRows(data.resultSets?.[0] || data.resultSet).map((team) => ({
    teamId: team.TEAM_ID,
    team: team.TEAM_NAME,
    gp: team.GP,
    wins: team.W,
    losses: team.L,
    winPct: team.W_PCT,
    pts: team.PTS,
    reb: team.REB,
    ast: team.AST,
    stl: team.STL,
    blk: team.BLK,
    tov: team.TOV,
    fgPct: team.FG_PCT,
    fg3Pct: team.FG3_PCT,
    ftPct: team.FT_PCT,
    plusMinus: team.PLUS_MINUS
  }));
}

async function getPlayerStats(season, seasonType) {
  const data = await nbaStats("leaguedashplayerstats", {
    ...commonDashParams(season, seasonType),
    PlayerExperience: "",
    PlayerPosition: "",
    PtMeasureType: "",
    Weight: ""
  });
  return tableRows(data.resultSets?.[0] || data.resultSet).map((player) => ({
    playerId: player.PLAYER_ID,
    player: player.PLAYER_NAME,
    teamId: player.TEAM_ID,
    team: player.TEAM_ABBREVIATION,
    age: player.AGE,
    gp: player.GP,
    min: player.MIN,
    pts: player.PTS,
    reb: player.REB,
    ast: player.AST,
    stl: player.STL,
    blk: player.BLK,
    fgPct: player.FG_PCT,
    fg3Pct: player.FG3_PCT,
    ftPct: player.FT_PCT,
    plusMinus: player.PLUS_MINUS
  }));
}

async function getRoster(teamId, season) {
  const data = await nbaStats("commonteamroster", {
    LeagueID: "00",
    Season: season,
    TeamID: String(teamId)
  });
  return tableRows(data.resultSets?.[0] || data.resultSet).map((player) => ({
    playerId: player.PLAYER_ID,
    player: player.PLAYER,
    number: player.NUM,
    position: player.POSITION,
    height: player.HEIGHT,
    weight: player.WEIGHT,
    birthDate: player.BIRTH_DATE,
    age: player.AGE,
    exp: player.EXP,
    school: player.SCHOOL
  }));
}

async function getPlayerInfo(playerId) {
  const data = await nbaStats("commonplayerinfo", {
    LeagueID: "00",
    PlayerID: String(playerId)
  });
  const info = tableRows(data.resultSets?.[0] || data.resultSet)?.[0] || {};
  return {
    playerId: info.PERSON_ID || playerId,
    player: info.DISPLAY_FIRST_LAST || info.DISPLAY_FI_LAST || "",
    position: info.POSITION || "",
    height: info.HEIGHT || "",
    weight: info.WEIGHT || "",
    birthDate: info.BIRTHDATE || "",
    age: info.AGE || "",
    exp: info.SEASON_EXP ?? "",
    school: info.SCHOOL || "",
    country: info.COUNTRY || ""
  };
}

function resultSetByName(data, name) {
  return (data.resultSets || []).find((set) => set.name === name);
}

async function getPlayerHistory(playerId, seasonType) {
  const data = await nbaStats("playercareerstats", {
    LeagueID: "00",
    PerMode: "PerGame",
    PlayerID: String(playerId)
  });
  const setName = seasonType === "Playoffs" ? "SeasonTotalsPostSeason" : "SeasonTotalsRegularSeason";
  const rows = tableRows(resultSetByName(data, setName))
    .filter((row) => row.SEASON_ID)
    .sort((a, b) => Number(String(b.SEASON_ID).slice(0, 4)) - Number(String(a.SEASON_ID).slice(0, 4)))
    .slice(0, 5)
    .map((row) => ({
      playerId: row.PLAYER_ID || playerId,
      season: row.SEASON_ID,
      team: row.TEAM_ABBREVIATION || "-",
      age: row.PLAYER_AGE,
      gp: row.GP,
      gs: row.GS,
      min: row.MIN,
      pts: row.PTS,
      reb: row.REB,
      ast: row.AST,
      stl: row.STL,
      blk: row.BLK,
      fgPct: row.FG_PCT,
      fg3Pct: row.FG3_PCT,
      ftPct: row.FT_PCT
    }));
  return rows;
}

function parseContracts(html, salarySeason) {
  const withoutComments = html.replace(/<!--|-->/g, "");
  const table = withoutComments.match(/<table[^>]+id="contracts"[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("Contracts table was not found.");

  const headers = [...table.matchAll(/<th[^>]+data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => ({ stat: match[1], label: htmlDecode(match[2]) }));
  const seasonHeader = headers.find((header) => header.label === salarySeason);
  const salaryStat = seasonHeader?.stat || headers.find((header) => /^\d{4}-\d{2}$/.test(header.label))?.stat || "y1";
  const salaryLabel = seasonHeader?.label || headers.find((header) => header.stat === salaryStat)?.label || salarySeason;
  const targetSeason = salarySeasonStart(salarySeason);
  const seasonHeaders = headers.filter((header) => /^\d{4}-\d{2}$/.test(header.label));

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => rowMatch[1])
    .filter((row) => row.includes('data-stat="player"'))
    .map((row) => {
      const cells = {};
      for (const cellMatch of row.matchAll(/<(?:td|th)[^>]+data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
        cells[cellMatch[1]] = htmlDecode(cellMatch[2]);
      }
      const seasons = seasonHeaders
        .map((header) => {
          const start = salarySeasonStart(header.label);
          const salary = moneyToNumber(cells[header.stat]);
          return {
            season: start,
            label: seasonLabel(start),
            salary,
            salaryText: salary ? formatServerMoney(salary) : "-",
            notes: ""
          };
        })
        .filter((season) => season.season >= targetSeason && season.salary > 0);
      return {
        player: cells.player,
        age: cells.age,
        salary: moneyToNumber(cells[salaryStat]),
        salaryText: cells[salaryStat] || "-",
        guaranteed: cells.guaranteed || "",
        contract: cells.contract || "",
        seasons
      };
    })
    .filter((row) => row.player && row.player !== "Team Totals");

  const total = rows.reduce((sum, player) => sum + player.salary, 0);
  return {
    rows: rows.sort((a, b) => b.salary - a.salary),
    total,
    salaryColumn: salaryLabel,
    salaryYears: [...new Set(rows.flatMap((row) => row.seasons.map((season) => season.season)))].sort((a, b) => a - b)
  };
}

function normalizeSalarySeason(value) {
  return String(value).replace("-", "/");
}

function salarySeasonStart(value) {
  const year = Number(String(value).slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getUTCFullYear();
}

function parseHoopsHypeContracts(html, salarySeason) {
  const nextStart = html.indexOf('<script id="__NEXT_DATA__"');
  if (nextStart >= 0) {
    const jsonStart = html.indexOf(">", nextStart) + 1;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      const nextData = JSON.parse(html.slice(jsonStart, jsonEnd));
      const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
      const contracts = queries
        .map((query) => query?.state?.data?.contracts?.contracts)
        .find((value) => Array.isArray(value));
      if (contracts) {
        const targetSeason = salarySeasonStart(salarySeason);
        const rows = contracts
          .map((contract) => {
            const seasons = (contract.seasons || [])
              .map((item) => {
                const start = Number(item?.season);
                const salary = Number(item?.salary || 0);
                const flags = optionLabels(item);
                return {
                  season: start,
                  label: seasonLabel(start),
                  salary,
                  salaryText: salary ? formatServerMoney(salary) : "-",
                  capAllocation: Number(item?.capAllocation || 0),
                  notes: item?.notes || "",
                  flags
                };
              })
              .filter((item) => Number.isFinite(item.season) && item.season >= targetSeason && item.salary > 0)
              .sort((a, b) => a.season - b.season);
            const season = seasons.find((item) => Number(item.season) === targetSeason);
            return {
              player: contract.playerName,
              age: "",
              salary: Number(season?.salary || 0),
              salaryText: season?.salary ? formatServerMoney(season.salary) : "-",
              guaranteed: season?.notes || "",
              contract: season?.flags?.join(", ") || "",
              updatedAt: contract.updateDate,
              seasons
            };
          })
          .filter((row) => row.player && row.seasons.length)
          .sort((a, b) => b.salary - a.salary);
        return {
          rows,
          total: rows.reduce((sum, player) => sum + player.salary, 0),
          salaryColumn: seasonLabel(targetSeason),
          salaryYears: [...new Set(rows.flatMap((row) => row.seasons.map((season) => season.season)))].sort((a, b) => a - b)
        };
      }
    }
  }

  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("HoopsHype salary table was not found.");

  const rawHeaders = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => htmlDecode(match[1]))
    .filter(Boolean);
  const headers = rawHeaders.map((label) => label.replace(/\s+/g, " ").trim());
  const seasonLabels = headers.filter((label) => /^\d{4}\/\d{2}$/.test(label));
  const targetLabel = normalizeSalarySeason(salarySeason);
  const targetSeason = salarySeasonStart(salarySeason);
  const seasonIndex = Math.max(0, seasonLabels.indexOf(targetLabel));

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => rowMatch[1])
    .map((row) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => htmlDecode(match[1]));
      if (cells.length < 2) return null;
      const player = cells[0].replace(/\s+/g, " ").trim();
      const salaryText = cells[seasonIndex + 1] || cells[1] || "-";
      const seasons = seasonLabels
        .map((label, index) => {
          const start = salarySeasonStart(label);
          const salary = moneyToNumber(cells[index + 1]);
          return {
            season: start,
            label,
            salary,
            salaryText: salary ? formatServerMoney(salary) : "-",
            notes: ""
          };
        })
        .filter((season) => season.season >= targetSeason && season.salary > 0);
      return {
        player,
        age: "",
        salary: moneyToNumber(salaryText),
        salaryText,
        guaranteed: "",
        contract: "",
        seasons
      };
    })
    .filter((row) => row?.player && row.player !== "Player");

  const totalRow = rows.find((row) => row.player.toLowerCase() === "totals");
  const playerRows = rows.filter((row) => row.player.toLowerCase() !== "totals");
  const total = totalRow?.salary || playerRows.reduce((sum, player) => sum + player.salary, 0);

  return {
    rows: playerRows.sort((a, b) => b.salary - a.salary),
    total,
    salaryColumn: seasonLabels[seasonIndex] || targetLabel,
    salaryYears: [...new Set(playerRows.flatMap((row) => row.seasons.map((season) => season.season)))].sort((a, b) => a - b)
  };
}

function formatServerMoney(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

async function getHoopsHypeContracts(team, salarySeason) {
  const url = `https://hoopshype.com/salaries/${team.hoopshype}/`;
  const html = await fetchText(url, {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
  });
  return { ...parseHoopsHypeContracts(html, salarySeason), url, provider: "HoopsHype" };
}

async function getContracts(team, salarySeason) {
  const errors = [];
  try {
    return await getHoopsHypeContracts(team, salarySeason);
  } catch (error) {
    errors.push(`HoopsHype: ${error.message}`);
  }

  const url = `https://www.basketball-reference.com/contracts/${team.brRef}.html`;
  try {
    const html = await fetchText(url, {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    });
    return { ...parseContracts(html, salarySeason), url, provider: "Basketball-Reference" };
  } catch (error) {
    errors.push(`Basketball-Reference: ${error.message}`);
  }

  throw new Error(errors.join(" / "));
}

function htmlToLines(html) {
  return htmlDecode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseFanspoPickSection(lines, startLabel, endLabel, direction) {
  const start = lines.findIndex((line) => line === startLabel);
  if (start < 0) return [];
  const end = endLabel ? lines.findIndex((line, index) => index > start && line === endLabel) : lines.length;
  const section = lines.slice(start + 1, end > start ? end : lines.length)
    .filter((line) => !["*", "* * *", "Year", "Round", "#", "From", "To", "Year Round#From", "Year Round#To"].includes(line));

  const picks = [];
  let current = null;
  const pickPattern = /^(20\d{2})\s+([12])-(.+)$/;

  for (let index = 0; index < section.length; index += 1) {
    const line = section[index];
    const match = line.match(pickPattern);
    if (match) {
      current = {
        year: Number(match[1]),
        round: Number(match[2]),
        counterparty: match[3].trim(),
        direction,
        protections: []
      };
      picks.push(current);
      continue;
    }

    if (/^20\d{2}$/.test(line) && /^[12]$/.test(section[index + 1]) && section[index + 2] === "-") {
      current = {
        year: Number(line),
        round: Number(section[index + 1]),
        counterparty: section[index + 3] || "Unknown",
        direction,
        protections: []
      };
      picks.push(current);
      index += 3;
      continue;
    }

    if (!current || line === "SHARE") continue;
    const last = current.protections[current.protections.length - 1];
    if (line !== last) current.protections.push(line);
  }

  return picks.map((pick) => ({
    ...pick,
    protections: pick.protections.join(" ")
  }));
}

function parseDraftPicks(html) {
  const lines = htmlToLines(html);
  const incoming = parseFanspoPickSection(lines, "Incoming Draft Picks", "Outgoing Draft Picks", "incoming");
  const outgoing = parseFanspoPickSection(lines, "Outgoing Draft Picks", "Popular Tools", "outgoing");
  return {
    incoming,
    outgoing,
    summary: {
      incomingFirsts: incoming.filter((pick) => pick.round === 1).length,
      incomingSeconds: incoming.filter((pick) => pick.round === 2).length,
      outgoingFirsts: outgoing.filter((pick) => pick.round === 1).length,
      outgoingSeconds: outgoing.filter((pick) => pick.round === 2).length
    }
  };
}

function normalizeTeamName(value = "") {
  return value.replace(/^LA Clippers$/, "Los Angeles Clippers").trim();
}

function parseSalarySwishDraftPicks(html, team) {
  const table = html.match(/<table[^>]+id="sw_teamProfile__draftTable"[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("SalarySwish draft table was not found.");

  const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => htmlDecode(match[1]))
    .filter(Boolean);
  const years = headers.slice(1).map((header) => Number(header)).filter(Number.isFinite);
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const incoming = [];
  const outgoing = [];
  const ownTeamName = normalizeTeamName(team.name);

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    const round = Number(htmlDecode(cells[0] || "").match(/[12]/)?.[0]);
    if (!round) continue;

    for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
      const year = years[cellIndex - 1];
      const cell = cells[cellIndex] || "";
      const images = [...cell.matchAll(/<img\b[^>]*alt=["']Logo of the ([^"']+)["'][^>]*>/gi)];
      let previousEnd = 0;

      images.forEach((imageMatch, imageIndex) => {
        const segment = cell.slice(previousEnd, imageMatch.index);
        const afterImage = cell.slice(imageMatch.index, images[imageIndex + 1]?.index || cell.length);
        previousEnd = imageMatch.index + imageMatch[0].length;

        const titleMatches = [...segment.matchAll(/title=["']([^"']*)["']/gi)];
        const rawTitle = titleMatches.at(-1)?.[1] || "";
        const title = htmlDecode(rawTitle).replace(/\s*click to view full details\.?/i, "").replace(/\s*Click to view full trade details\.?/i, "").trim();
        const hrefMatches = [...segment.matchAll(/href=["']([^"']*)["']/gi)];
        const href = hrefMatches.at(-1)?.[1] || "";
        const pickTeam = normalizeTeamName(htmlDecode(imageMatch[1]));
        const traded = /d_pick_traded/.test(segment);
        const conditional = /condit|inContention/i.test(segment + afterImage);
        const direction = traded ? "outgoing" : "incoming";
        const counterparty = traded
          ? `${pickTeam} pick`
          : pickTeam === ownTeamName
            ? "Own pick"
            : `${pickTeam} pick`;
        const protections = [
          title || (traded ? "Traded away" : "Currently retained"),
          conditional && !/contention|condition/i.test(title) ? "Conditional / unresolved" : ""
        ].filter(Boolean).join(" ");
        const pick = {
          year,
          round,
          counterparty,
          direction,
          protections,
          url: href ? `https://www.salaryswish.com${href}` : ""
        };

        if (traded) outgoing.push(pick);
        else incoming.push(pick);
      });
    }
  }

  return {
    incoming,
    outgoing,
    summary: {
      incomingFirsts: incoming.filter((pick) => pick.round === 1).length,
      incomingSeconds: incoming.filter((pick) => pick.round === 2).length,
      outgoingFirsts: outgoing.filter((pick) => pick.round === 1).length,
      outgoingSeconds: outgoing.filter((pick) => pick.round === 2).length
    }
  };
}

async function getSalarySwishDraftPicks(team) {
  const slug = salarySwishTeams[team.abbr];
  if (!slug) throw new Error("SalarySwish team mapping was not found.");
  const url = `https://www.salaryswish.com/teams/${slug}`;
  const html = await fetchText(url, {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
  });
  return { ...parseSalarySwishDraftPicks(html, team), url, provider: "SalarySwish" };
}

async function getFanspoDraftPicks(team) {
  const fanspoTeam = fanspoTeams[team.abbr];
  if (!fanspoTeam) throw new Error("Fanspo team mapping was not found.");
  const url = `https://fanspo.com/nba/teams/${fanspoTeam}/draft-picks`;
  const html = await fetchText(url, {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
  });
  return { ...parseDraftPicks(html), url, provider: "Fanspo" };
}

async function getDraftPicks(team) {
  const errors = [];
  try {
    return await getSalarySwishDraftPicks(team);
  } catch (error) {
    errors.push(`SalarySwish: ${error.message}`);
  }

  try {
    return await getFanspoDraftPicks(team);
  } catch (error) {
    errors.push(`Fanspo: ${error.message}`);
  }

  throw new Error(errors.join(" / "));
}

function getFallbackDashboard(statsSeason, salarySeason, seasonType, warning) {
  return {
    defaults: currentDefaults(),
    teams,
    capLines,
    sourceLinks,
    statsSeason,
    salarySeason,
    seasonType,
    generatedAt: new Date().toISOString(),
    warnings: [warning],
    teamStats: [],
    playerStats: []
  };
}

async function serveApi(req, res, url) {
  const defaults = currentDefaults();
  const statsSeason = url.searchParams.get("statsSeason") || defaults.statsSeason;
  const salarySeason = url.searchParams.get("salarySeason") || defaults.salarySeason;
  const seasonType = normalizeSeasonType(url.searchParams.get("seasonType") || "Regular Season");
  const forceRefresh = url.searchParams.has("refresh");

  if (url.pathname === "/api/bootstrap") {
    try {
      const payload = await cached(`bootstrap:${statsSeason}:${seasonType}`, async () => ({
        defaults,
        teams,
        capLines,
        sourceLinks,
        statsSeason,
        salarySeason,
        seasonType,
        generatedAt: new Date().toISOString(),
        warnings: [],
        teamStats: await getTeamStats(statsSeason, seasonType),
        playerStats: await getPlayerStats(statsSeason, seasonType)
      }), forceRefresh);
      json(res, 200, { ...payload, salarySeason });
    } catch (error) {
      json(res, 200, getFallbackDashboard(statsSeason, salarySeason, seasonType, `NBA Stats の取得に失敗しました: ${error.message}`));
    }
    return;
  }

  const rosterMatch = url.pathname.match(/^\/api\/roster\/(\d+)$/);
  if (rosterMatch) {
    try {
      const teamId = Number(rosterMatch[1]);
      const roster = await cached(`roster:${teamId}:${salarySeason}`, async () => ({
        roster: await getRoster(teamId, salarySeason),
        generatedAt: new Date().toISOString(),
        warnings: []
      }), forceRefresh);
      json(res, 200, roster);
    } catch (error) {
      json(res, 200, { roster: [], generatedAt: new Date().toISOString(), warnings: [`ロスター取得に失敗しました: ${error.message}`] });
    }
    return;
  }

  const playerInfoMatch = url.pathname.match(/^\/api\/player-info\/(\d+)$/);
  if (playerInfoMatch) {
    try {
      const playerId = Number(playerInfoMatch[1]);
      const playerInfo = await cached(`player-info:${playerId}`, async () => ({
        playerInfo: await getPlayerInfo(playerId),
        generatedAt: new Date().toISOString(),
        warnings: []
      }), forceRefresh);
      json(res, 200, playerInfo);
    } catch (error) {
      json(res, 200, { playerInfo: null, generatedAt: new Date().toISOString(), warnings: [`選手詳細取得に失敗しました: ${error.message}`] });
    }
    return;
  }

  const playerHistoryMatch = url.pathname.match(/^\/api\/player-history\/(\d+)$/);
  if (playerHistoryMatch) {
    try {
      const playerId = Number(playerHistoryMatch[1]);
      const history = await cached(`player-history:${playerId}:${seasonType}`, async () => ({
        history: await getPlayerHistory(playerId, seasonType),
        generatedAt: new Date().toISOString(),
        warnings: []
      }), forceRefresh);
      json(res, 200, history);
    } catch (error) {
      json(res, 200, { history: [], generatedAt: new Date().toISOString(), warnings: [`過去スタッツ取得に失敗しました: ${error.message}`] });
    }
    return;
  }

  const salaryMatch = url.pathname.match(/^\/api\/salary\/([A-Z]{3})$/);
  if (salaryMatch) {
    const team = teams.find((item) => item.abbr === salaryMatch[1]);
    if (!team) {
      json(res, 404, { error: "Unknown team" });
      return;
    }
    try {
      const contracts = await cached(`salary:${team.abbr}:${salarySeason}`, async () => ({
        contracts: await getContracts(team, salarySeason),
        generatedAt: new Date().toISOString(),
        warnings: []
      }), forceRefresh);
      json(res, 200, contracts);
    } catch (error) {
      json(res, 200, { contracts: { rows: [], total: 0, salaryColumn: salarySeason, url: `https://www.basketball-reference.com/contracts/${team.brRef}.html` }, generatedAt: new Date().toISOString(), warnings: [`サラリー取得に失敗しました: ${error.message}`] });
    }
    return;
  }

  const draftPickMatch = url.pathname.match(/^\/api\/draft-picks\/([A-Z]{3})$/);
  if (draftPickMatch) {
    const team = teams.find((item) => item.abbr === draftPickMatch[1]);
    if (!team) {
      json(res, 404, { error: "Unknown team" });
      return;
    }
    try {
      const draftPicks = await cached(`draft-picks:${team.abbr}`, async () => ({
        draftPicks: await getDraftPicks(team),
        generatedAt: new Date().toISOString(),
        warnings: []
      }), forceRefresh);
      json(res, 200, draftPicks);
    } catch (error) {
      json(res, 200, {
        draftPicks: {
          incoming: [],
          outgoing: [],
          summary: { incomingFirsts: 0, incomingSeconds: 0, outgoingFirsts: 0, outgoingSeconds: 0 },
          url: salarySwishTeams[team.abbr] ? `https://www.salaryswish.com/teams/${salarySwishTeams[team.abbr]}` : "https://www.salaryswish.com/",
          provider: "SalarySwish"
        },
        generatedAt: new Date().toISOString(),
        warnings: [`ドラフト指名権取得に失敗しました: ${error.message}`]
      });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await serveApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NBA Team Lens running at http://${HOST}:${PORT}`);
});
