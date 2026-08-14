#!/usr/bin/env bash
#
# Publica el sitio en S3 y refresca la caché de CloudFront.
#
#   ./deploy.sh              publica de verdad
#   ./deploy.sh --dry-run    muestra qué haría, sin tocar nada
#
# Configuración (o edita los valores por defecto de abajo):
#   S3_BUCKET=offers-mobile.com CLOUDFRONT_DISTRIBUTION_ID=E123ABC ./deploy.sh
#
set -euo pipefail

BUCKET="${S3_BUCKET:-offers-mobile.com}"
DIST_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"

DRYRUN=()
if [[ "${1:-}" == "--dry-run" ]]; then
  DRYRUN=(--dryrun)
  echo "== SIMULACRO: no se sube ni se borra nada =="
fi

cd "$(dirname "$0")"

# Los archivos que forman el sitio. Todo lo demás (.git, .md, .sh, .vscode)
# se queda fuera del bucket.
SITIO=(--exclude "*"
       --include "*.html" --include "robots.txt" --include "sitemap.xml"
       --include "css/*" --include "js/*" --include "images/*")

echo "-> Bucket: s3://$BUCKET"

# 1. HTML y archivos de texto: el navegador revalida siempre, así un cambio
#    de precio o de texto se ve al instante.
aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "*.html" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, no-cache, must-revalidate"

aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "robots.txt" \
  --content-type "text/plain; charset=utf-8" \
  --cache-control "public, no-cache, must-revalidate"

aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "sitemap.xml" \
  --content-type "application/xml; charset=utf-8" \
  --cache-control "public, no-cache, must-revalidate"

# 2. CSS y JS: tampoco llevan hash en el nombre (styles.css, main.js), así que
#    si se cachearan mucho tiempo el diseño quedaría roto tras un cambio.
aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "css/*.css" \
  --content-type "text/css; charset=utf-8" \
  --cache-control "public, no-cache, must-revalidate"

aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "js/*.js" \
  --content-type "application/javascript; charset=utf-8" \
  --cache-control "public, no-cache, must-revalidate"

# 3. Imágenes: 7 días de caché. No van con hash en el nombre, por eso no se
#    usa el año entero que se suele recomendar.
aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "images/*.webp" \
  --content-type "image/webp" \
  --cache-control "public, max-age=604800"

aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" \
  --exclude "*" --include "images/*.jpg" \
  --content-type "image/jpeg" \
  --cache-control "public, max-age=604800"

# 4. Borra del bucket lo que ya no existe en la carpeta (por ejemplo los PNG
#    que se eliminaron). No sube nada: los pasos anteriores ya dejaron todo
#    sincronizado.
aws s3 sync . "s3://$BUCKET" "${DRYRUN[@]}" --delete "${SITIO[@]}"

# 5. CloudFront guarda copias en sus servidores de todo el mundo; hay que
#    avisarle de que hay versión nueva o seguiría sirviendo la vieja.
if [[ -n "$DIST_ID" ]]; then
  if [[ ${#DRYRUN[@]} -gt 0 ]]; then
    echo "(simulacro) invalidaria /* en la distribucion $DIST_ID"
  else
    echo "-> Refrescando CloudFront ($DIST_ID)"
    aws cloudfront create-invalidation \
      --distribution-id "$DIST_ID" --paths "/*" \
      --query 'Invalidation.[Id,Status]' --output text
    echo "   Tarda 1-2 minutos en aplicarse en todo el mundo."
  fi
else
  echo "!! CLOUDFRONT_DISTRIBUTION_ID no esta definido: no se refresco la cache."
  echo "   Los visitantes podrian seguir viendo la version anterior."
fi

echo "-> Listo. https://offers-mobile.com"
