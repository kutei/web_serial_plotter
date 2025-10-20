# Web Serial Plotter

WebSerial APIを使用したシリアル通信データ可視化Webアプリケーション

## 機能

### 🖥️ シリアルターミナル
- ターミナルライクなインターフェース
- 双方向シリアル通信
- コマンド送信・受信履歴
- ログエクスポート機能
- 各種設定（ボーレート、改行コード等）

### 📊 PIDグラフプロッター
- 1軸PID制御結果のリアルタイムグラフ表示
- データ統計表示（最小値、最大値、平均値）
- グラフデータのCSVエクスポート
- 自動スケール・手動スケール設定
- 最大データ点数制限

## 技術仕様

- **フレームワーク**: React 18
- **通信**: WebSerial API
- **グラフ**: Chart.js + react-chartjs-2
- **UI**: Lucide React アイコン
- **対応ブラウザ**: Chrome, Edge（WebSerial API対応）

## セットアップ

1. 依存関係のインストール:
```bash
npm install
```

2. 開発サーバーの起動:
```bash
npm start
```

3. ブラウザで `http://localhost:3000` を開く

## データ形式

### PIDグラフプロッター
シリアル通信で以下の形式のデータを受信:
- 1行に1つの数値: `123.45`
- カンマ区切り（最初の値を使用）: `123.45,67.89,...`

## ブラウザ対応

WebSerial APIを使用するため、以下のブラウザが必要:
- Google Chrome (バージョン 89以降)
- Microsoft Edge (バージョン 89以降)
- その他WebSerial API対応ブラウザ

## セキュリティ

- HTTPS環境での実行を推奨
- ユーザー操作によるシリアルポート選択が必要
- 自動接続機能なし（セキュリティ上の制限）

## プロジェクト構造

```
src/
├── components/
│   ├── MenuScreen.js          # メニュー画面
│   ├── SerialTerminal.js      # シリアルターミナル
│   └── PIDGraphPlotter.js     # PIDグラフプロッター
├── hooks/
│   └── useSerial.js           # シリアル通信フック
├── utils/
│   └── serialManager.js       # シリアル通信管理
├── App.js                     # メインアプリケーション
├── index.js                   # エントリーポイント
└── index.css                  # スタイルシート
```

## ライセンス

MIT License
