FROM node:22-bookworm

# 依存ライブラリ（mediasoup がネイティブビルド時に使う）
RUN apt-get update && apt-get install -y build-essential python3 pkg-config git curl

WORKDIR /app
COPY server ./
RUN npm install

# MediaSoup クライアントライブラリの詳細な構造を確認
RUN echo "MediaSoup client directory structure:" && \
    find node_modules/mediasoup-client -type f -name "*.js" -o -name "*.json" | sort | head -30 || echo "No files found"

# package.jsonの内容も確認
RUN echo "MediaSoup client package.json:" && \
    cat node_modules/mediasoup-client/package.json | grep -E '"main"|"browser"|"umd"|"dist"' || echo "Package info not found"

# ライブラリディレクトリを作成
RUN mkdir -p public/libs

# MediaSoup クライアントライブラリを取得（実際のファイル構造に基づく）
RUN echo "Attempting to copy MediaSoup client library..." && \
    if [ -f "node_modules/mediasoup-client/lib/mediasoup-client.js" ]; then \
        echo "Found lib/mediasoup-client.js, copying..." && \
        cp node_modules/mediasoup-client/lib/mediasoup-client.js public/libs/mediasoup-client.js; \
    elif [ -f "node_modules/mediasoup-client/build/mediasoup-client.js" ]; then \
        echo "Found build/mediasoup-client.js, copying..." && \
        cp node_modules/mediasoup-client/build/mediasoup-client.js public/libs/mediasoup-client.js; \
    elif [ -f "node_modules/mediasoup-client/dist/mediasoup-client.js" ]; then \
        echo "Found dist/mediasoup-client.js, copying..." && \
        cp node_modules/mediasoup-client/dist/mediasoup-client.js public/libs/mediasoup-client.js; \
    elif [ -f "node_modules/mediasoup-client/lib/index.js" ]; then \
        echo "Found lib/index.js, copying..." && \
        cp node_modules/mediasoup-client/lib/index.js public/libs/mediasoup-client.js; \
    else \
        echo "Local file not found, downloading from CDN..." && \
        (curl -L -f -o public/libs/mediasoup-client.js "https://unpkg.com/mediasoup-client@3.7.6" || \
         curl -L -f -o public/libs/mediasoup-client.js "https://cdn.skypack.dev/mediasoup-client@3.7.6?min") && \
        echo "Downloaded from CDN"; \
    fi

# ダウンロードしたファイルの検証
RUN if [ -f "public/libs/mediasoup-client.js" ]; then \
        echo "MediaSoup client file exists, validating..." && \
        echo "File size: $(wc -c < public/libs/mediasoup-client.js) bytes" && \
        echo "First 5 lines:" && \
        head -5 public/libs/mediasoup-client.js && \
        if head -1 public/libs/mediasoup-client.js | grep -q "^<!DOCTYPE\|^<html\|^404\|Not Found"; then \
            echo "ERROR: Downloaded file appears to be HTML, not JavaScript!" && \
            rm public/libs/mediasoup-client.js && \
            echo "Trying Skypack as fallback..." && \
            curl -L -f -o public/libs/mediasoup-client.js "https://cdn.skypack.dev/mediasoup-client@3.7.6"; \
        fi; \
    else \
        echo "ERROR: MediaSoup client file not found!"; \
    fi

# 最終的なファイル内容の確認
RUN if [ -f "public/libs/mediasoup-client.js" ]; then \
        file_size=$(wc -c < public/libs/mediasoup-client.js); \
        echo "Final file size: $file_size bytes"; \
        if [ "$file_size" -lt 1000 ]; then \
            echo "WARNING: File size is suspiciously small!"; \
            head -10 public/libs/mediasoup-client.js; \
        else \
            echo "File appears to be valid JavaScript"; \
        fi; \
    fi

# favicon.icoを作成
RUN echo "Creating favicon..." && \
    touch public/favicon.ico

RUN npm run build

EXPOSE 8443
CMD [ "node", "dist/index.js" ]
