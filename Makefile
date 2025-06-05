CERT_DIR := certs
CERT_KEY := $(CERT_DIR)/key.pem
CERT_PEM := $(CERT_DIR)/cert.pem

.PHONY: up down logs cert certs clean install check-libs

up: cert            ## `make up` でビルド+起動
	docker compose up --build -d

down:               ## コンテナ停止
	docker compose down -v

logs:               ## リアルタイムログ
	docker compose logs -f server

debug:              ## エラーログ確認
	docker compose logs server

restart:            ## 再起動
	docker compose down && make up

install:            ## 依存関係インストール+ビルド
	cd server && npm install && npm run build

check-libs:         ## ライブラリファイルの確認
	cd server && find node_modules/mediasoup-client -name "*.js" | head -10

cert: $(CERT_KEY) $(CERT_PEM)
certs: cert         ## `make certs` でも証明書生成可能
$(CERT_KEY) $(CERT_PEM):
	mkdir -p $(CERT_DIR)
	openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
	  -subj "/CN=mediasoup.local" \
	  -addext "subjectAltName=DNS:mediasoup.local,IP:127.0.0.1" \
	  -keyout $(CERT_KEY) -out $(CERT_PEM)

clean:
	rm -rf $(CERT_DIR) server/node_modules server/dist server/public/libs

rebuild:            ## 完全リビルド
	make clean && make up
