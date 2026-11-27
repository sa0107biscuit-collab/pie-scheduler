# 24時間スケジューラ

1日24時間を円グラフ（ドーナツ型）で表示するスケジュール管理アプリです。
HTML / CSS / JavaScript だけで動き、ビルド不要。GitHub Pages でそのまま公開できます。

## 機能

- 上が 0:00、時計回りで 24 時間を表示
- 予定の追加・編集・削除
- 円グラフ上の操作（パソコンはクリック＆ドラッグ、スマホはタップ＆ドラッグ）
  - 予定をタップ / クリック: 選択（両端に白い「つまみ」と開始・終了時刻が表示されます）
  - 予定をドラッグ: 長さはそのままで、時間帯ごと移動
  - つまみをドラッグ: 開始時刻 / 終了時刻だけを調整
  - 何もない場所をタップ: 選択を解除
  - 動かす単位は 15 分（`app.js` の `SNAP` で 5 分や 10 分に変更できます）
- 日またぎの予定に対応（例: 23:00 → 07:00）
- 現在時刻の針と、現在の予定を中央に表示
- 予定の重なりを検出して一覧にバッジ表示
- 予定あり / 空き時間の合計を表示
- データはブラウザの localStorage に自動保存
- 円グラフを PNG 画像として保存（中央には保存した日の日付が入ります）
- JSON の書き出し / 読み込み（バックアップや端末間の移動用）
- ダークモード対応

## ファイル構成

```
index.html   画面
style.css    スタイル
app.js       ロジック（描画・保存・操作）
README.md    このファイル
```

## ローカルで試す

`index.html` をブラウザで開くだけで動きます。

## GitHub で公開する（GitHub Pages）

### 1. リポジトリを作って push

GitHub 上で新しいリポジトリ（例: `pie-scheduler`）を作成し、このフォルダで次を実行します。

```bash
git init
git add .
git commit -m "初回コミット"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/pie-scheduler.git
git push -u origin main
```

#### 変更をコミットできないとき

`git commit` で止まった場合は、エラーメッセージに合わせて対処してください。

**`Author identity unknown` / `Please tell me who you are` と出る**
コミットする人の名前とメールアドレスが未設定です。次を実行してからコミットをやり直します。

```bash
git config --global user.name "あなたの名前"
git config --global user.email "you@example.com"
```

GitHub にメールアドレスを公開したくない場合は、GitHub の Settings → Emails にある
`<数字>+<ユーザー名>@users.noreply.github.com` を使うと安全です。

**`nothing to commit, working tree clean` と出る**
コミットする変更がありません。ファイルを保存し忘れていないか確認してください。
新しいファイルなら、先に `git add .` が必要です。

**`not a git repository` と出る**
フォルダが Git 管理になっていません。ファイルがあるフォルダに移動して `git init` を実行してください。

**エディタが開いて閉じ方が分からない**
`-m` を付けずに `git commit` すると、メッセージ入力用のエディタが開きます。
`git commit -m "メッセージ"` の形で実行すれば開きません。

**`git push` が拒否される（`rejected` / `failed to push`）**
リモート側にローカルにはない履歴があります。空のリポジトリに初回 push するなら、
GitHub 側で README やライセンスを自動作成していないか確認してください。
作成済みの場合は、次で取り込んでから push します。

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### 2. Pages を有効にする

1. リポジトリの **Settings → Pages** を開く
2. **Source** を `Deploy from a branch` にする
3. **Branch** を `main`、フォルダを `/ (root)` にして Save

数分後、次の URL で公開されます。

```
https://<ユーザー名>.github.io/pie-scheduler/
```

## 注意

- データは各ブラウザ内にだけ保存されます。別の端末で使うには JSON を書き出して読み込んでください。
- ブラウザのサイトデータを消去すると予定も消えます。大事な予定は書き出しておくと安心です。

## カスタマイズのヒント

- 色の候補: `app.js` 冒頭の `PALETTE`
- 円の大きさ: `app.js` の `R_OUT`（外径）と `R_IN`（内径）
- 初期サンプル: `app.js` の `SAMPLE`
