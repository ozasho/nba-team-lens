import assert from "node:assert/strict";
import { test } from "node:test";
import { currentDefaults, serveApi } from "../server.mjs";

test("defaults switch salary in July and stats in October", () => {
  const cases = [
    ["2026-06-30", "2025-26", "2025-26"],
    ["2026-07-01", "2025-26", "2026-27"],
    ["2026-09-30", "2025-26", "2026-27"],
    ["2026-10-01", "2026-27", "2026-27"],
    ["2027-01-01", "2026-27", "2026-27"],
    ["2027-10-01", "2027-28", "2027-28"]
  ];
  for (const [date, statsSeason, salarySeason] of cases) {
    const defaults = currentDefaults(new Date(date));
    assert.equal(defaults.statsSeason, statsSeason, date);
    assert.equal(defaults.salarySeason, salarySeason, date);
    assert.equal(defaults.statsSeasons[0], statsSeason);
    assert.equal(defaults.salarySeasons[0], salarySeason);
  }
});

function nbaResponse(rows) {
  const headers = Object.keys(rows[0] || {});
  return Response.json({ resultSets: [{ headers, rowSet: rows.map((row) => headers.map((header) => row[header])) }] });
}

test("bootstrap uses selected-season official standings and isolates upstream failures", async (t) => {
  const requested = [];
  let teams = [];
  let standingsMode = "ok";
  let playerStatsMode = "ok";
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    assert.equal(url.hostname, "stats.nba.com");
    requested.push(url);
    if (url.pathname.endsWith("/leaguedashteamstats")) {
      return nbaResponse([{ TEAM_ID: 1610612737, TEAM_NAME: "Atlanta Hawks", GP: 15, W: 10, L: 5 }]);
    }
    if (url.pathname.endsWith("/leaguedashplayerstats")) {
      const rows = playerStatsMode === "empty" ? [] : [{ PLAYER_ID: 1, PLAYER_NAME: "Player", GP: 15 }];
      return nbaResponse(rows);
    }
    assert.match(url.pathname, /\/leaguestandingsv3$/);
    assert.equal(url.searchParams.get("SeasonType"), "Regular Season");
    if (standingsMode === "down") return new Response(null, { status: 503 });
    const season = standingsMode === "wrong-season" ? "1900" : url.searchParams.get("Season").slice(0, 4);
    return nbaResponse(["East", "West"].flatMap((conference) => teams
      .filter((team) => team.conference === conference)
      .map((team, index) => ({
        TeamID: team.teamId,
        Conference: conference,
        SeasonID: `2${season}`,
        PlayoffRank: index === 0 ? 2 : index === 1 ? 1 : index + 1,
        WINS: 10,
        LOSSES: 5,
        WinPCT: 0.667
      }))));
  });

  const bootstrap = async (query = "") => {
    let body;
    await serveApi({
      writeHead: (status) => assert.equal(status, 200),
      end: (response) => { body = JSON.parse(response); }
    }, new URL(`http://localhost/api/bootstrap${query}`));
    return body;
  };

  const initial = await bootstrap();
  teams = initial.teams;
  assert.equal(initial.statsSeason, currentDefaults().statsSeason);
  assert.equal(initial.teamStats[0].gp, 15);
  assert.equal(initial.standingsFetchedAt, null);
  assert.match(initial.warnings[0], /公式順位/);

  const history = "?statsSeason=2024-25&salarySeason=2025-26&seasonType=Playoffs";
  const historical = await bootstrap(history);
  assert.equal(historical.statsSeason, "2024-25");
  assert.equal(historical.salarySeason, "2025-26");
  assert.equal(historical.standings.length, 30);
  assert.ok(historical.standingsFetchedAt);
  assert.deepEqual(historical.standings.slice(0, 2).map((row) => row.rank), [2, 1]);
  assert.deepEqual(historical.warnings, []);
  assert.ok(requested.slice(-3).every((url) => url.searchParams.get("Season") === "2024-25"));
  assert.equal(requested.at(-1).searchParams.get("SeasonType"), "Regular Season");

  const numRequests = requested.length;
  await bootstrap(history);
  assert.equal(requested.length, numRequests);

  playerStatsMode = "empty";
  standingsMode = "down";
  const refreshed = await bootstrap(`${history}&refresh=1`);
  assert.equal(requested.length, numRequests + 3);
  assert.deepEqual(refreshed.standings, historical.standings);
  assert.equal(refreshed.standingsFetchedAt, historical.standingsFetchedAt);
  assert.equal(refreshed.teamStats.length, 1);
  assert.equal(refreshed.playerStats.length, 1);
  assert.equal(refreshed.warnings.length, 2);
  assert.ok(refreshed.warnings.every((warning) => warning.includes("前回取得分")));

  standingsMode = "wrong-season";
  const wrongSeason = await bootstrap("?statsSeason=2023-24&refresh=1");
  assert.deepEqual(wrongSeason.standings, []);
  assert.equal(wrongSeason.standingsFetchedAt, null);
  assert.match(wrongSeason.warnings.at(-1), /指定年度/);
});
