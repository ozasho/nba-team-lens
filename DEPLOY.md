# スマホから見られるように公開する手順

このアプリは Node.js サーバーで NBA Stats / HoopsHype / Fanspo へ取得しに行くため、GitHub Pages だけでは完全には動きません。

おすすめは、GitHub にコードを置いて Render で Web Service として公開する方法です。

## 1. GitHub にアップロード

1. GitHub で新しいリポジトリを作成します。
2. このフォルダのファイル一式を push します。

## 2. Render で公開

1. https://render.com/ にログインします。
2. `New` → `Web Service` を選びます。
3. GitHub リポジトリを選びます。
4. Render が `render.yaml` を読み取れば、そのまま作成できます。
5. 公開URLが発行されたら、スマホのブラウザでそのURLを開きます。

## 手動設定する場合

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `Node >= 20`

## 最新取得について

画面の `最新取得` ボタンを押すと、サーバー側キャッシュを無視して NBA Stats / HoopsHype / Fanspo から取り直します。
通常表示では負荷を避けるため、サーバー側で約20分キャッシュします。
