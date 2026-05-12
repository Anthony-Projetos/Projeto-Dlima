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
python manage.py collectstatic --clear --noinput
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

## Impressao termica com QZ Tray

A impressao acontece no computador do caixa, via navegador + QZ Tray local.

- Instale e deixe o QZ Tray aberto no Windows do caixa.
- Instale a impressora termica, por exemplo `ELGIN i9(USB)`.
- O template carrega `qz-tray.js` e `static/js/vendas/print.js` via `{% static %}`.
- Em producao, `ManifestStaticFilesStorage` gera nomes versionados para JS/CSS, por exemplo `print.<hash>.js`.
- Depois de qualquer alteracao em JS/CSS, rode `collectstatic` e reinicie Gunicorn/Nginx para publicar o novo manifesto.
- O recibo e enviado em RAW ESC/POS, com codepage `CP860`, sem HTML, PDF, canvas ou `window.print()`.

Comandos uteis no console do navegador:

```js
window.PDV_PRINT_VERSION
connectQZ()
testarImpressao()
```

Se `print.js` retornar 404, rode no servidor:

```bash
source venv/bin/activate
python manage.py collectstatic --clear --noinput
sudo systemctl restart dlima-vendas
sudo systemctl restart nginx
```

Se o seu service no systemd se chamar `gunicorn` em vez de `dlima-vendas`, use:

```bash
sudo systemctl restart gunicorn
sudo systemctl restart nginx
```

Para diagnosticar cache antigo no navegador, abra o console e confira:

```js
window.PDV_PRINT_VERSION
window.__PDV_PRINT_MODULE_LOADS
navigator.serviceWorker?.getRegistrations?.().then(console.log)
```

## Comandos uteis

```bash
sudo systemctl status dlima-vendas
sudo journalctl -u dlima-vendas -f
sudo systemctl restart nginx
sudo systemctl restart dlima-vendas
```
