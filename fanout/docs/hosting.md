# Putting Fanout online for Gana

When you're done, Gana opens a link like `https://fanout-203-0-113-5.sslip.io`, logs in, and uploads videos. Setup takes about 20–30 minutes, once.

## What it costs

| | Fanout | repurpose.io |
|---|---|---|
| Software | Free (this repository) | $35/month (Starter) |
| Server | **$0** on Oracle Cloud's free tier, or about €4/month at Hetzner | included |
| Posting service | Buffer: **$0** for up to 3 accounts (10 queued posts each); about $6/month per account for more | included |
| **Total for TikTok + Instagram + YouTube** | **$0/month** | $35/month |
| **Total for those 3 + LinkedIn** | about $24/month (4 Buffer accounts at ~$6) | $35/month |

Buffer prices change; check [buffer.com/pricing](https://buffer.com/pricing) before deciding. To stay at $0 with 4 platforms, keep three in Buffer's free plan and leave the fourth off until needed.

## Step 1: Get a server

### Option A: free (Oracle Cloud "Always Free")

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com). Oracle asks for a card to verify identity; Always Free resources are not charged.
2. Open **Compute → Instances → Create instance**.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere (ARM), `VM.Standard.A1.Flex`, 2 OCPUs and 12 GB memory (the free allowance; Oracle reduced it in 2026, so check the free-tier label in the form).
   - **SSH keys:** choose "Generate a key pair" and **download the private key**.
   - Click **Create**. If you see "Out of capacity", pick another availability domain or try again later; this is common for free ARM servers.
3. Allow web traffic: open the instance → its **Subnet** → **Security List** → **Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination ports `80,443`.
4. Copy the instance's **Public IP address**.

### Option B: about €4/month (Hetzner)

Create a Hetzner Cloud server (smallest ARM or x86 type, Ubuntu 24.04, add your SSH key). Hetzner's firewall is open by default.

## Step 2: Install Fanout (one command)

Connect to the server, from a terminal (macOS/Linux) or PowerShell (Windows):

```bash
ssh -i path/to/private-key ubuntu@YOUR_SERVER_IP      # Hetzner: root@YOUR_SERVER_IP
```

Then paste:

```bash
curl -fsSL https://raw.githubusercontent.com/timZelik/ganadelray/main/fanout/deploy/install.sh | sudo bash
```

> Until the Fanout pull requests are merged, install from the branch instead:
> `curl -fsSL https://raw.githubusercontent.com/timZelik/ganadelray/claude/fanout-gana-hosted/fanout/deploy/install.sh | sudo FANOUT_BRANCH=claude/fanout-gana-hosted bash`

The script installs Docker, opens ports 80/443 on the server, generates all secrets, gets an HTTPS certificate, builds and starts everything (the first build takes several minutes on a small server), and then **asks you to create your own login**. It ends by printing the address.

## Step 3: Give Gana her login

```bash
sudo /opt/fanout/fanout/deploy/add-login.sh
```

Enter her name, email and a password, then send her the address, email and password. Running it again with the same email resets the password.

## Step 4: Connect Buffer (Gana or you, in the browser)

On the **Platforms** page, follow the four steps printed there: create a free Buffer account, connect TikTok/Instagram/YouTube/LinkedIn inside Buffer, create an API key under **Settings → API**, paste it. Fanout matches each platform to the right Buffer account automatically, and those platforms switch from **Practice** to **Posts for real**.

## Using your own domain instead

Point two DNS `A` records at the server, `fanout.example.com` and `media.fanout.example.com`, then install with `FANOUT_DOMAIN`:

```bash
curl -fsSL <install url> | sudo FANOUT_DOMAIN=fanout.example.com bash
```

## Updating

Run the same install command again. It pulls the latest code and rebuilds; secrets, logins, videos and settings are kept.

## Backups

All data lives in Docker volumes on the server. A database backup:

```bash
cd /opt/fanout/fanout && sudo docker compose exec -T postgres pg_dump -U fanout fanout | gzip > ~/fanout-$(date +%F).sql.gz
```

Keep a copy of `/opt/fanout/fanout/.env` somewhere safe: it holds the key that decrypts the stored Buffer connection.

## When something goes wrong

| Symptom | Fix |
|---|---|
| The install stops at "Waiting for https://…" | Ports 80/443 are blocked: re-check Step 1.3 (Oracle security list) |
| The browser says the site can't be reached | Use the printed `https://fanout-…sslip.io` address (not the bare IP), and give the certificate a minute after installing |
| A post says "Buffer needs to be reconnected" | Create a new key in Buffer and paste it on Platforms |
| Anything else | `cd /opt/fanout/fanout && sudo docker compose logs --tail 100 worker api` |
