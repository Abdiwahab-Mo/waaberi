#!/usr/bin/env bash
# Starts the whole Waaberi stack with Docker Compose.
#   Website: http://localhost:3000      Admin: http://localhost:3000/admin
set -e
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker not found. Install/start Docker Desktop or Rancher Desktop first."; exit 1; }
docker info >/dev/null 2>&1  || { echo "Docker is not running. Open Docker Desktop / Rancher Desktop and try again."; exit 1; }

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  SECRET=$(openssl rand -hex 32)
  PASS=$(openssl rand -base64 12 | tr -d '/+=')
  sed -i.bak "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET|; s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$PASS|" backend/.env && rm -f backend/.env.bak
  echo "Created backend/.env  ->  admin login: admin@example.com / $PASS  (saved in backend/.env)"
fi

docker compose up --build -d

echo "Waiting for the site..."
for i in $(seq 1 60); do
  curl -sf http://localhost:3000/api/health >/dev/null && break
  sleep 2
done
if curl -sf http://localhost:3000/api/health >/dev/null; then
  echo "Website: http://localhost:3000   Admin: http://localhost:3000/admin"
  open http://localhost:3000 2>/dev/null || true
else
  echo "Site did not come up. Check logs with:  docker compose logs api web"
  exit 1
fi
echo "Stop with:  docker compose down"
