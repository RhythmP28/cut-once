# Cut Once: Foundation Setup (what to download, create and check)

2026-09-18 · Goal: everyone can start building at **T+0 (Sat 00:00 EDT)**, and the foundation is finished by **T+1**.

**Rule reminder.** Before midnight we may install software, create accounts, plan and gather public data. We may **not** write project code or create design assets (no repo content, no desk JSON, no QR sheets, no drawings) until T+0.

**Downloads are big.** Unity 6 with Android support is several GB. Start it now, on the fastest network you have.

Commands below are for macOS with Homebrew. Windows notes are in brackets.

---

## Everyone (all four laptops)

| Install | How |
|---|---|
| Git + Git LFS | `brew install git git-lfs && git lfs install` [Windows: Git for Windows, then `git lfs install`] |
| GitHub account | Send your username to Michael |
| GitHub CLI (optional) | `brew install gh && gh auth login` |
| Slack / Discord | Join the HTN channels. Sponsor sign-up links arrive there on Sunday |
| Badge ID | From your badge at check-in, exactly as printed under the QR code. Send to Michael |

---

## A1 · Spatial Lead (Jerry or Henry)

### Download and install tonight
| Item | How / where |
|---|---|
| **Unity Hub** | unity.com/download. Sign in with a free Unity ID (Personal licence) |
| **Unity 6000.3.12f1** | Hub → Installs → Install Editor → Archive → 6000.3.12f1. **Tick modules: Android Build Support, OpenJDK, Android SDK & NDK Tools.** Same exact version as QuestCameraKit |
| **Meta Quest Developer Hub (MQDH)** | developers.meta.com → Downloads. Installs `adb`, lets you install APKs, see logs, cast, and change device settings |
| **Code editor** | VS Code + the "Unity" extension (Microsoft). Use Rider if you already have it |
| **QuestCameraKit** (public sample) | `git clone https://github.com/xrdevrob/QuestCameraKit`. Open it once in Unity so the (slow) first import finishes tonight |

### Headset, tonight
1. Create or join a **Meta developer organisation** at developers.meta.com. Meta may ask you to verify the account first.
2. In the **Meta Horizon phone app**: Devices → your Quest → Headset settings → **Developer Mode on**. Reboot.
3. On the Quest: Settings → System → Software update. Must be **Horizon OS v74 or newer** (camera access needs it).
4. Plug into the laptop with a USB-C data cable, accept "Allow USB debugging" in the headset, tick "Always allow".
5. `adb devices` must list the headset.
6. **Toolchain test:** build QuestCameraKit's own sample scene to the headset. This checks your install; it is their public code, not ours. If you're unsure whether that's allowed, ask an organiser.
7. In MQDH device settings, look for proximity sensor and boundary options, so the headset stays awake when put down and the boundary doesn't interrupt the demo.

### Physical, tonight
- **Find a printer** that prints at 100% scale on matte paper. Sheets are generated after midnight.
- Tape measure, ruler (mm), painter's tape, stickers, a marker.

### First hour after midnight (foundation done = G1 by T+1)
- [ ] Fork QuestCameraKit into our repo as `apps/quest`; set up `.gitattributes` for Unity YAML merge and Git LFS
- [ ] Agree the C# interfaces with A2 and Rhythm (blueprint section 13)
- [ ] Measure the desk with Michael; generate and print the QR sheets; stick them on
- [ ] **G1:** our fork builds to the Quest, passthrough shows, a test cube floats

---

## A2 · Rendering & State Lead (Jerry or Henry)

### Download and install tonight
| Item | How / where |
|---|---|
| **Unity Hub + Unity 6000.3.12f1** | Same as A1, same modules |
| **MQDH** | Same as A1 (to install builds and read logs) |
| **VS Code + Unity extension** | Same as A1 |
| **Codex** (for the OpenAI prize) | `npm install -g @openai/codex` (needs Node, below), sign in with a ChatGPT account. Or the Codex IDE extension |
| **Node 22** (only for Codex) | `brew install node@22` |
| **scrcpy** (casting fallback) | `brew install scrcpy` |
| **OBS Studio** (optional) | For recording the demo video if Unity Recorder or casting fails |

Also open QuestCameraKit once in Unity tonight so the import cache is ready.

### Physical, tonight (A2 owns the desk)
- **The desk:** a flat top with **four legs that screw in by hand**, light enough for one person to carry between rooms.
- A power strip, a cable, cable clips, and something to be the crossbar and the cable tray.
- A USB-C battery pack for the headset.

