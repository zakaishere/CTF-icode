# 1. Clone your repo
  git clone <your-repo-url> ~/icode-ctf
  cd ~/icode-ctf

  # 2. Install Docker (one time)
  curl -fsSL https://get.docker.com | sudo bash
  sudo usermod -aG docker $USER
  newgrp docker

  # 3. Create the upload directory
  mkdir -p ~/ctf-uploads   # or /data/ctf-uploads if you have root

  # 4. Configure secrets
  cp .env.example .env
  nano .env
  # Fill in: JWT_SECRET, CTF_FLAG_SECRET, DB_PASSWORD, CTF_INSTANCE_HOST

  # 5. Start everything
  make up

  Then open http://YOUR_SERVER_IP in your browser.

  ---
  Useful commands once it's running

  make ps        # are all 4 containers healthy?
  make logs      # watch all logs live
  make logs-b    # backend logs only
  make down      # stop everything
  make up        # start again

  ---
  Generate the secrets (required step on any new server)

  echo "JWT_SECRET=$(openssl rand -base64 32)"
  echo "CTF_FLAG_SECRET=$(openssl rand -base64 32)"

  Paste the output into your .env. The app refuses to start if these are missing.
