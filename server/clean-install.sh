#!/bin/bash

echo "Cleaning old files..."
rm -rf node_modules package-lock.json dist public/libs public/favicon.ico

echo "Installing dependencies..."
npm install

echo "Checking MediaSoup client library location..."
find node_modules/mediasoup-client -name "*.js" -type f | head -20

echo "Creating libs directory and favicon..."
mkdir -p public/libs
touch public/favicon.ico

echo "Copying MediaSoup client library with UMD validation..."

# 複数のUMDソースを試行
copy_successful=false

# UMDファイルを優先的に探す
if [ -f "node_modules/mediasoup-client/lib/index.umd.js" ]; then
    cp node_modules/mediasoup-client/lib/index.umd.js public/libs/mediasoup-client.js
    echo "Copied from lib/index.umd.js (UMD)"
    copy_successful=true
elif [ -f "node_modules/mediasoup-client/umd/mediasoup-client.js" ]; then
    cp node_modules/mediasoup-client/umd/mediasoup-client.js public/libs/mediasoup-client.js
    echo "Copied from umd/mediasoup-client.js (UMD)"
    copy_successful=true
elif [ -f "node_modules/mediasoup-client/dist/mediasoup-client.umd.js" ]; then
    cp node_modules/mediasoup-client/dist/mediasoup-client.umd.js public/libs/mediasoup-client.js
    echo "Copied from dist/mediasoup-client.umd.js (UMD)"
    copy_successful=true
fi

# ローカルUMDファイルがない場合はCDNから取得
if [ "$copy_successful" = false ]; then
    echo "MediaSoup UMD client not found locally, downloading from CDN..."
    
    # 複数のCDNでUMD版を試行
    if curl -L -f -o public/libs/mediasoup-client.js "https://unpkg.com/mediasoup-client@3.7.6/lib/index.umd.js"; then
        echo "Downloaded UMD from unpkg.com"
        copy_successful=true
    elif curl -L -f -o public/libs/mediasoup-client.js "https://cdn.jsdelivr.net/npm/mediasoup-client@3.7.6/lib/index.umd.js"; then
        echo "Downloaded UMD from jsDelivr"
        copy_successful=true
    elif curl -L -f -o public/libs/mediasoup-client.js "https://unpkg.com/mediasoup-client@3.7.6/umd/mediasoup-client.js"; then
        echo "Downloaded UMD from unpkg.com (alternative path)"
        copy_successful=true
    else
        echo "ERROR: All UMD CDN attempts failed!"
    fi
fi

# ファイル検証（UMD形式チェック）
if [ -f "public/libs/mediasoup-client.js" ]; then
    echo "Validating downloaded file..."
    
    # HTMLファイルでないことを確認
    if head -1 public/libs/mediasoup-client.js | grep -q "^<!DOCTYPE\|^<html\|^404\|Not Found"; then
        echo "ERROR: Downloaded file appears to be HTML, not JavaScript!"
        rm public/libs/mediasoup-client.js
        exit 1
    fi
    
    # ES moduleでないことを確認（UMD形式チェック）
    if head -5 public/libs/mediasoup-client.js | grep -q "^export\|export default"; then
        echo "ERROR: Downloaded file appears to be ES module, not UMD!"
        echo "First 5 lines of the file:"
        head -5 public/libs/mediasoup-client.js
        rm public/libs/mediasoup-client.js
        exit 1
    fi
    
    # UMD形式の確認
    if head -10 public/libs/mediasoup-client.js | grep -q "(function\|typeof exports"; then
        echo "SUCCESS: File is confirmed to be UMD format"
    else
        echo "WARNING: File may not be proper UMD format"
        echo "First 3 lines:"
        head -3 public/libs/mediasoup-client.js
    fi
    
    # ファイルサイズチェック（最小サイズ）
    file_size=$(wc -c < public/libs/mediasoup-client.js)
    if [ "$file_size" -lt 10000 ]; then
        echo "WARNING: File size seems to
