# Self-hosting Firo

One container serves the web app, the sync server, and SQLite. This guide takes a Docker host from nothing to a running Firo with one account and closed registration.

## What you need

- A machine with Docker and the Compose plugin (`docker compose version`).
- About 2 GB of free disk for the build, a few hundred MB after that.
- Ten minutes, most of it the first build.

## Install (from source)

There is no prebuilt image you can pull today: the compose file names `ghcr.io/javohirmx/firo:latest`, but nothing anonymously pullable exists there yet (checked 2026-10-29, anonymously and authenticated). Until a release pipeline publishes one, installation builds from source — the compose file does that for you.

```sh
git clone https://github.com/JavohirMX/firo.git
cd firo
docker compose up -d --build
```

The compose file pins `pull_policy: build`, so Compose builds locally instead of pulling the not-yet-published image. (Older Compose versions may still print a one-line registry "not found" before building - expected, and the build proceeds.) The first build runs the full monorepo build inside Docker; later builds reuse the cache. When it finishes, the app and sync server listen on `http://<host>:8080`. `docker compose logs -f` shows the server log; `curl http://localhost:8080/healthz` answers 200.

## First run: create your account, then close the door

1. Open `http://<host>:8080`. The board works immediately and locally — no account is needed to draw.
2. To sync and share, open the sign-in dialog and choose **register**. Registration always succeeds for the _first_ account, even with open registration disabled — so you can ship the closed configuration from the start.
3. Once your account exists, close registration in `docker-compose.yml`:

   ```yaml
   environment:
     FIRO_OPEN_REGISTRATION: "false"
   ```

   then `docker compose up -d` to apply.

That is the whole setup. There is nothing else to configure; every server setting has a working default (see the environment table in the [README](../README.md#self-hosting-the-server)).

## Data, backups, upgrades

Everything lives in one directory — `./data` by default (SQLite and uploaded assets).

- **Back up:** `tar czf firo-data-$(date +%F).tgz data`
- **Restore:** untar it back and start the container.
- **Upgrade:** `git pull`, then `docker compose up -d --build`. Schema migrations run at startup and are idempotent.
- **Health check:** `GET /healthz`, unauthenticated, returns 200.

## Putting it behind TLS

Firo listens on plain HTTP and expects a reverse proxy to terminate TLS ([TRD-08](trd/08-server-and-auth.md)). Sync uses WebSockets, so the proxy must pass the Upgrade headers. These are reference configurations, checked by inspection, not yet run against a live proxy from this repo — they are the standard shapes for both servers.

Caddy (`Caddyfile`):

```
firo.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy passes WebSocket upgrades automatically; certificates are automatic too. nginx needs the upgrade headers spelled out:

```nginx
server {
    listen 443 ssl;
    server_name firo.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

LAN-only use needs no proxy at all: browse to `http://<host>:8080` and the app and API are same-origin, so `FIRO_ALLOWED_ORIGINS` stays empty.

## Proposed: a minimal first-run onboarding (awaiting approval)

Using only what exists today, the smallest honest onboarding is:

1. This guide (the checklist above is the onboarding).
2. A one-line structured log at server start when registration is open and no accounts exist yet — "create your first account at http://…:8080, then set FIRO_OPEN_REGISTRATION=false". A code change, but no UI.
3. Nothing in the app itself until that is a deliberate product decision: the app's canvas is useful before any account exists, and a setup wizard would sit between the user and the board.

Not proposed: a setup wizard, new screens, or any change to the sign-in dialog before this is reviewed.
