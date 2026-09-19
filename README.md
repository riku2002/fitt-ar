# Realtime AR Try-On — Virtual Try-On

公開先: [https://fitt-ar.vercel.app](https://fitt-ar.vercel.app)

カメラの姿勢推定結果を共有し、肩と腰に合わせてデモTシャツ1着を重ねるWebアプリです。

## できること

- カメラの起動・停止・再起動、権限拒否などの案内
- MediaPipe Pose Landmarker Liteによる1人の姿勢推定（最大15回/秒）
- 肩幅・胴体長・傾きに合わせたTシャツの位置・大きさ・回転
- 実写の透過Tシャツ。服と骨格の独立した表示切り替え（骨格は初期OFF）
- 映像・服・骨格を同時に左右反転
- 肩・腰を見失ったときの服の非表示と、再検出時の復帰
- 服画像の読み込み失敗からの再試行（カメラ・骨格は継続）
- 画面離脱・停止・両方の表示OFFで推定モデルとループを解放

映像・座標はブラウザ内でのみ処理します。録画・保存・サーバー送信・マイク取得は行いません。モデルとWASMもアプリと同じ配信元から読み込みます。

## セットアップ

Node.js **24.x**、npm、Git、Chrome、内蔵またはUSBカメラを使用します。IDEはIntelliJ IDEAを想定しています。

PRのマージ前にこの機能を取得する場合:

```bash
git clone --branch feature/garment-overlay https://github.com/riku2002/fitt-ar.git
cd fitt-ar
node -v
# v24.x.x であることを確認
npm ci
npm run dev
```

マージ後は `git clone https://github.com/riku2002/fitt-ar.git` で取得できます。Clone済みなら、未コミットの変更を確認したうえで `git fetch origin` → `git switch feature/garment-overlay` → `npm ci` を実行してください。

表示されたURL（通常は **http://localhost:5173/**）をChromeで開き、「カメラを起動」→「許可」を選択します。正面を向き、肩から腰まで映る位置に立ってください。

APIキー・環境変数は不要です。モデルとTシャツ画像は同梱済みです。`npm run dev` / `npm run build` の前処理でモデルのハッシュを検証し、npmパッケージに一致するWASMを自動配置します。

nvmを使用している場合は `nvm install` → `nvm use` でNode.jsを切り替えられます。

### IntelliJ IDEA

1. Git → Clone、またはClone済みのフォルダを開きます。
2. Node.js runtimeを24.x、TypeScriptを `node_modules/typescript` に設定します。
3. 内蔵Terminalで `npm ci` → `npm run dev` を実行します。

## コマンド

| コマンド               | 用途                                 |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | 開発サーバー                         |
| `npm run lint`         | ESLint                               |
| `npm run typecheck`    | TypeScriptの型チェック               |
| `npm run test`         | 自動テストを1回実行                  |
| `npm run test:watch`   | 継続テスト                           |
| `npm run build`        | アセット準備・型チェック・本番ビルド |
| `npm run preview`      | `dist/` のローカル確認               |
| `npm run format`       | Prettierで整形                       |
| `npm run format:check` | 整形の確認                           |

`package.json` と `package-lock.json` は一緒にコミットします。取得後は `npm ci` を使い、npm以外のロックファイルは追加しません。

## 推定結果の共有

`VirtualMirror` がカメラ1回につき1つの推定セッションを管理します。`poseSession` はCanvasに依存せず、`PoseFrame`（正規化座標・元の動画解像度・タイムスタンプ）を配信します。

```text
Camera → Pose Landmarker → PoseFrame
                              ├─ GarmentOverlay（服）
                              ├─ PoseOverlay（骨格）
                              └─ 将来のGesture（手首履歴）
```

毎フレームの座標はReact stateに入れず、`PoseSource.subscribe()` で共有します。表示を追加してもモデルを再生成しません。両方OFFのときは推定を停止します。追跡結果が空になった場合や停止時は描画を消去し、動画フレームが500ms以上進まない場合も古い服を残しません。

服・骨格それぞれのCanvasの元解像度を動画に合わせ、同じ `object-fit: contain` と共通の親要素での反転を使います。座標そのものは反転しません。将来のジェスチャーは判定時に画面方向へ変換してください。

## デモ服と変換

画像は布目・しわ・縫い目の残った実写の透過PNG（893×1024）です。PurePNGがCC0として配布する素材をそのまま同梱しています。出典・利用条件の記録・アンカー座標は [public/garments/README.md](public/garments/README.md) を参照してください。画像生成サービスは使用していません。

**自分の服を追加するには → [写真からTシャツ素材を作る手順書](docs/garment-guide.md)**。撮影・Photopeaでの背景削除・登録・調整・チームへの引き渡しを説明しています。[位置合わせツール](http://localhost:5173/tools/garment-setup.html) では、画像を4か所クリックするだけで設定を作れます。選択した画像はブラウザ内だけで処理します。

- 服のメタデータは `features/wardrobe/garments.ts` に定義します。
- 左右は**着用者から見た左右**です。正面向き画像では左肩が画像の右側です。
- `garmentTransform.ts` は動画のピクセル座標で肩中心・肩幅・傾き・肩に垂直な胴体長を求め、画像から動画への変換行列を返します。
- `garmentRenderer.ts` がその行列で描画します。幅と丈を別々に拡縮し、服全体を回転させる最小実装です。4つのアンカーを独立して変形させるメッシュではありません。
- 肩・腰の4点が信頼度0.5以上かつ画面内なら表示できます。手首・肘の検出は服表示の必須条件ではありません。
- 肩幅や胴体がほぼつぶれた姿勢、背面向きなどは非表示になります。

## 手動確認

自動テストでは推定と座標変換・描画のライフサイクルを検証しています。実カメラと端末性能は次の手順で確認してください。

1. ページを開いただけではカメラが起動しないこと。起動・権限許可後に映像と服が表示されること。
2. 正面を向いた状態で左右移動・前後移動・身体の傾きを変え、服の位置・大きさ・傾きが追従すること。
3. 鏡表示を切り替え、画面幅を変えても動画・服・骨格の位置が一致すること。
4. 骨格表示は初期OFF。ON→OFFにしても服が追従すること。骨格ONで服だけをOFFにしても骨格が動くこと。
5. 肩・腰が見え、手首が画面外の状態でも服が表示されること。
6. 画面から離れると服が消え、戻ると再表示されること。
7. 両方の表示をOFFにすると推定が停止し、カメラだけが動くこと。ONで再開できること。
8. カメラの停止・再起動、準備中の停止で古い服や推定処理が残らないこと。
9. カメラ権限の拒否、未接続、切断でも案内が表示されること。
10. 骨格表示をONにしたうえで、開発者ツールのリクエストブロックで `tshirt-gray.png` を止め、服表示をOFF→ONにするとエラーと再読み込みボタンが出ること。骨格は継続し、ブロック解除後に再読み込みで復帰すること。

## 現段階の制限

独自の平滑化、袖の変形、腕を服の前に出す処理、複数服の切り替え、スワイプ操作は未実装です。着ている服の上にPNGを重ねるため、元の服が一部見える場合があります。正面向きのデモを想定しており、衣服のサイズ判定を行うものではありません。

CPU・メインスレッドで同期推定するため、低性能端末では遅くなる可能性があります。次はEMAによる揺れの抑制、その後に複数服・手首スワイプを追加します。

## トラブルシューティング

- カメラは **localhost または HTTPS** で利用してください。スマートフォンからLAN内の通常HTTPへ接続しても使えません。
- Chromeのサイト設定とOSのカメラ権限を確認してください。macOSではシステム設定 → プライバシーとセキュリティ → カメラ、Windowsでは設定 → プライバシーとセキュリティ → カメラを確認します。
- Zoomなど別のアプリがカメラを使用している場合は終了して再試行してください。
- `EBADENGINE` が出たら `node -v` が24.xか確認してください。
- 姿勢推定が失敗した場合は再試行します。繰り返す場合は `npm ci` → `npm run dev` を実行し、モデルファイルの存在を確認してください。
- 公開時は `npm run build` で作成した `dist/` 全体を配信してください。`models/`・`mediapipe/wasm/`・`garments/` が必要です。

参考: [Google Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)、[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)、[Canvas変換行列](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform)。

## 構成とGitHub開発

```text
src/features/
  camera/            # カメラ取得・解放と画面操作
  pose/              # 推定・PoseFrame配信・骨格表示
  virtualTryOn/      # 服の変換計算・描画・共通推定セッションの管理
  wardrobe/          # 服のメタデータ
public/garments/     # 同梱する透過PNG
public/tools/        # 画像をクリックしてアンカー設定を作る補助ツール
public/models/       # 同梱する推定モデル
scripts/             # WASM配置・モデル検証
docs/garment-guide.md # 自分で素材を撮影・追加する手順書
```

作業ブランチからPRを作成し、`lint` / `typecheck` / `test` / `build` を通してレビュー後にマージします。GitHub Actionsでも同じチェックを行います。
