#!/bin/bash
set -e

echo "=== NWS360 Security Verification ==="
echo ""

echo "[1/2] Running tenant guard scanner..."
npx tsx scripts/tenant-guard.ts
echo ""

echo "[2/2] Running tenant attack penetration test..."
npx tsx scripts/tenant-attack.ts
echo ""

echo "=== All security checks passed ==="
