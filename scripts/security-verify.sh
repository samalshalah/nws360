#!/bin/bash
set -e

echo "=== NWS360 Security Verification ==="
echo ""

echo "[1/3] Running tenant guard scanner..."
npx tsx scripts/tenant-guard.ts
echo ""

echo "[2/3] Running AI gateway guard scanner..."
npx tsx scripts/ai-gateway-guard.ts
echo ""

echo "[3/3] Running tenant attack penetration test..."
npx tsx scripts/tenant-attack.ts
echo ""

echo "=== All security checks passed ==="
