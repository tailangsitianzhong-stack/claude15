#!/usr/bin/env bash
# 全コード（three 含む）を 1 つの HTML に埋め込んだ配布用ファイル dist-single/index.html を作る。
# どこにでも置くだけで遊べる（サーバー設定・相対パス・ビルド環境が要らない）。
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes esbuild@0.25.0 src/main.js --bundle --minify --format=iife --target=es2020 \
  --alias:three=./vendor/three.module.min.js --outfile=/tmp/game.js
mkdir -p dist-single
python3 - <<'PY'
js = open('/tmp/game.js').read().replace('</script', '<\\/script')
html = '''<!doctype html>
<html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>Block City Walk</title>
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: #87c5ff; overscroll-behavior: none; }
html, body, body * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none; }
canvas { display: block; }
</style></head><body><script>''' + js + '''</script></body></html>'''
open('dist-single/index.html', 'w').write(html)
PY
echo "dist-single/index.html を作った"
