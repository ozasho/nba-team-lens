const state = {
  teams: [],
  teamStats: [],
  playerStats: [],
  standingsByTeam: new Map(),
  statsSeason: "",
  salarySeason: "",
  seasonType: "Regular Season",
  statsFetchedAt: null,
  standingsFetchedAt: null,
  capLines: {},
  sources: {},
  playerInfo: {},
  selectedAbbr: "LAL",
  teamOrder: "standings",
  search: "",
  roster: [],
  contracts: null,
  draftPicks: null,
  playerCards: {},
  playerHistory: {},
  selectedPlayerKey: "",
  detailRequestId: 0,
  bootstrapLoading: false,
  refreshToken: "",
  refreshMode: false,
  lastFetchMessage: "",
  bootstrapWarnings: [],
  warnings: []
};

const elements = {
  statsSeason: document.querySelector("#statsSeason"),
  salarySeason: document.querySelector("#salarySeason"),
  seasonType: document.querySelector("#seasonType"),
  refreshBtn: document.querySelector("#refreshBtn"),
  searchInput: document.querySelector("#searchInput"),
  teamOrder: document.querySelector("#teamOrder"),
  teamList: document.querySelector("#teamList"),
  teamHero: document.querySelector("#teamHero"),
  teamConference: document.querySelector("#teamConference"),
  teamName: document.querySelector("#teamName"),
  teamMeta: document.querySelector("#teamMeta"),
  nbaTeamLink: document.querySelector("#nbaTeamLink"),
  salaryLink: document.querySelector("#salaryLink"),
  updatedAt: document.querySelector("#updatedAt"),
  standingsUpdatedAt: document.querySelector("#standingsUpdatedAt"),
  fetchStatus: document.querySelector("#fetchStatus"),
  fetchWarnings: document.querySelector("#fetchWarnings"),
  kpiGrid: document.querySelector("#kpiGrid"),
  rosterCount: document.querySelector("#rosterCount"),
  rosterTable: document.querySelector("#rosterTable"),
  salaryColumn: document.querySelector("#salaryColumn"),
  capTotal: document.querySelector("#capTotal"),
  capTrack: document.querySelector("#capTrack"),
  capLegend: document.querySelector("#capLegend"),
  salaryList: document.querySelector("#salaryList"),
  salaryMatrix: document.querySelector("#salaryMatrix"),
  draftLink: document.querySelector("#draftLink"),
  draftSummary: document.querySelector("#draftSummary"),
  incomingPicks: document.querySelector("#incomingPicks"),
  outgoingPicks: document.querySelector("#outgoingPicks"),
  playerOverlay: document.querySelector("#playerOverlay"),
  playerDetails: document.querySelector("#playerDetails"),
  playerClose: document.querySelector("#playerClose"),
  toastHost: document.querySelector("#toastHost"),
  teamRankings: document.querySelector("#teamRankings"),
  rankingsSeason: document.querySelector("#rankingsSeason"),
  leagueLeaders: document.querySelector("#leagueLeaders")
};

const formatNumber = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const formatMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function moneyShort(value) {
  if (!value) return "$0";
  return `$${formatNumber.format(value / 1_000_000)}M`;
}

