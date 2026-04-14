# Deploy de producao

## Estrutura preparada

- `config/settings.py`: escolhe `dev` ou `prod` via `DJANGO_SETTINGS_ENV`
- `config/settings_base.py`: configuracao compartilhada
- `config/settings_prod.py`: seguranca e SSL de producao
- `.env.example`: variaveis para copiar para `.env`
- `requirements.txt`: dependencias de deploy
- `gunicorn.conf.py`: execucao ASGI com suporte a WebSocket
- `deploy/nginx.conf`: modelo de virtual host
- `deploy/gunicorn.service`: modelo de service no systemd

## Stack recomendada

- Ubuntu 24.04
- Python 3.13
- PostgreSQL
- Redis
- Nginx
- Gunicorn com `uvicorn.workers.UvicornWorker`

## Passos no servidor

1. Instale pacotes do sistema:
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip postgresql postgresql-contrib redis-server nginx
```

2. Crie a pasta do projeto e envie os arquivos:
```bash
sudo mkdir -p /var/www/dlima-vendas
sudo chown $USER:$USER /var/www/dlima-vendas
```

3. Crie o ambiente virtual e instale dependencias:
```bash
cd /var/www/dlima-vendas
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

4. Copie `.env.example` para `.env` e ajuste os valores reais:
```bash
cp .env.example .env
```

5. Crie o banco e o usuario no PostgreSQL:
```bash
sudo -u postgres psql
CREATE DATABASE dlima_vendas;
CREATE USER dlima_user WITH PASSWORD 'troque-por-uma-senha-forte';
GRANT ALL PRIVILEGES ON DATABASE dlima_vendas TO dlima_user;
\q
```

6. Rode migrations e estaticos:
```bash
source venv/bin/activate
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
```

7. Instale o service:
```bash
sudo cp deploy/gunicorn.service /etc/systemd/system/dlima-vendas.service
sudo systemctl daemon-reload
sudo systemctl enable dlima-vendas
sudo systemctl start dlima-vendas
```

8. Instale o Nginx:
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dlima-vendas
sudo ln -s /etc/nginx/sites-available/dlima-vendas /etc/nginx/sites-enabled/dlima-vendas
sudo nginx -t
sudo systemctl restart nginx
```

9. Ative HTTPS com Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

## Variaveis mais importantes

- `DJANGO_SETTINGS_ENV=prod`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DATABASE_ENGINE=postgres`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`
- `USE_REDIS_CHANNEL_LAYER=True`
- `REDIS_URL`

## Impressao no PDV

Mesmo em producao web:

- a venda sera salva no servidor
- a impressao continua no computador do caixa
- cada caixa precisa de:
  - impressora Elgin instalada no Windows
  - QZ Tray instalado e aberto
  - acesso HTTPS ao sistema

## Comandos uteis

```bash
sudo systemctl status dlima-vendas
sudo journalctl -u dlima-vendas -f
sudo systemctl restart nginx
sudo systemctl restart dlima-vendas
```
