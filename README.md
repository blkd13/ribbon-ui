# Ribbon UI

このプロジェクトは [openai-api-wrapper](./openai-api-wrapper)用のUIです。

openai-api-wrapper で `npm run start:dev` を実行しておく必要があります。

## 開発サーバー

開発サーバーを実行するには、`npm run start` を実行します。 `http://localhost:4200/` にアクセスしてください。
ソースファイルを変更すると、アプリケーションが自動的にリロードされます。

## ビルド

プロジェクトをビルドするには、`ng build` を実行します。ビルドアーティファクトは `dist/` ディレクトリに保存されます。


## 仕様

- チャット履歴はローカルキャッシュに保存されます。
- エラー検知に難があります。固まってしまったらエラーなのでリロードして空のassistantエリアを消してからやり直してください。
