# 同梱するTシャツ素材

グレー・ミント・赤の3着は、布の織り目・しわ・縫い目が写ったTシャツの透過PNGです。各色の写真をダウンロードしたまま同梱しており、生成AIによる生成・描き直し・色変更は行っていません。

## デモでのカテゴリ

絞り込みの動作を説明するため、プロジェクト内で次の**仮分類**を設定しています。配布元やメーカーが指定した性別区分ではありません。画像自体は変更していません。

| ファイル          | `gender` | 表示するカテゴリ |
| ----------------- | -------- | ---------------- |
| `tshirt-gray.png` | `unisex` | 男性・女性・全て |
| `tshirt-mint.png` | `men`    | 男性・全て       |
| `tshirt-red.png`  | `women`  | 女性・全て       |

実際の服を登録するときは、`src/features/wardrobe/garments.ts` の `gender` をその服のカテゴリに合わせて設定します。位置合わせツールからも選択できます。

## 出典・利用条件の記録

| 項目                   | 内容                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 素材名                 | T-Shirt                                                                                                                  |
| 配布元                 | [PurePNG の素材ページ](https://purepng.com/photo/9588/clothing-t-shirt)                                                  |
| 投稿者表記             | LPuo（撮影者の記載はありません）                                                                                         |
| 公開日表記             | 2018-05-16                                                                                                               |
| 取得・利用条件確認日   | 2026-09-19                                                                                                               |
| 配布元のライセンス表記 | CC0、商用利用可、帰属表示不要                                                                                            |
| 参照                   | [配布元の利用条件](https://purepng.com/page/terms-of-service)、[CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| ファイル               | `tshirt-gray.png` / 893 × 1024 px / RGBA PNG                                                                             |
| 加工                   | ファイル名のみ変更。画素・透明度は元ファイルのまま                                                                       |
| SHA-256                | `7fa756128a81ce632dc548b4ecb7e7f53b02d96767f0dbbc2c277f597d1e39be`                                                       |

[元のPNG](https://purepng.com/public/uploads/large/purepng.com-t-shirtt-shirtfabrict-shapegramnets-1421526429337ircsl.png)。上記は配布元の表示を記録したものです。写っている製品のブランドと本プロジェクトの提携・推奨関係を示すものではありません。

画像は同一オリジンから配信します。アプリ実行時に素材サイトへアクセスしません。旧図形素材とその生成スクリプトは実写素材への置き換えに伴い削除しました。

## 切り替え用に追加した2着

両素材とも配布元の投稿者表記はLPuo、公開日は2018-05-16、ライセンス表記はCC0（商用利用可・帰属表示不要）です。2026-09-19に取得・確認しました。撮影者の記載はありません。変更はファイル名のみです。

| ファイル          | 素材ページ                                                                       | 元のPNG                                                                                                                                     | サイズ               |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `tshirt-mint.png` | [Mint Green T-Shirt](https://purepng.com/photo/9589/clothing-mint-green-t-shirt) | [PNG](https://purepng.com/public/uploads/large/purepng.com-mint-green-t-shirtt-shirtfabrict-shapegramnetsmint-green-1421526429357cthld.png) | 873 × 1024 px / RGBA |
| `tshirt-red.png`  | [RedT-Shirt](https://purepng.com/photo/9587/clothing-redt-shirt)                 | [PNG](https://purepng.com/public/uploads/large/purepng.com-redt-shirtt-shirtfabrict-shapegramnetsred-1421526429314q7mig.png)                | 871 × 1024 px / RGBA |

SHA-256:

```text
tshirt-mint.png  5c95d2eccfac290b5bb1d01439f1f4bd53f15b41868b4b6c4ec53d837b9c097b
tshirt-red.png   82579b82f943444108075a70c9b668075cfb732724b3cc89e03f58bd26ab44c2
```

## この画像の位置合わせ

設定は `src/features/wardrobe/garments.ts` にあります。元画像全体（透明な余白を含む）に対する正規化座標です。左右は**着用者から見た左右**で、正面画像では左肩が画像右側です。腰は裾より少し上に置き、裾が股関節の下まで届くようにしています。

| アンカー               | 正規化座標   | 元画像のピクセル座標（概数） |
| ---------------------- | ------------ | ---------------------------- |
| 左肩 / `leftShoulder`  | (0.78, 0.14) | (697, 143)                   |
| 右肩 / `rightShoulder` | (0.22, 0.14) | (196, 143)                   |
| 左腰 / `leftHip`       | (0.72, 0.88) | (643, 901)                   |
| 右腰 / `rightHip`      | (0.28, 0.88) | (250, 901)                   |

`scaleX/Y = 1`、`offsetX/Y = 0`、`rotationOffset = 0` が初期値です。実寸サイズの測定ではなく、画面上の重ね合わせの目安です。

ミントと赤も、肩 (0.78, 0.14) / (0.22, 0.14)、腰 (0.72, 0.88) / (0.28, 0.88) を初期位置としています。各画像の全体寸法で正規化しています。服の追加・並べ替えは `garments` 配列で行います。

自分の素材を追加する場合は **[写真からTシャツ素材を作る手順書](../../docs/garment-guide.md)** を使ってください。ローカルの [位置合わせツール](http://localhost:5173/tools/garment-setup.html) では画像をクリックして4点を指定できます。
