FROM node:22-bookworm

# 依存ライブラリ（mediasoup がネイティブビルド時に使う）
RUN apt-get update && apt-get install -y build-essential python3 pkg-config git

WORKDIR /app
COPY server ./
RUN npm install
RUN npm run build

EXPOSE 8443
CMD [ "node", "dist/index.js" ]
