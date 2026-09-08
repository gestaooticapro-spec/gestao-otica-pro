# Segmentacao de lentes (tablet MB Optical)

Servico isolado da Torre-NeoSmart e do WhatsApp. O tablet pede um token curto
ao app e envia a foto so para este processo. A foto e apagada depois da
inferencia. O peso `models/best.pt` e um snapshot congelado; um retrain da
Torre nao atualiza este arquivo sozinho.

A/B/D no tablet continua sendo o aro do OD. OE entra so na ponte e na altura.

## Variaveis

- `LENS_SEGMENT_INTERNAL_SECRET`: mesmo valor no app e neste servico, minimo 32 caracteres.
- `LENS_SEGMENT_ALLOWED_ORIGINS`: origens CORS do app, separadas por virgula.
- `LENS_SEGMENT_HOST` / `LENS_SEGMENT_PORT`: padrao `127.0.0.1:8090`.

No app (`gestao-otica-pro`):

- `LENS_SEGMENT_INTERNAL_SECRET`
- `LENS_SEGMENT_URL`: URL publica HTTPS deste servico, sem barra no final.

## Proxy

Expor so `/v1/segment` com HTTPS, `client_max_body_size 15m` (a foto chega em
Base64) e timeout alto o bastante para CPU. `/health` fica em `127.0.0.1`. Nao registre o corpo da foto
no access log. O unit `systemd` deve usar o usuario sem privilegios
`lenssegmentation`.

## Boot

O processo recusa subir se `MODEL_SOURCE.txt` nao tiver o `sha256` igual ao
`models/best.pt`. Inferencia e uma de cada vez.

As dependencias fixam PyTorch CPU: esta VPS nao usa GPU e nao deve baixar os
pacotes CUDA.

```bash
./install-dependencies.sh
python server.py
```
