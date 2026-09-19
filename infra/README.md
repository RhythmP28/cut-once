# Deploying to the Vultr VM

One-time setup on the VM (Ubuntu 24.04). Installing software is fine before the hackathon clock; the repo goes on after it.

```bash
# Node 22, pnpm, poppler (page images), Caddy (HTTPS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs poppler-utils git git-lfs && git lfs install --system
sudo corepack enable && sudo corepack prepare pnpm@9 --activate
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable

# the app
sudo useradd --system --create-home cutonce
sudo mkdir -p /opt/cutonce /var/lib/cutonce && sudo chown cutonce: /opt/cutonce /var/lib/cutonce
sudo -u cutonce git clone <repo-url> /opt/cutonce
cd /opt/cutonce && sudo -u cutonce pnpm install --frozen-lockfile && sudo -u cutonce pnpm -F @cutonce/web build

# secrets: copy the names from .env.example and fill them in. Never commit this file.
sudo install -m 600 -o cutonce /dev/null /etc/cutonce.env && sudoedit /etc/cutonce.env

sudo cp infra/cutonce.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now cutonce
sudo cp infra/Caddyfile /etc/caddy/Caddyfile   # put the real domain on its first line first
sudo systemctl reload caddy
curl https://<domain>/health
```

Running the command-line tools on the VM (they need the same settings as the server):
```bash
cd /opt/cutonce && sudo -u cutonce bash -c 'set -a; . /etc/cutonce.env; set +a; pnpm elastic:indices && pnpm reindex'
```

Later deploys: `infra/deploy.sh user@host https://<domain>` (the `cutonce` user needs passwordless `sudo systemctl restart cutonce`).

Gate G8: open `https://<domain>/health` in the Quest's browser, on venue Wi-Fi and on the phone hotspot. If venue Wi-Fi fails, use the hotspot from then on.
