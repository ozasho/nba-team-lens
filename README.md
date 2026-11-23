# NBA Team Lens

NBA の各チームについて、ロスター、主要スタッツ、サラリー状況をまとめて見られるローカル Web アプリです。

## 起動

```powershell
npm start
```

ブラウザで `http://localhost:4173` を開きます。

## データ取得元

- Team / player stats: https://www.nba.com/stats
- Conference standings: https://www.nba.com/standings
- Team list: https://www.nba.com/teams
- Contracts: https://www.basketball-reference.com/contracts/
- Salary contracts: https://hoopshype.com/salaries/
- Future draft picks: https://fanspo.com/nba/teams
- 2026-27 cap lines: https://www.blazersedge.com/nba-news-rumors/113970/nba-sets-salary-cap-for-2026-27-season
- 2025-26 cap line reference: https://www.nba.com/news/nba-salary-cap-for-2025-26-season-set

## 表示仕様

- ロスター表は、選択したサラリー年度のチームロスターを軸に表示します。
- 選手スタッツは、選択したスタッツ年度のリーグ全体データから同じ選手を照合して表示します。移籍選手でも前所属チームの成績を確認できます。
- 初期表示のスタッツ年度は10月に新シーズンへ、サラリー年度は7月に新年度へ切り替わります。過去シーズンを選択した場合、「最新取得」は選択中のシーズンを取得し直します。
- 東西別順位は、スタッツ年度のNBA公式レギュラーシーズン順位を表示します。スタッツをPlayoffsに切り替えても順位はレギュラーシーズンのものです。再取得に失敗した場合は、同年度の前回取得分があれば、取得日時とその旨を表示します。
- サラリー欄では、Minimum / Cap / Tax / 1st Apron / 2nd Apron とチーム給与総額を比較し、CBA上の位置を表示します。
- 選手写真は NBA CDN のヘッドショットを利用し、未取得時はイニシャル表示にフォールバックします。
- 将来ドラフト指名権は Fanspo のチーム別 Draft Picks ページから Incoming / Outgoing と保護条件を取得して表示します。

公開サイト側の制限や年度切り替え直後の未反映により、ロスターまたは契約表が空になる場合があります。その場合も画面上に取得状態を表示します。