function salarySeasonStart(value) {
  const year = Number(String(value).slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function salarySeasonLabel(start) {
  return `${start}/${String(start + 1).slice(-2)}`;
}

function pct(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `${formatNumber.format(Number(value) * 100)}%`;
}

function num(value) {
  if (value === null || value === undefined || value === "") return "-";
  return formatNumber.format(Number(value));
}

function statValue(value, suffix = "") {
  const text = suffix === "%" ? pct(value) : num(value);
  return text === "-" ? "-" : `${text}${suffix && suffix !== "%" ? suffix : ""}`;
}

function selectedTeam() {
  return state.teams.find((team) => team.abbr === state.selectedAbbr) || state.teams[0];
}

function selectedTeamStats() {
  const team = selectedTeam();
  return state.teamStats.find((item) => Number(item.teamId) === Number(team?.teamId));
}

function teamPlayers() {
  const team = selectedTeam();
  return state.playerStats
    .filter((player) => Number(player.teamId) === Number(team?.teamId))
    .sort((a, b) => Number(b.pts || 0) - Number(a.pts || 0));
}

function standingFor(team) {
  return state.standingsByTeam.get(team.teamId);
}

function orderedTeamList(teams) {
  if (state.teamOrder === "abc") {
    return teams
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => ({ type: "team", team }));
  }

  return ["East", "West"].flatMap((conference) => {
    const conferenceTeams = teams
      .filter((team) => team.conference === conference)
      .sort((a, b) => (standingFor(a)?.rank ?? Infinity) - (standingFor(b)?.rank ?? Infinity)
        || a.name.localeCompare(b.name));
    if (!conferenceTeams.length) return [];
    return [
      { type: "header", label: conference === "East" ? "Eastern Conference" : "Western Conference" },
      ...conferenceTeams.map((team) => ({ type: "team", team }))
    ];
  });
}

function playerPhoto(playerId) {
  return playerId ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png` : "";
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "NBA";
}

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function playerLookupMaps() {
  return {
    statsByName: new Map(state.playerStats.map((player) => [normalizeName(player.player), player])),
    rosterByName: new Map(state.roster.map((player) => [normalizeName(player.player), player]))
  };
}

function resolveSalaryPlayer(contract) {
  const { statsByName, rosterByName } = playerLookupMaps();
  const key = normalizeName(contract.player);
  const rosterPlayer = rosterByName.get(key) || {};
  const statsPlayer = statsByName.get(key) || {};
  const playerId = rosterPlayer.playerId || statsPlayer.playerId || contract.playerId;
  const info = playerId ? state.playerInfo[String(playerId)] || {} : {};
  return {
    ...info,
    ...rosterPlayer,
    playerId,
    player: contract.player,
    salary: contract.salary,
    contract: contract.contract,
    salaryText: contract.salaryText,
    statsPlayer
  };
}

function topLeague(metric, label) {
  const leader = [...state.playerStats]
    .filter((player) => Number(player.gp || 0) > 0)
    .sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0))[0];
  return { label, leader, value: leader ? num(leader[metric]) : "-" };
}

function setLoading(message) {
  elements.fetchStatus.textContent = message;
  elements.fetchStatus.className = "";
  elements.refreshBtn.disabled = true;
  elements.statsSeason.disabled = true;
  elements.salarySeason.disabled = true;
  elements.seasonType.disabled = true;
}

function setReady() {
  elements.fetchStatus.textContent = state.warnings.length ? "一部取得エラー" : state.lastFetchMessage || "取得完了";
  elements.fetchStatus.className = state.warnings.length ? "warning" : "";
  elements.refreshBtn.disabled = false;
  elements.statsSeason.disabled = !elements.statsSeason.options.length;
  elements.salarySeason.disabled = !elements.salarySeason.options.length;
  elements.seasonType.disabled = false;
}

function renderTeamList() {
  const keyword = state.search.trim().toLowerCase();
  const teams = state.teams.filter((team) => {
    const text = `${team.name} ${team.abbr} ${team.city}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });
  elements.teamList.innerHTML = orderedTeamList(teams)
    .map((item) => {
      if (item.type === "header") return `<div class="team-group-label">${item.label}</div>`;
      const team = item.team;
      const standing = standingFor(team);
      const record = standing
        ? state.teamOrder === "standings"
          ? `#${standing.rank} ${standing.wins}-${standing.losses}`
          : `${standing.wins}-${standing.losses}`
        : team.conference;
      return `
        <button class="team-button ${team.abbr === state.selectedAbbr ? "active" : ""}" data-abbr="${team.abbr}" type="button">
          <span class="team-logo" style="background:${team.primary}; color:${team.secondary === "#ffffff" ? "#fff" : "#fff"}">${team.abbr}</span>
          <span>
            <strong>${team.name}</strong>
            <span>${team.division}</span>
          </span>
          <strong>${record}</strong>
        </button>
      `;
    })
    .join("");

  elements.teamList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.bootstrapLoading) return;
      state.selectedAbbr = button.dataset.abbr;
      state.roster = [];
      state.contracts = null;
      state.draftPicks = null;
      closePlayerDetails();
      render();
      await loadTeamDetails();
    });
  });
}

function renderHero() {
  const team = selectedTeam();
  const stats = selectedTeamStats();
  if (!team) return;
  elements.teamHero.style.background = `linear-gradient(135deg, ${team.primary}, ${team.secondary})`;
  elements.teamConference.textContent = `${team.conference} / ${team.division}`;
  elements.teamName.textContent = team.name;
  elements.teamMeta.textContent = stats
    ? `${elements.statsSeason.value} ${elements.seasonType.value}: ${stats.wins}勝 ${stats.losses}敗、平均 ${num(stats.pts)} 得点、得失点差 ${num(stats.plusMinus)}`
    : "チーム成績を取得できませんでした。";
  elements.nbaTeamLink.href = `https://www.nba.com/${team.nickname.toLowerCase().replace(/\s+/g, "")}`;
  elements.salaryLink.href = state.contracts?.url || `https://www.basketball-reference.com/contracts/${team.brRef}.html`;
}

