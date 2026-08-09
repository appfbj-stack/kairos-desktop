#!/bin/bash
###############################################################################
# rotate-openrouter-key.sh
#
# Roda no VPS para trocar a OPENROUTER_API_KEY sem perder a chave antiga.
#
# Uso:
#   # Com chave como argumento (CUIDADO: fica no history do shell):
#   ./rotate-openrouter-key.sh sk-or-v1-NEW_KEY_HERE
#
#   # Com chave via stdin (mais seguro):
#   read -s -p "Nova chave: " KEY && echo && ./rotate-openrouter-key.sh "$KEY"
#
#   # Dry-run (mostra o que vai fazer, sem alterar):
#   ./rotate-openrouter-key.sh --dry-run sk-or-v1-NEW_KEY
#
# O que faz:
#   1. Valida formato da chave (sk-or-v1-...)
#   2. Faz backup do .env.production atual
#   3. Substitui OPENROUTER_API_KEY=<nova> mantendo outras vars
#   4. Reinicia o container kairos-core
#   5. Espera health OK (max 30s)
#   6. Chama /system/health-detailed pra confirmar que a nova chave funciona
#      (testa /auth/key no OpenRouter - retorna 200 se chave valida + creditos)
#
# Pre-requisitos:
#   - Rodar como root no VPS (acesso ao /opt/kairos e docker)
#   - OPENROUTER_API_KEY nova ja criada em https://openrouter.ai/settings/keys
#   - Chave ANTIGA ainda nao revogada (para rollback se necessario)
#
# Rollback:
#   cp /opt/kairos/.env.production.backup.YYYYMMDD-HHMMSS /opt/kairos/.env.production
#   cd /opt/kairos/deploy && docker compose restart kairos-core
###############################################################################

set -euo pipefail

ENV_FILE="/opt/kairos/.env.production"
BACKUP_DIR="/opt/kairos/.env-backups"
COMPOSE_DIR="/opt/kairos/deploy"

# ----- Parse args -----
DRY_RUN=false
NEW_KEY="${1:-}"

if [ "$NEW_KEY" = "--dry-run" ]; then
  DRY_RUN=true
  NEW_KEY="${2:-}"
fi

if [ -z "$NEW_KEY" ]; then
  echo "Uso: $0 [--dry-run] <sk-or-v1-NEW_KEY>"
  echo "Ou:  read -s -p 'Nova chave: ' K && echo && $0 \"\$K\""
  exit 1
fi

# ----- Validate format -----
if ! [[ "$NEW_KEY" =~ ^sk-or-v1-[a-zA-Z0-9_-]{20,}$ ]]; then
  echo "ERRO: chave nao parece ser OpenRouter valida (formato esperado: sk-or-v1-...)"
  echo "Recebido: ${NEW_KEY:0:20}..."
  exit 1
fi

# ----- Validate env file exists -----
if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE nao existe. Rodar setup inicial primeiro."
  exit 1
fi

# ----- Show current state -----
echo "=========================================="
echo "  Kairos - Rotacao de Chave OpenRouter"
echo "=========================================="
echo "Env file:    $ENV_FILE"
echo "Compose dir: $COMPOSE_DIR"
echo "Dry run:     $DRY_RUN"
echo ""

OLD_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
if [ -z "$OLD_KEY" ]; then
  echo "AVISO: nao encontrei OPENROUTER_API_KEY no $ENV_FILE (vou adicionar)."
elif [ "$OLD_KEY" = "$NEW_KEY" ]; then
  echo "AVISO: a chave nova e igual a atual. Nada a fazer."
  exit 0
else
  echo "Chave atual: ${OLD_KEY:0:20}...${OLD_KEY: -6:}"
fi
echo "Chave nova:  ${NEW_KEY:0:20}...${NEW_KEY: -6:}"
echo ""

# ----- Confirm (a menos que --yes) -----
if [ "$DRY_RUN" = false ] && [ "${ROTATE_SKIP_CONFIRM:-}" != "1" ]; then
  read -p "Confirmar substituicao? (s/N) " CONFIRM
  if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
    echo "Cancelado."
    exit 0
  fi
fi

# ----- Dry run ends here -----
if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN - nenhuma alteracao feita."
  exit 0
fi

# ----- Backup -----
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/.env.production.backup.$TIMESTAMP"
cp -p "$ENV_FILE" "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE"

# ----- Replace key in env file -----
# Usa sed pra substituir a linha OPENROUTER_API_KEY= mantendo outras vars intactas.
# Se nao existir a linha, adiciona no final.
if grep -qE '^OPENROUTER_API_KEY=' "$ENV_FILE"; then
  sed -i "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=$NEW_KEY|" "$ENV_FILE"
else
  echo "" >> "$ENV_FILE"
  echo "OPENROUTER_API_KEY=$NEW_KEY" >> "$ENV_FILE"
fi

# Limpa permissao (env tem chave secreta!)
chmod 600 "$ENV_FILE"
echo "Chave substituida em $ENV_FILE"

# ----- Validate new key with OpenRouter before restarting -----
echo ""
echo "Validando nova chave no OpenRouter..."
HTTP_TEST=$(curl -sS -o /tmp/openrouter-test.json -w '%{http_code}' \
  -H "Authorization: Bearer $NEW_KEY" \
  https://openrouter.ai/api/v1/auth/key 2>/dev/null || echo "000")
if [ "$HTTP_TEST" = "200" ]; then
  echo "  OK - chave valida + autenticada"
  if command -v python3 &>/dev/null; then
    python3 -c "
import json
try:
    d = json.load(open('/tmp/openrouter-test.json'))
    data = d.get('data', {})
    limit = data.get('limit_remaining', '?')
    usage = data.get('usage', 0)
    label = data.get('limit_label', 'free')
    print(f'  Limite: \${limit:.2f} | Uso: \${usage:.4f} | Plano: {label}')
except Exception:
    pass
" 2>/dev/null || true
  fi
elif [ "$HTTP_TEST" = "401" ]; then
  echo "  ERRO 401 - chave invalida ou revogada!"
  echo "  Rollback sugerido:"
  echo "    cp $BACKUP_FILE $ENV_FILE"
  exit 1
elif [ "$HTTP_TEST" = "402" ]; then
  echo "  AVISO 402 - chave valida mas sem creditos (precisa adicionar em openrouter.ai/settings/credits)"
else
  echo "  HTTP $HTTP_TEST - nao consegui validar, mas seguindo..."
fi

# ----- Restart container -----
echo ""
echo "Reiniciando kairos-core..."
cd "$COMPOSE_DIR"
docker compose up -d kairos-core 2>&1 | tail -3

# ----- Wait for health -----
echo ""
echo "Aguardando health (max 30s)..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:4098/health 2>/dev/null | grep -q '"ok"'; then
    echo "  HEALTH OK apos ${i}x3s"
    break
  fi
  sleep 3
done

# ----- Final validation -----
echo ""
echo "=== Validacao final ==="
echo "Skills: $(curl -fsS http://127.0.0.1:4098/skills/list | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"count\"])' 2>/dev/null || echo 'N/A')"

echo ""
echo "Para reverter (rollback):"
echo "  cp $BACKUP_FILE $ENV_FILE"
echo "  cd $COMPOSE_DIR && docker compose restart kairos-core"
echo ""
echo "Para revogar a chave ANTIGA no OpenRouter:"
echo "  https://openrouter.ai/settings/keys"
