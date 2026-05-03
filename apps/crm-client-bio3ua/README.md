# crm-client-bio3ua

Example **`client_extension`** image for Control Plane manifests (`role: client_extension`, `clientCode`, digest).

- HTTP: `GET /health` → `{ ok: true, client: "bio3ua" }`
- Default port **3010** (override with `PORT`).

Build:

```bash
npm install --workspace=crm-client-bio3ua
npm run build --workspace=crm-client-bio3ua
```

Docker:

```bash
docker build -t ghcr.io/<namespace>/crm-client-bio3ua:0.1.0 ./apps/crm-client-bio3ua
```

Release manifest row (example):

```json
{
  "role": "client_extension",
  "serviceName": "client-bio3ua",
  "clientCode": "bio3ua",
  "imageRepository": "ghcr.io/<namespace>/crm-client-bio3ua",
  "imageTag": "0.1.0",
  "imageDigest": "sha256:..."
}
```

Adjust `clientCode` / `serviceName` to match your Control Plane registration. Add `moduleCode` only if your CP schema requires it for this role.
