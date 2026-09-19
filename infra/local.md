# Laptop fallback server

If the VM or the venue network dies, the same server runs on a laptop on the phone hotspot.

1. Before each judging slot: `pnpm sync:from-vm user@host` (copies the VM's data into `data/runtime-local/`) and `pnpm backup user@host`.
2. `pnpm serve:local` builds the web app and starts the API on `0.0.0.0:8080`. It prints nothing special: find the laptop's hotspot address with `ipconfig getifaddr en0`.
3. In the headset's operator panel switch the server to `http://<laptop-ip>:8080`. The Director page is at the same address.

Android blocks plain `http://` by default. The Unity app needs a network security config that allows cleartext traffic to the laptop's address, or this fallback will not connect. That file lives in `apps/quest` (Jerry and Henry).