function renderKpis() {
  const stats = selectedTeamStats();
  const contracts = state.contracts;
  const cap = state.capLines[elements.salarySeason.value];
  const band = capBand(contracts?.total || 0, cap);
  const cards = [
    ["勝率", stats ? pct(stats.winPct) : "-", stats ? `${stats.wins}-${stats.losses}` : "No team stats"],
    ["平均得点", stats ? num(stats.pts) : "-", "PTS / Game"],
    ["平均アシスト", stats ? num(stats.ast) : "-", "AST / Game"],
    ["CBA区分", band.label, contracts ? moneyShort(contracts.total) : "Salary loading"]
  ];
  elements.kpiGrid.innerHTML = cards
    .map(([label, value, note]) => `
      <div class="kpi-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `)
    .join("");
}

function renderRoster() {
  const statsById = new Map(state.playerStats.map((player) => [String(player.playerId), player]));
  const statsByName = new Map(state.playerStats.map((player) => [normalizeName(player.player), player]));
  const salaryRows = state.contracts?.rows || [];
  const rows = salaryRows.length
    ? salaryRows.map((contract) => resolveSalaryPlayer(contract))
    : teamPlayers().map((player) => ({ playerId: player.playerId, player: player.player, position: "-", age: player.age, exp: "-", school: player.team }));

  state.playerCards = {};
  elements.rosterCount.textContent = salaryRows.length ? `${rows.length} salary players` : `${rows.length} players`;
  elements.rosterTable.innerHTML = rows
    .map((player) => {
      const stats = statsById.get(String(player.playerId)) || player.statsPlayer || statsByName.get(normalizeName(player.player)) || {};
      const photo = playerPhoto(player.playerId || stats.playerId);
      const statNote = stats.player ? `${elements.statsSeason.value} / ${stats.team}` : "No NBA stats";
      const salaryNote = player.salary ? ` / ${moneyShort(player.salary)}` : "";
      const position = player.position || player.POSITION || "-";
      const exp = player.exp || player.seasonExp || player.SEASON_EXP;
      const playerKey = String(player.playerId || stats.playerId || normalizeName(player.player));
      state.playerCards[playerKey] = {
        ...player,
        key: playerKey,
        photo,
        position,
        exp,
        stats,
        statNote,
        salaryNote
      };
      return `
        <tr class="player-row" data-player-key="${playerKey}" tabindex="0" aria-label="${player.player}の詳細を表示">
          <td>
            <span class="player-cell">
              <span class="headshot" data-fallback="${initials(player.player)}">
                ${photo ? `<img src="${photo}" alt="${player.player}" loading="lazy" onerror="this.remove(); this.parentElement.dataset.fallback='${initials(player.player)}';" />` : ""}
              </span>
              <span class="player-name">
                <strong>${player.player}</strong>
                <small>${statNote}${salaryNote}${player.school ? ` / ${player.school}` : ""}</small>
              </span>
            </span>
          </td>
          <td>${position}</td>
          <td>${player.age || stats.age || "-"}</td>
          <td>${exp === 0 ? "R" : exp || "-"}</td>
          <td>${num(stats.pts)}</td>
          <td>${num(stats.reb)}</td>
          <td>${num(stats.ast)}</td>
          <td>${pct(stats.fg3Pct)}</td>
        </tr>
      `;
    })
    .join("");

  elements.rosterTable.querySelectorAll(".player-row").forEach((row) => {
    row.addEventListener("click", () => openPlayerDetails(row.dataset.playerKey));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlayerDetails(row.dataset.playerKey);
      }
    });
  });
}

function openPlayerDetails(playerKey) {
  state.selectedPlayerKey = playerKey;
  renderPlayerDetails();
  loadPlayerHistory(playerKey);
}

function closePlayerDetails() {
  state.selectedPlayerKey = "";
  if (elements.playerOverlay) elements.playerOverlay.hidden = true;
}