### First hour after midnight (foundation done by T+1)
- [ ] Data classes (C# mirror of the schemas) and the coordinate conversion
- [ ] Load the asymmetric test fixture; confirm it isn't mirrored
- [ ] Replay logic started with Codex; first entry in `CODEX_LOG.md`

---

## Michael · Platform & Knowledge Lead (B + D)

### Download and install tonight
| Item | How / where |
|---|---|
| **Node 22 + pnpm** | `brew install node@22 && corepack enable` |
| **Python 3.11** | `brew install python@3.11`, then a venv with `pip install numpy opencv-python shapely trimesh pyyaml jsonschema pillow ezdxf` |
| **PDF and media tools** | `brew install poppler ffmpeg jq` · `brew install --cask inkscape` |
| **Codex** | `npm install -g @openai/codex`, sign in with ChatGPT |

### Accounts and infrastructure, tonight
| Item | How | Notes |
|---|---|---|
| **GitHub repo** | Create an empty repo `cut-once`, invite Jerry, Henry, Rhythm | First commit after midnight |
| **Hosting** | No VM (Vultr dropped 2026-09-19). The server runs on Michael's laptop behind a Cloudflare tunnel: `brew install cloudflared`, then `infra/README.md` | Quick tunnels need no account |
| **Domain** | Register through **mlh.link/GoDaddyRegistry** (required for that prize; check which endings qualify). Optional: point it at the laptop with a named Cloudflare tunnel (`infra/README.md`) | Needs the nameservers moved to Cloudflare |
| **Elastic Cloud** | Get a cluster from the Elastic booth or their Slack channel. **Confirm version 9.4+**, and write down the **Jina embedding and reranker IDs** | If it's lower, plan for keyword search only |
| **Devpost** | Everyone joins hackthenorth2026.devpost.com. Draft the project page tonight; submit the skeleton at T+1 with all five prizes | Prizes lock at Sat 2:00 PM |
| **Second Quest** | Ask the HTN hardware desk | Biggest logistics win available |

### Data, tonight (allowed: gathering public data)
- Download the E7 drawings from ArchDaily into a folder outside the repo. Don't process them yet.
- The manufacturer's assembly manual PDF for whichever desk A2 gets.

### First hour after midnight (foundation done by T+1)
- [ ] Monorepo created: `pnpm-workspace.yaml`, `packages/schemas`, `services/api`, `apps/web`, `data/fixtures`
- [ ] Schemas and fixtures committed; **contracts frozen by T+0:45**
- [ ] Measure the desk with A1
- [ ] `<tunnel address>/health` opens in the Quest's browser (**G8**)
- [ ] **Devpost skeleton submitted** with all four badge IDs and five prizes

---

## Rhythm · Copilot Lead (C)

### Download and install tonight
| Item | How / where |
|---|---|
| **Unity Hub + Unity 6000.3.12f1** | Same as A1, same modules. You own the `[Copilot]` prefab |
| **MQDH** | Same as A1 |
| **VS Code + Unity extension** | Same as A1 |
| **Node 22 + pnpm** | `brew install node@22 && corepack enable` (server side of the copilot) |
| **ffmpeg** | `brew install ffmpeg` (to check audio files) |
| **scrcpy** | `brew install scrcpy` (casting fallback) |

Also open QuestCameraKit once in Unity and read its **ImageLLM** sample (voice + camera → OpenAI → spoken answer).

### Accounts and keys, tonight
| Item | How | Notes |
|---|---|---|
| **OpenAI API** | platform.openai.com → add billing → create a key. Check whether the OpenAI booth has hackathon credits | Keys live only on the server, never in the app |
| **ElevenLabs** | Sign up through **mlh.link/elevenlabs**, create an API key, pick a voice | Counts for the MLH prize |
| **Smoke test** | One `curl` to each API from your terminal to prove the keys work. Don't save it in the repo | Allowed; it's account checking, not project code |

### Physical
- A phone that can run a **hotspot** for the headset and laptop during judging, plus its charger.

### First hour after midnight (foundation done by T+1)
- [ ] **G0:** confirm the chosen model accepts an image and returns strict JSON; if not, switch to the backup model
- [ ] Agree the C# interfaces with A1 and A2
- [ ] Server route skeleton for `/copilot/query` and a `/debug` page

---

## Shared items (owner in brackets)

| Item | Owner |
|---|---|
| Desk, power strip, cable, clips, tray | A2 |
| Printer for QR sheets; tape measure; ruler; tape; stickers | A1 |
| USB-C **data** cable, long enough to reach the room display | A1 |
| USB-C battery pack for the headset | A2 |
| HDMI and USB-C adapters for the room display | Rhythm |
| Phone hotspot | Rhythm |
| Second Quest request | Michael |

---

## Foundation is finished when (T+1)

- [ ] All four people have pushed once to the repo; Git LFS works
- [ ] Schemas, fixtures and C# interfaces committed and frozen
- [ ] Our Unity fork builds to the Quest from at least two laptops
- [ ] `<tunnel address>/health` answers in the Quest's browser
- [ ] OpenAI takes an image and returns strict JSON; ElevenLabs returns audio
- [ ] Elastic version confirmed, Jina IDs noted
- [ ] Desk measured, QR sheets printed and stuck on
- [ ] Devpost skeleton submitted with team, badge IDs and all five prizes

Then the first build gates (G2 to G6 in the blueprint) start.
