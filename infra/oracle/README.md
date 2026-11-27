# Hosting Annie on Oracle Cloud Always Free (Ampere A1)

Oracle Cloud Always Free provides an ARM64 Ampere A1 VM (2 OCPU / 12 GB RAM, 200 GB block storage, 10 TB egress/month) suitable for running Annie continuously with SQLite and an optional local Ollama model.

## Setup Steps

```bash
# 1. Install Node 22+ on Ubuntu 24.04 ARM64
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Clone and configure
git clone https://github.com/manofval0r/Annie.git
cd Annie
cp .env.example .env
# Set a persistent 64-char hex ENCRYPTION_KEY in .env:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm ci
```

## Run Under `systemd`

Create `/etc/systemd/system/annie.service`:

```ini
[Unit]
Description=Annie Proactive Personal Agent
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/Annie
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable with `sudo systemctl enable --now annie`. Put Caddy or Cloudflare Tunnel in front for automatic HTTPS.