function renderPlayerDetails() {
  const player = state.playerCards[state.selectedPlayerKey];
  if (!player || !elements.playerOverlay) {
    if (elements.playerOverlay) elements.playerOverlay.hidden = true;
    return;
  }

  const stats = player.stats || {};
  const playerId = player.playerId || stats.playerId;
  const historyKey = playerHistoryKey(playerId);
  const historyState = state.playerHistory[historyKey] || {};
  const hasStats = Boolean(stats.player);
  const exp = player.exp === 0 ? "R" : player.exp || "-";
  const metrics = [
    ["GP", stats.gp],
    ["MIN", stats.min],
    ["PTS", stats.pts],
    ["REB", stats.reb],
    ["AST", stats.ast],
    ["STL", stats.stl],
    ["BLK", stats.blk],
    ["FG%", stats.fgPct, "%"],
    ["3P%", stats.fg3Pct, "%"],
    ["FT%", stats.ftPct, "%"],
    ["+/-", stats.plusMinus]
  ];

  elements.playerDetails.innerHTML = `
    <div class="player-detail-head">
      <span class="detail-headshot" data-fallback="${initials(player.player)}">
        ${player.photo ? `<img src="${player.photo}" alt="${player.player}" onerror="this.remove(); this.parentElement.dataset.fallback='${initials(player.player)}';" />` : ""}
      </span>
      <div>
        <p class="eyebrow">${stats.team || selectedTeam()?.abbr || "NBA"} / ${elements.statsSeason.value}</p>
        <h3>${player.player}</h3>
        <div class="player-detail-meta">
          <span>${player.position || "-"}</span>
          <span>Age ${player.age || stats.age || "-"}</span>
          <span>EXP ${exp}</span>
          ${player.salary ? `<span>${moneyShort(player.salary)}</span>` : ""}
        </div>
      </div>
    </div>
    ${hasStats ? `
      <div class="player-stat-grid">
        ${metrics.map(([label, value, suffix]) => `
          <div>
            <span>${label}</span>
            <strong>${statValue(value, suffix)}</strong>
          </div>
        `).join("")}
      </div>
    ` : '<div class="player-detail-empty">この年度のNBA主要スタッツは見つかりませんでした。</div>'}
    <div class="player-detail-foot">
      <span>${player.school || player.country || ""}</span>
      <span>${player.contract || player.guaranteed || ""}</span>
    </div>
    ${renderPlayerHistory(historyState, Boolean(playerId))}
  `;
  elements.playerOverlay.hidden = false;
}

function playerHistoryKey(playerId) {
  return playerId ? `${playerId}:${elements.seasonType.value}` : "";
}

