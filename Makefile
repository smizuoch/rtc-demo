CERT_DIR := certs
CERT_KEY := $(CERT_DIR)/key.pem
CERT_PEM := $(CERT_DIR)/cert.pem

.PHONY: up down logs cert certs clean

up: cert            ## `make up` でビルド+起動
	docker compose up --build -d

down:               ## コンテナ停止
	docker compose down -v

logs:               ## リアルタイムログ
	docker compose logs -f server

cert: $(CERT_KEY) $(CERT_PEM)
certs: cert         ## `make certs` でも証明書生成可能
$(CERT_KEY) $(CERT_PEM):
	mkdir -p $(CERT_DIR)
	openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
	  -subj "/CN=mediasoup.local" \
	  -addext "subjectAltName=DNS:mediasoup.local,IP:127.0.0.1" \
	  -keyout $(CERT_KEY) -out $(CERT_PEM)

clean:
	rm -rf $(CERT_DIR)
