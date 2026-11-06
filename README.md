# Firo

### Workshop boards that remember.

An open-source, local-first whiteboard for teams that want a canvas for the conversation and structured views for the follow-up. Draw, collect ideas, run a workshop, and keep your boards on infrastructure you control.

[Get started](#get-started) · [Features](#on-the-board) · [Self-host](#self-host) · [Contribute](CONTRIBUTING.md)

![Firo showing a synthetic sprint retrospective with three frames and grouped sticky notes](docs/assets/hero.png)

_A real Firo board with sample workshop content. No customer data._

> **Pre-alpha.** The app is usable, but features and formats are still changing. Local boards need no account. Collaboration needs a Firo server. This is not a drop-in replacement for every Miro feature, and no public hosted service is promised here.

## On the board

- **A canvas for working together.** Sticky notes, text, shapes, connectors, images, frames and reusable templates. Use clean lines or a sketch style.
- **Facilitation without leaving the board.** Timer, voting, frame-based presentations, reactions and hide-until-reveal controls. Viewer and commenter links keep their role-specific controls.
- **Structured work beside freeform ideas.** Collections hold records and properties, with table, board, grid, timeline and mind-map projections. These are views of the same records, not separate copies of a task list.
- **A home for the follow-up.** Board folders, search, stars, pinned comments, replies, activity history and local version snapshots.
- **Your storage, your choice.** Browser-local boards work without a server. Optional self-hosted sync adds shared boards and revocable links with editor, commenter or viewer access.

### From a blank board to a workshop

1. Open the app and create a board. Use the left rail to add sticky notes, shapes and text, or open **Templates** for a starting point.
2. Add frames to organize the session. Use the frame tool's size presets or draw your own, then double-click a frame heading to rename it.
3. Open **Facilitation tools** to set a timer, vote or present frames. When connected to your server, use **Share** to invite collaborators.
4. Open the compact status button to see local-save and connection details. Local saving and server connectivity are separate: connected does not mean the latest edit has been acknowledged by the server.

## Get started

### Run the web app locally

Use **Node.js 22 LTS** and **Yarn Classic 1.22.22**, the version pinned in `package.json`. This is a Yarn workspace, not a Yarn 4 project.

```sh
git clone https://github.com/JavohirMX/firo.git
cd firo
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --frozen-lockfile
yarn start
```

Open the local URL printed by Vite. This starts the web app only; it does not start the sync server. You can create and edit local boards without signing in. If Corepack is not available in your Node installation, install Yarn Classic 1.22.22 before running the remaining commands.

### Self-host

For the web app and sync server together, use Docker with the Compose plugin:

```sh
git clone https://github.com/JavohirMX/firo.git
cd firo
docker compose up -d --build
```

Open `http://localhost:8080`. The Compose file builds the image from source; these instructions do not depend on a published container image.

- **Data:** `./data` contains SQLite and uploaded assets. Keep backups before upgrades; browser-local boards are separate from server data.
- **Accounts:** registration is open by default in Compose. Create your users, then set `FIRO_OPEN_REGISTRATION=false` in your environment and run `docker compose up -d` again.
- **Exposure:** the default port mapping listens on all interfaces. For a reverse proxy, bind it to loopback and configure TLS before public access. Set `FIRO_SECURE_COOKIES=true` behind HTTPS.
- **Health:** `curl http://localhost:8080/healthz` should return a successful response.

See the [hosting guide](docs/hosting.md) for configuration, persistent storage and reverse-proxy examples. Proxy examples are reference configurations, not a claim that every deployment has been tested.

## Bring your existing work

Import `.firo` files, Excalidraw JSON and supported Miro JSON / `.rtb` backups from the board home. Import is a conversion, not a promise of pixel-perfect compatibility. Unsupported items are reported in import warnings; check the result before retiring the original board.

## Optional AI and MCP

AI is **off by default**. In **Preferences > AI settings**, enable it on this device and configure your own Ollama or OpenAI-compatible endpoint, model and, if required, API key. No model service or inference credits are included. Configuration is stored in this browser. Board content is sent to that endpoint when you run an AI action; choose and trust the endpoint accordingly.

The repository also contains an [MCP package](packages/mcp) for tools that work with Firo documents. It is a separate integration, not a requirement for drawing, local saving or self-hosted collaboration.

## Current limits

- Browser storage can be cleared or evicted. Export important boards and back up server data; local snapshots are not an off-device backup.
- Hide-until-reveal and presentation visibility are canvas behavior, **not a security boundary** for secrets.
- Comments support pins, replies and resolve. Mentions and read receipts are not implemented.
- AI depends on your configured provider. Saving settings does not prove the model is installed, reachable or suitable for your hardware.
- Product plans and older design documents may describe work that is not in the app yet. The [parity matrix](docs/research/miro-parity-matrix.md) records implemented behavior, evidence and remaining gaps.

## Develop and contribute

Useful checks from the repository root:

```sh
yarn test:code           # ESLint, zero warnings
yarn test:typecheck      # TypeScript
yarn vitest run          # Tests, without watch mode
yarn prettier --check    # Formatting
yarn build               # Production web build
```

`yarn build:packages` builds the workspace packages. For a production server build outside Docker, also run `yarn --cwd apps/server build`; see [hosting](docs/hosting.md) for the supported deployment path.

Report reproducible bugs or discuss larger changes in this repository's issue tracker. Include the app version/commit, browser, steps and a minimal sample board if it is safe to share. Do not put credentials or private boards in issues. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Find your way around

| Area | Start here |
| --- | --- |
| Web app and server | [`apps/web`](apps/web), [`apps/server`](apps/server) |
| Document model and schema | [`packages/doc`](packages/doc), [`packages/schema`](packages/schema) |
| Canvas and UI | [`packages/editor`](packages/editor), [`packages/ui`](packages/ui) |
| Architecture | [Overview](docs/architecture/overview.md) |
| Storage and formats | [Persistence specification](docs/trd/07-persistence-and-formats.md) |
| Server and authentication | [Server specification](docs/trd/08-server-and-auth.md) |
| Product direction | [Vision](docs/vision.md), [roadmap](docs/roadmap.md) |
| All documentation | [Documentation index](docs/index.md) |

## License and provenance

Firo is [MIT licensed](LICENSE). It began as an Excalidraw fork; copyright and license notices are retained. See [NOTICE](NOTICE) for provenance and [FONT-LICENSES.md](FONT-LICENSES.md) for bundled font licenses.