function renderPlayerHistory(historyState, hasPlayerId) {
  if (!hasPlayerId) {
    return '<div class="player-history-section"><div class="player-detail-empty">選手IDがないため過去スタッツを取得できません。</div></div>';
  }
  if (historyState.loading) {
    return '<div class="player-history-section"><div class="player-detail-empty">過去5年分のスタッツを取得中です。</div></div>';
  }
  if (historyState.warning) {
    return `<div class="player-history-section"><div class="player-detail-empty">${historyState.warning}</div></div>`;
  }
  const rows = historyState.rows || [];
  if (!rows.length) {
    return '<div class="player-history-section"><div class="player-detail-empty">過去5年分のスタッツは見つかりませんでした。</div></div>';
  }

  return `
    <div class="player-history-section">
      <div class="player-history-head">
        <strong>過去5シーズン</strong>
        <span>${elements.seasonType.value} / Per Game</span>
      </div>
      <div class="player-history-wrap">
        <table class="player-history-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Team</th>
              <th>GP</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>FG%</th>
              <th>3P%</th>
              <th>FT%</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${row.season}</td>
                <td>${row.team || "-"}</td>
                <td>${num(row.gp)}</td>
                <td>${num(row.min)}</td>
                <td>${num(row.pts)}</td>
                <td>${num(row.reb)}</td>
                <td>${num(row.ast)}</td>
                <td>${num(row.stl)}</td>
                <td>${num(row.blk)}</td>
                <td>${pct(row.fgPct)}</td>
                <td>${pct(row.fg3Pct)}</td>
                <td>${pct(row.ftPct)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function capStatus(total, cap) {
  if (!cap) return "Cap line unknown";
  if (total >= cap.secondApron) return `Second apron +${moneyShort(total - cap.secondApron)}`;
  if (total >= cap.firstApron) return `First apron +${moneyShort(total - cap.firstApron)}`;
  if (total >= cap.tax) return `Tax +${moneyShort(total - cap.tax)}`;
  if (total >= cap.cap) return `Over cap by ${moneyShort(total - cap.cap)}`;
  return `Cap room ${moneyShort(cap.cap - total)}`;
}

function capBand(total, cap) {
  if (!cap) {
    return {
      label: "基準未設定",
      detail: "この年度のCBA基準は未設定です。",
      tone: "neutral",
      next: ""
    };
  }
  if (!total) {
    return {
      label: "取得待ち",
      detail: "サラリー取得後にCBA区分を判定します。",
      tone: "neutral",
      next: ""
    };
  }
  if (total < cap.minimum) {
    return {
      label: "サラリー下限未満",
      detail: `Minimum salary floor まで ${moneyShort(cap.minimum - total)}。`,
      tone: "room",
      next: `Cap まで ${moneyShort(cap.cap - total)}`
    };
  }
  if (total < cap.cap) {
    return {
      label: "キャップ以下",
      detail: `Salary cap まで ${moneyShort(cap.cap - total)}。`,
      tone: "room",
      next: `Tax まで ${moneyShort(cap.tax - total)}`
    };
  }
  if (total < cap.tax) {
    return {
      label: "キャップ超過 / Tax未満",
      detail: `Tax line まで ${moneyShort(cap.tax - total)}。`,
      tone: "over-cap",
      next: `1st Apron まで ${moneyShort(cap.firstApron - total)}`
    };
  }
  if (total < cap.firstApron) {
    return {
      label: "Tax以上 / 1st Apron未満",
      detail: `1st Apron まで ${moneyShort(cap.firstApron - total)}。`,
      tone: "tax",
      next: `2nd Apron まで ${moneyShort(cap.secondApron - total)}`
    };
  }
  if (total < cap.secondApron) {
    return {
      label: "1st Apron以上 / 2nd Apron未満",
      detail: `2nd Apron まで ${moneyShort(cap.secondApron - total)}。`,
      tone: "first-apron",
      next: `1st Apron超過 ${moneyShort(total - cap.firstApron)}`
    };
  }
  return {
    label: "2nd Apron以上",
    detail: `2nd Apron超過 ${moneyShort(total - cap.secondApron)}。`,
    tone: "second-apron",
    next: `1st Apron超過 ${moneyShort(total - cap.firstApron)}`
  };
}

function renderSalary() {
  const contracts = state.contracts || { rows: [], total: 0, salaryColumn: elements.salarySeason.value };
  const cap = state.capLines[elements.salarySeason.value];
  const band = capBand(contracts.total, cap);
  const maxLine = Math.max(cap?.secondApron || 1, contracts.total || 1);
  elements.salaryColumn.textContent = contracts.salaryColumn || elements.salarySeason.value;
  elements.capTotal.textContent = moneyShort(contracts.total);
  elements.capTrack.innerHTML = `
    <div class="cap-fill" style="width:${Math.min(100, (contracts.total / maxLine) * 100)}%"></div>
    ${cap ? `<span class="cap-marker" style="left:${(cap.cap / maxLine) * 100}%"></span>
    <span class="cap-marker" style="left:${(cap.tax / maxLine) * 100}%"></span>
    <span class="cap-marker" style="left:${(cap.firstApron / maxLine) * 100}%"></span>
    <span class="cap-marker" style="left:${(cap.secondApron / maxLine) * 100}%"></span>` : ""}
  `;
  elements.capLegend.innerHTML = cap
    ? `
      <div class="cap-position ${band.tone}">
        <strong>${band.label}</strong>
        <span>${band.detail}</span>
        <small>${band.next}</small>
      </div>
      <div class="cap-levels">
        <span>Minimum ${moneyShort(cap.minimum)}</span>
        <span>Cap ${moneyShort(cap.cap)}</span>
        <span>Tax ${moneyShort(cap.tax)}</span>
        <span>1st Apron ${moneyShort(cap.firstApron)}</span>
        <span>2nd Apron ${moneyShort(cap.secondApron)}</span>
      </div>
    `
    : "<span>この年度のキャップラインは未設定です。</span>";

  elements.salaryList.innerHTML = contracts.rows.length
    ? contracts.rows
        .map((row) => `
          <div class="salary-row">
            <span>
              <strong>${row.player}</strong>
              <small>${row.age ? `Age ${row.age}` : ""}</small>
            </span>
            <strong>${formatMoney.format(row.salary)}</strong>
          </div>
        `)
        .join("")
    : '<div class="salary-row"><span><strong>契約表を取得できませんでした</strong><small>Basketball-Reference 側の制限や年度列の未公開が考えられます。</small></span></div>';
}

function renderSalaryMatrix() {
  const rows = state.contracts?.rows || [];
  const targetSeason = salarySeasonStart(elements.salarySeason.value);
  const years = (state.contracts?.salaryYears || [])
    .map(Number)
    .filter((year) => Number.isFinite(year) && year >= targetSeason)
    .sort((a, b) => a - b);

  if (!rows.length || !years.length) {
    elements.salaryMatrix.innerHTML = '<div class="salary-years-empty">契約年度別のサラリーを取得できませんでした。</div>';
    return;
  }

  const totalByYear = Object.fromEntries(years.map((year) => [year, 0]));
  rows.forEach((row) => {
    years.forEach((year) => {
      const season = row.seasons?.find((item) => Number(item.season) === year);
      totalByYear[year] += Number(season?.salary || 0);
    });
  });

  elements.salaryMatrix.innerHTML = `
    <table class="salary-years-table">
      <thead>
        <tr>
          <th>Player</th>
          ${years.map((year) => `<th>${salarySeasonLabel(year)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>
              <strong>${row.player}</strong>
              <small>${row.contract || row.guaranteed || ""}</small>
            </td>
            ${years.map((year) => {
              const season = row.seasons?.find((item) => Number(item.season) === year);
              const flags = season?.flags?.length ? season.flags.join(" / ") : season?.notes || "";
              return `
                <td>
                  <strong>${season?.salary ? formatMoney.format(season.salary) : "-"}</strong>
                  ${flags ? `<small>${flags}</small>` : ""}
                </td>
              `;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          ${years.map((year) => `<td><strong>${formatMoney.format(totalByYear[year] || 0)}</strong></td>`).join("")}
        </tr>
      </tfoot>
    </table>
  `;
}

function renderDraftPickList(picks, emptyText) {
  if (!picks?.length) {
    return `<div class="draft-empty">${emptyText}</div>`;
  }
  return picks
    .map((pick) => `
      <article class="draft-pick ${pick.direction}">
          <div class="draft-chip">${pick.year} R${pick.round}</div>
          <div>
            <strong>${pick.counterparty}</strong>
            <p>${pick.protections || "No protections listed"}</p>
            ${pick.url ? `<a href="${pick.url}" target="_blank" rel="noreferrer">Details</a>` : ""}
          </div>
        </article>
      `)
    .join("");
}

function renderDraftPicks() {
  const draftPicks = state.draftPicks || {
    incoming: [],
    outgoing: [],
    summary: { incomingFirsts: 0, incomingSeconds: 0, outgoingFirsts: 0, outgoingSeconds: 0 },
    url: "https://www.salaryswish.com/",
    provider: "Source"
  };
  const summary = draftPicks.summary || {};
  elements.draftLink.href = draftPicks.url || "https://www.salaryswish.com/";
  elements.draftLink.textContent = draftPicks.provider || "Source";
  elements.draftSummary.innerHTML = `
    <div><span>Available 1st</span><strong>${summary.incomingFirsts || 0}</strong></div>
    <div><span>Available 2nd</span><strong>${summary.incomingSeconds || 0}</strong></div>
    <div><span>Outgoing 1st</span><strong>${summary.outgoingFirsts || 0}</strong></div>
    <div><span>Outgoing 2nd</span><strong>${summary.outgoingSeconds || 0}</strong></div>
  `;
  elements.incomingPicks.innerHTML = renderDraftPickList(draftPicks.incoming, "Available picks were not found.");
  elements.outgoingPicks.innerHTML = renderDraftPickList(draftPicks.outgoing, "Outgoing picks were not found.");
}

function renderRankings() {
  elements.rankingsSeason.textContent = state.statsSeason ? `${state.statsSeason} / Regular Season` : "Regular Season";
  if (!state.standingsByTeam.size) {
    elements.teamRankings.textContent = state.statsSeason ? "公式順位を表示できません。" : "";
    return;
  }
  elements.teamRankings.innerHTML = ["East", "West"].flatMap((conference) => {
    const ranked = state.teams
      .filter((team) => team.conference === conference && standingFor(team)?.rank <= 5)
      .sort((a, b) => standingFor(a).rank - standingFor(b).rank);
    return [
      `<div class="team-group-label">${conference === "East" ? "Eastern Conference" : "Western Conference"}</div>`,
      ...ranked.map((team) => {
        const { rank, wins, losses, winPct } = standingFor(team);
        return `
      <div class="ranking-row">
        <span class="rank-number">${rank}</span>
        <span>
          <strong>${team.name}</strong>
          <small>${wins}-${losses}</small>
        </span>
        <strong>${pct(winPct)}</strong>
      </div>
    `;
      })
    ];
  }).join("");
}

function renderLeaders() {
  const leaders = [
    topLeague("pts", "PTS"),
    topLeague("reb", "REB"),
    topLeague("ast", "AST"),
    topLeague("stl", "STL"),
    topLeague("blk", "BLK"),
    topLeague("fg3Pct", "3P%")
  ];
  elements.leagueLeaders.innerHTML = leaders
    .map(({ label, leader, value }) => `
      <div class="leader-card">
        <small>${label}</small>
        <strong>${leader?.player || "-"}</strong>
        <span>${label.includes("%") ? pct(leader?.fg3Pct) : value} ${leader?.team || ""}</span>
      </div>
    `)
    .join("");
}

function renderStatus() {
  const dateLabel = (time) => time ? new Date(time).toLocaleString("ja-JP") : "-";
  elements.updatedAt.textContent = dateLabel(state.statsFetchedAt);
  elements.standingsUpdatedAt.textContent = dateLabel(state.standingsFetchedAt);
  elements.fetchWarnings.hidden = !state.warnings.length;
  elements.fetchWarnings.replaceChildren(...state.warnings.map((warning) => {
    const line = document.createElement("li");
    line.textContent = warning;
    return line;
  }));
}

function render() {
  renderTeamList();
  renderHero();
  renderKpis();
  renderRoster();
  renderPlayerDetails();
  renderSalary();
  renderSalaryMatrix();
  renderDraftPicks();
  renderRankings();
  renderLeaders();
  renderStatus();
}

async function api(path, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("通信がタイムアウトしました。再度、最新取得を押してください。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function showToast(message, tone = "success") {
  if (!elements.toastHost) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  elements.toastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

async function loadPlayerHistory(playerKey) {
  const player = state.playerCards[playerKey];
  const playerId = player?.playerId || player?.stats?.playerId;
  if (!playerId) return;

  const key = playerHistoryKey(playerId);
  if (!state.refreshToken && (state.playerHistory[key]?.rows || state.playerHistory[key]?.loading)) return;

  state.playerHistory[key] = { loading: true, rows: [] };
  if (state.selectedPlayerKey === playerKey) renderPlayerDetails();

  try {
    const query = new URLSearchParams({ seasonType: elements.seasonType.value });
    if (state.refreshToken) query.set("refresh", state.refreshToken);
    const result = await api(`/api/player-history/${playerId}?${query}`);
    state.playerHistory[key] = {
      loading: false,
      rows: result.history || [],
      warning: result.warnings?.[0] || ""
    };
  } catch (error) {
    state.playerHistory[key] = {
      loading: false,
      rows: [],
      warning: `過去スタッツ取得に失敗しました: ${error.message}`
    };
  }

  if (state.selectedPlayerKey === playerKey) renderPlayerDetails();
}

async function loadSalaryPlayerInfo(requestId = state.detailRequestId) {
  const salaryRows = state.contracts?.rows || [];
  if (!salaryRows.length) return [];

  const ids = [...new Set(
    salaryRows
      .map((contract) => resolveSalaryPlayer(contract).playerId)
      .filter(Boolean)
      .map(String)
  )].filter((playerId) => !state.playerInfo[playerId]);

  if (!ids.length) return [];

  const refresh = state.refreshToken ? `?refresh=${state.refreshToken}` : "";
  const warnings = [];

  for (const playerId of ids) {
    if (requestId !== state.detailRequestId) return warnings;
    try {
      const result = await api(`/api/player-info/${playerId}${refresh}`, 15000);
      if (requestId !== state.detailRequestId) return warnings;
      if (result.playerInfo?.playerId) {
        state.playerInfo[String(result.playerInfo.playerId)] = result.playerInfo;
      }
      warnings.push(...(result.warnings || []));
      if (!result.playerInfo) {
        warnings.push(`選手詳細を取得できませんでした: ${playerId}`);
      }
    } catch (error) {
      warnings.push(`選手詳細を取得できませんでした: ${playerId} (${error.message})`);
    }
  }
  return warnings;
}

function setSeasonOptions(select, seasons, defaultSeason, selectedSeason) {
  select.dataset.defaultSeason = defaultSeason;
  const available = new Set([...seasons, selectedSeason]);
  select.replaceChildren(...Array.from(available, (season) => new Option(season, season)));
  select.value = selectedSeason;
}

async function loadBootstrap() {
  state.bootstrapLoading = true;
  state.detailRequestId += 1;
  setLoading("リーグデータ取得中");
  try {
    const query = new URLSearchParams({ seasonType: elements.seasonType.value });
    for (const select of [elements.statsSeason, elements.salarySeason]) {
      if (select.value && select.value !== select.dataset.defaultSeason) query.set(select.id, select.value);
    }
    if (state.refreshToken) query.set("refresh", state.refreshToken);
    const data = await api(`/api/bootstrap?${query}`);
    state.statsSeason = data.statsSeason;
    state.salarySeason = data.salarySeason;
    state.seasonType = data.seasonType;
    setSeasonOptions(elements.statsSeason, data.defaults.statsSeasons, data.defaults.statsSeason, data.statsSeason);
    setSeasonOptions(elements.salarySeason, data.defaults.salarySeasons, data.defaults.salarySeason, data.salarySeason);
    state.teams = data.teams || [];
    state.teamStats = data.teamStats || [];
    state.playerStats = data.playerStats || [];
    state.standingsByTeam = new Map((data.standings || []).map((standing) => [standing.teamId, standing]));
    state.statsFetchedAt = data.generatedAt;
    state.standingsFetchedAt = data.standingsFetchedAt;
    state.capLines = data.capLines || {};
    state.sources = data.sourceLinks || {};
    state.bootstrapWarnings = data.warnings || [];
    state.warnings = state.bootstrapWarnings;
    state.roster = [];
    state.contracts = null;
    state.draftPicks = null;
    if (!state.teams.find((team) => team.abbr === state.selectedAbbr)) {
      state.selectedAbbr = state.teams[0]?.abbr || "LAL";
    }
    render();
    await loadTeamDetails();
  } finally {
    state.bootstrapLoading = false;
  }
}

async function loadTeamDetails() {
  const team = selectedTeam();
  if (!team) return;
  const requestId = state.detailRequestId + 1;
  state.detailRequestId = requestId;
  setLoading(`${team.abbr} 取得中`);
  try {
    const query = new URLSearchParams({ salarySeason: elements.salarySeason.value });
    if (state.refreshToken) query.set("refresh", state.refreshToken);
    const draftQuery = state.refreshToken ? `?refresh=${state.refreshToken}` : "";
    const [rosterResult, salaryResult, draftResult] = await Promise.allSettled([
      api(`/api/roster/${team.teamId}?${query}`),
      api(`/api/salary/${team.abbr}?${query}`),
      api(`/api/draft-picks/${team.abbr}${draftQuery}`)
    ]);
    if (requestId !== state.detailRequestId) return;

    const detailWarnings = [];
    if (rosterResult.status === "fulfilled") {
      state.roster = rosterResult.value.roster || [];
      detailWarnings.push(...(rosterResult.value.warnings || []));
    } else {
      state.roster = [];
      detailWarnings.push(`ロスター取得に失敗しました: ${rosterResult.reason.message}`);
    }

    if (salaryResult.status === "fulfilled") {
      state.contracts = salaryResult.value.contracts || null;
      detailWarnings.push(...(salaryResult.value.warnings || []));
    } else {
      state.contracts = null;
      detailWarnings.push(`サラリー取得に失敗しました: ${salaryResult.reason.message}`);
    }

    if (draftResult.status === "fulfilled") {
      state.draftPicks = draftResult.value.draftPicks || null;
      detailWarnings.push(...(draftResult.value.warnings || []));
    } else {
      state.draftPicks = null;
      detailWarnings.push(`ドラフト指名権取得に失敗しました: ${draftResult.reason.message}`);
    }

    state.warnings = [...state.bootstrapWarnings, ...detailWarnings];
    if (!state.warnings.length) {
      state.lastFetchMessage = state.refreshMode
        ? "Webから最新取得しました"
        : "取得完了";
    }

    render();
    setReady();

    loadSalaryPlayerInfo(requestId).then(() => {
      if (requestId === state.detailRequestId) render();
    });
    return;
  } catch (error) {
    state.warnings = [...state.bootstrapWarnings, `${team.abbr} の詳細取得に失敗しました: ${error.message}`];
  }
  render();
  setReady();
}

elements.refreshBtn.addEventListener("click", async () => {
  closePlayerDetails();
  state.refreshToken = String(Date.now());
  state.refreshMode = true;
  state.lastFetchMessage = "";
  state.warnings = [];
  try {
    await loadBootstrap();
    showToast(
      state.warnings.length
        ? `${state.statsSeason} の最新取得に未取得の項目があります。状態欄をご確認ください。`
        : `${state.statsSeason} の最新スタッツ・公式順位と、選択チームの情報を取得しました。`,
      state.warnings.length ? "warning" : "success"
    );
  } catch (error) {
    elements.statsSeason.value = state.statsSeason;
    elements.salarySeason.value = state.salarySeason;
    elements.seasonType.value = state.seasonType;
    state.warnings = [`取得に失敗しました: ${error.message}`];
    render();
    setReady();
    showToast("最新取得に失敗しました。通信状況を確認して再試行してください。", "error");
  } finally {
    state.refreshToken = "";
    state.refreshMode = false;
  }
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderTeamList();
});

elements.teamOrder?.addEventListener("change", (event) => {
  state.teamOrder = event.target.value;
  renderTeamList();
});

[elements.statsSeason, elements.salarySeason, elements.seasonType].forEach((select) => {
  select.addEventListener("change", () => {
    closePlayerDetails();
    elements.refreshBtn.click();
  });
});

elements.playerClose?.addEventListener("click", closePlayerDetails);
elements.playerOverlay?.addEventListener("click", (event) => {
  if (event.target === elements.playerOverlay) closePlayerDetails();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.playerOverlay && !elements.playerOverlay.hidden) closePlayerDetails();
});

loadBootstrap()
  .then(setReady)
  .catch((error) => {
    state.warnings = [`初回取得に失敗しました: ${error.message}`];
    render();
    setReady();
  });
