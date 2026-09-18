# Realtime AR Try-On — Camera Hello World

リアルタイムAR試着Webアプリの最初の動作確認版です。ブラウザでカメラを起動し、ライブ映像を表示します。

## 今回できること

- ボタンからカメラの起動・停止・再起動
- 鏡のような左右反転の切り替え
- 権限待ちのキャンセル、権限拒否・未接続・使用中などのエラー案内
- 画面を離れたときのカメラ解放
- PC・スマートフォンの画面サイズに対応

映像はブラウザ内でのみ表示します。録画、保存、サーバーへの送信、マイクの取得は行いません。
姿勢推定（MediaPipe）、服の描画、天気推薦は次の開発段階です。現時点ではこれらのライブラリやバックエンドは不要です。

## 必要な環境

- **Node.js 24.x**（`.nvmrc`・`engines`・`.npmrc` で統一）
- npm（Node.js に同梱）、Git
- Chrome、内蔵またはUSBカメラ
- IDE: IntelliJ IDEA（Terminalから実行できます）

## チームメンバーの最短セットアップ

この実装をPRのマージ前に試す場合:

```bash
git clone --branch feature/camera-hello-world https://github.com/riku2002/fitt-ar.git
cd fitt-ar
node -v
# v24.x.x であることを確認
npm ci
npm run dev
```

`main` へのマージ後は、通常の `git clone https://github.com/riku2002/fitt-ar.git` で取得できます。
すでにClone済みの場合は `git fetch origin` → `git switch feature/camera-hello-world` → `npm ci` を実行してください。

表示されたURL（通常は **http://localhost:5173/**）をChromeで開き、「カメラを起動」→ ブラウザの確認で「許可」を選びます。
ポートが使用中の場合、Viteが表示する実際のURLを使ってください。

環境変数やAPIキーの設定は不要です。`.env.example` のコピーも不要です。
nvm を使っている場合は `nvm install` → `nvm use` で切り替えられます。

### IntelliJ IDEA

1. Git → Clone でリポジトリを取得するか、Clone済みフォルダを開きます。
2. Node.js runtime を24.xへ、TypeScriptを `node_modules/typescript` へ設定します。
3. 内蔵Terminalで `npm ci` → `npm run dev` を実行します。

## コマンド

| コマンド               | 用途                               |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | 開発サーバー                       |
| `npm run lint`         | ESLint                             |
| `npm run typecheck`    | TypeScriptの型チェック             |
| `npm run test`         | 自動テストを1回実行して終了        |
| `npm run test:watch`   | 開発中の継続テスト                 |
| `npm run build`        | 型チェック + 本番ビルド（`dist/`） |
| `npm run preview`      | ビルド済みアプリをローカルで確認   |
| `npm run format`       | Prettierで整形                     |
| `npm run format:check` | 整形の確認                         |

依存関係を追加した場合は `package.json` と `package-lock.json` を一緒にコミットします。
取得後は `npm ci` を使い、npm以外のロックファイルは追加しないでください。

## カメラの手動確認

自動テストはカメラAPIをモックしており、実機の権限や映像は以下で確認します。

1. ページを開いただけでは、カメラが起動しないこと。
2. 「カメラを起動」→ 許可すると、自分の映像が動くこと。
3. 左右反転を切り替えられること。
4. 「カメラを停止」で映像が消え、他のアプリが使用していなければカメラの使用ランプも消えること。
5. 再起動で映像が戻ること。
6. サイトのカメラ権限を拒否して再読み込みすると、起動時に案内が表示されること。権限を戻して再試行できること。
7. 許可待ち中にキャンセルすると、後から許可しても映像が表示されず、取得したカメラが解放されること。

## カメラが動かない場合

- **localhost または HTTPS** で開いてください。スマートフォンから `http://192.168.x.x:5173` のようなLAN内HTTPへアクセスしてもカメラは使えません。スマートフォンで試す場合はHTTPSのプレビュー環境を使います。
- Chromeのアドレスバーにあるサイト設定で、カメラを許可してください。許可の確認を放置した場合は待ち続けるため、「接続をキャンセル」で戻れます。
- macOS: システム設定 → プライバシーとセキュリティ → カメラ → Chromeを許可。
- Windows: 設定 → プライバシーとセキュリティ → カメラ → カメラアクセスとデスクトップアプリのアクセスを許可。
- Zoomなど別のアプリがカメラを使用している場合は終了して再試行してください。
- `npm ci` で `EBADENGINE` が出たら、`node -v` が24.xか確認してください。

カメラAPIの仕様: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。
構成の参考: [Vite Getting Started](https://vite.dev/guide/)。

## 構成

```text
src/
  app/                    # 画面全体・スタイル
  features/camera/
    CameraView.tsx        # プレビューとカメラの状態管理
    cameraService.ts      # カメラ取得・解放・エラー案内
    CameraView.test.tsx   # 許可・停止・競合・エラーのテスト
  test/setup.ts
  main.tsx
.github/workflows/ci.yml  # PR時のlint / 型チェック / テスト / build
```

将来は `features/pose/` と `features/virtualTryOn/` を追加します。動画とCanvasの座標・反転処理は、その段階で共通化します。

## GitHubでの開発

`main` へ直接実装せず、作業ブランチからPull Requestを作成します。

```bash
git switch main
git pull --ff-only
git switch -c feature/your-feature
# 実装後
npm run lint
npm run typecheck
npm run test
npm run build
git add <変更したファイル>
git commit -m "feat: describe your change"
git push -u origin feature/your-feature
```

GitHub ActionsがPRとmainへのpushで同じチェックを実行します。
レビュー・CI確認後にPRをマージし、チームメンバーへリポジトリURLを共有してください。

## ブラウザだけで共有したい場合（任意）

GitHubへのコード配布とWeb公開は別です。実行済みサイトのURLも配る場合は、VercelでこのリポジトリをImportし、FrameworkをVite、Node.jsを24.x、Build Commandを `npm run build`、Output Directoryを `dist` に設定します。環境変数は不要です。
発行されたHTTPS URLならカメラを利用できます（各端末で許可が必要）。このリポジトリの初期構築だけではVercelへの公開は行いません。
