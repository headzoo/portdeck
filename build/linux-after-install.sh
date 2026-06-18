#!/bin/bash
set -e

SANDBOX="/opt/Portdeck/chrome-sandbox"

if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" 2>/dev/null || true
  chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

cat > /usr/bin/portdeck << 'EOF'
#!/bin/sh
exec /opt/Portdeck/portdeck --no-sandbox "$@"
EOF
chmod 755 /usr/bin/portdeck
