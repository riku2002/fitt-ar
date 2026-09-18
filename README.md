# Realtime AR Try-On — Pose Tracking

リアルタイムAR試着Webアプリの姿勢推定版です。カメラ映像に肩・肘・手首・腰の骨格を重ねて表示します。

## 今回できること

- ボタンからカメラの起動・停止・再起動
- 鏡のような左右反転の切り替え
- 権限待ちのキャンセル、権限拒否・未接続・使用中などのエラー案内
- 画面を離れたときのカメラ解放
- PC・スマートフォンの画面サイズに対応
- MediaPipe Pose Landmarkerで1人の肩・肘・手首・腰の8点を追跡
- 人物未検出／一部検出／追跡中／読み込み失敗の表示と再試行
- 骨格表示をOFFにすると推定も停止。カメラ停止・画面離脱でモデルを解放

映像はブラウザ内でのみ表示します。録画、保存、サーバーへの送信、マイクの取得は行いません。
服の描画・天気推薦は次の開発段階です。バックエンドは不要です。

## 必要な環境

- **Node.js 24.x**（`.nvmrc`・`engines`・`.npmrc` で統一）
- npm（Node.js に同梱）、Git
- Chrome、内蔵またはUSBカメラ
- IDE: IntelliJ IDEA（Terminalから実行できます）

## チームメンバーの最短セットアップ

この実装をPRのマージ前に試す場合:

```bash
git clone --branch feature/pose-tracking https://github.com/riku2002/fitt-ar.git
cd fitt-ar
node -v
# v24.x.x であることを確認
npm ci
npm run dev
```

`main` へのマージ後は、通常の `git clone https://github.com/riku2002/fitt-ar.git` で取得できます。
すでにClone済みの場合は `git fetch origin` → `git switch feature/pose-tracking` → `npm ci` を実行してください。

表示されたURL（通常は **http://localhost:5173/**）をChromeで開き、「カメラを起動」→ ブラウザの確認で「許可」を選びます。
ポートが使用中の場合、Viteが表示する実際のURLを使ってください。

環境変数やAPIキーの設定は不要です。`.env.example` のコピーも不要です。
起動するとMediaPipeのWASMをnpmパッケージから自動配置します。軽量モデルは同梱済みで、ブラウザから外部CDNへの接続は不要です。
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

## カメラと姿勢推定の手動確認

自動テストはカメラAPIをモックしており、実機の権限や映像は以下で確認します。

1. ページを開いただけでは、カメラが起動しないこと。
2. 「カメラを起動」→ 許可すると、自分の映像が動くこと。
3. 左右反転を切り替えられること。
4. 「カメラを停止」で映像が消え、他のアプリが使用していなければカメラの使用ランプも消えること。
5. 再起動で映像が戻ること。
6. サイトのカメラ権限を拒否して再読み込みすると、起動時に案内が表示されること。権限を戻して再試行できること。
7. 許可待ち中にキャンセルすると、後から許可しても映像が表示されず、取得したカメラが解放されること。
8. カメラ起動後に「姿勢推定を準備しています…」が消え、肩から腰まで映すと骨格が重なること。手首も画面内に入れてください。
9. 左右移動・身体の傾き・腕上げに点と線が追従すること。鏡表示のON/OFF、画面サイズ変更でも映像と一致すること。
10. 画面から離れると骨格が消え、「肩から腰まで映る位置に立ってください」が表示されること。戻ると再検出すること。
11. 「姿勢推定・骨格表示」をOFFにすると骨格が消え、カメラ映像は継続すること。ONで推定が再開すること。
12. カメラ停止・再起動、モデル準備中の停止でも古い骨格や推定処理が残らないこと。

## 姿勢推定の仕組みと制限

- Pose Landmarker Lite / VIDEOモード / 1人を対象に、最大15回/秒で新しい動画フレームだけを推定します。実際の速度は端末性能に依存します。
- カメラ起動後にライブラリとモデルを読み込みます。モデル・WASMはアプリと同じ配信元から取得し、映像や座標は送信しません。
- 信頼度0.5以上で画面内にある点のみ描画します。8点すべて見えると「追跡中」、一部だけなら「一部を検出中」と表示します。
- 動画とCanvasの元解像度を一致させ、両方に `object-fit: contain` を適用します。共通の親要素で左右反転するため、余白や鏡表示で骨格がずれません。
- 現段階はCPUによるメインスレッドでの推定です。MediaPipeの同期推定により低性能端末では操作が重くなる可能性があります。必要に応じて今後Worker化を検討します。
- 独自の平滑化、服の重ね合わせは未実装です。映像が暗い・身体が隠れている・小さすぎる場合は点が表示されないことがあります。

実装参考: [Google公式Webガイド](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)。モデルの出典・固定ハッシュは [public/models/README.md](public/models/README.md) を参照してください。

## カメラが動かない場合

- **localhost または HTTPS** で開いてください。スマートフォンから `http://192.168.x.x:5173` のようなLAN内HTTPへアクセスしてもカメラは使えません。スマートフォンで試す場合はHTTPSのプレビュー環境を使います。
- Chromeのアドレスバーにあるサイト設定で、カメラを許可してください。許可の確認を放置した場合は待ち続けるため、「接続をキャンセル」で戻れます。
- macOS: システム設定 → プライバシーとセキュリティ → カメラ → Chromeを許可。
- Windows: 設定 → プライバシーとセキュリティ → カメラ → カメラアクセスとデスクトップアプリのアクセスを許可。
- Zoomなど別のアプリがカメラを使用している場合は終了して再試行してください。
- `npm ci` で `EBADENGINE` が出たら、`node -v` が24.xか確認してください。
- 姿勢推定が失敗した場合は「姿勢推定を再試行」を押してください。カメラ映像だけでも利用できます。繰り返す場合は `npm ci` → `npm run dev` で再起動し、`public/models/pose_landmarker_lite.task` が存在することを確認します。
- 公開時は `npm run build` を使用して `dist/` 全体を配信してください。`mediapipe/wasm/` と `models/` を省くとモデルを読み込めません。

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
  features/pose/
    PoseOverlay.tsx      # Canvasと検出状態・再試行UI
    poseLandmarker.ts    # MediaPipeモデルの初期化
    poseSession.ts       # 推定ループとリソース解放
    poseGeometry.ts      # 座標変換・信頼度・骨格描画
  test/setup.ts
  main.tsx
.github/workflows/ci.yml  # PR時のlint / 型チェック / テスト / build
scripts/prepare-mediapipe.mjs # WASM配置とモデルのハッシュ検証
public/models/           # 固定バージョンのモデル・出典
```

次は `features/virtualTryOn/` を追加し、肩の位置・幅・傾きに合わせたTシャツの描画へ進みます。

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
