# Putting the server online (no VM)

The server runs on one laptop. A Cloudflare tunnel gives it a public HTTPS address, so the Quest reaches it from any
network with no VM, DNS, open ports or certificates. HTTPS also means the Unity app needs no cleartext exception.

## One-time
```bash
brew install cloudflared
pnpm install
```

## Every time (two terminal windows on the server laptop)
```bash
pnpm serve:local   # window 1: builds the web app, starts the API on port 8080
pnpm tunnel        # window 2: prints https://<words>.trycloudflare.com and checks /health through it
```

- `serve:local` creates `.env.local` from `.env.example` on first run and fills in a random `API_TOKEN`, which is
  kept across restarts. The server refuses to start without one. Put the same token in the headset's operator panel
  (`grep API_TOKEN .env.local`). Add the Elastic, OpenAI and ElevenLabs keys to `.env.local` when you have them;
  `/health` shows them as `unset` until then.
- Open `<address>/health` in the Quest's browser. The Director page is `<address>/director`.
- **Restart the server freely** (after a `git pull`, say): the address stays the same. Only restarting `pnpm tunnel`
  gives a new address, and then the headset needs the new one.
- Keep the laptop plugged in with the lid open. `pnpm tunnel` stops the Mac sleeping while it runs, but closing the
  lid still sleeps it.
- Data lives in `data/runtime/` on this laptop and nowhere else. Run `pnpm backup` before each judging slot
  (copies it to `backups/<time>/`).

Gate G8: open `<address>/health` in the Quest's browser, on venue Wi-Fi and on the phone hotspot. If venue Wi-Fi
fails, put the laptop and the headset on the hotspot from then on.

## If the tunnel won't connect
Quick tunnels come with no uptime guarantee, and some networks block the outbound port (7844) cloudflared uses.
1. Move the laptop to the phone hotspot and run `pnpm tunnel` again.
2. Still nothing: skip the tunnel. `serve:local` already listens on all interfaces, so on the hotspot the headset can
   use `http://<laptop-ip>:8080` (find the IP with `ipconfig getifaddr en0`). Android blocks plain `http://` by
   default, so this only works if the Unity app's network security config allows cleartext to that address
   (`apps/quest`, Jerry and Henry).

## Optional: a fixed address on our own domain
The quick-tunnel address changes whenever `pnpm tunnel` restarts. For one that never changes (and a use for the
GoDaddy Registry domain), use a named tunnel. It needs a free Cloudflare account, and the domain's nameservers moved
to Cloudflare at the registrar. Not tested by us yet.
```bash
cloudflared tunnel login                          # pick the domain in the browser
cloudflared tunnel create cutonce
cloudflared tunnel route dns cutonce api.<domain>
pnpm tunnel cutonce https://api.<domain>          # instead of plain `pnpm tunnel`
```

## Command-line tools
They read `.env.local` like the server: `pnpm elastic:indices && pnpm reindex`.
