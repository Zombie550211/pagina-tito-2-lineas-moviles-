# Publicar en AWS (S3 + CloudFront)

El sitio es estático, así que no necesita servidor. Los archivos viven en un
bucket de S3 y CloudFront los reparte por HTTPS desde todo el mundo.

```
offers-mobile.com
      |
   Route 53          el DNS: traduce el dominio a una dirección
      |
  CloudFront         HTTPS + copias en caché por todo el mundo
      |
     S3              los archivos, en un bucket privado
```

## Credenciales

El perfil por defecto de la máquina es `crm-migration` y **no tiene permisos**
para desplegar. Hay que usar el perfil `connecting` (usuario
`connecting-deploy`), que es el que ya gestiona `speed-internet.com`.

```bash
export AWS_PROFILE=connecting
aws sts get-caller-identity      # debe decir .../connecting-deploy
```

`deploy.sh` ya selecciona ese perfil solo.

## Recursos creados

| Recurso | Valor |
|---|---|
| Bucket S3 | `offers-mobile-com-site` (us-east-1, privado) |
| Zona Route 53 | `Z04527081X56OCA8EQBVC` |
| Certificado ACM | `.../certificate/b8b0def4-952c-4993-bf01-2914c2eece74` (us-east-1) |
| OAC | `E2WKVUO4X1GT3W` (`offers-mobile-oac`) |
| Distribución CloudFront | `E7BU4L870R10F` → `d37f3uj2trofjp.cloudfront.net` |

Cuenta AWS: `964060772387`. Nameservers del dominio, ya puestos en Hostinger:

```
ns-604.awsdns-11.net      ns-99.awsdns-12.com
ns-2040.awsdns-63.co.uk   ns-1382.awsdns-44.org
```

### Cómo está montado

| Campo | Valor |
|---|---|
| Origin | `offers-mobile-com-site.s3.us-east-1.amazonaws.com` |
| Origin access | OAC (el bucket es privado; solo CloudFront puede leerlo) |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Default root object | `index.html` |
| Alternate domain names | `offers-mobile.com`, `www.offers-mobile.com` |
| Compresión | activada |
| Price class | `PriceClass_100` (EE.UU., Canadá y Europa) |
| Error 403 | devuelve `/index.html` con código 404 |

El **default root object** es lo que hace que `offers-mobile.com/` cargue la
portada. Las demás páginas (`/ayuda.html`...) funcionan sin configurar nada,
porque son archivos reales del bucket.

El DNS tuvo que moverse a Route 53 porque el dominio raíz (sin `www`) no
admite un CNAME hacia CloudFront: el estándar de DNS no lo permite en la
raíz. Route 53 lo resuelve con un registro *A alias*, propio de AWS.

## Publicar cambios

```bash
./deploy.sh --dry-run    # ver qué se subiría, sin tocar nada
./deploy.sh              # publicar
```

El script ya lleva dentro el perfil, el bucket y el ID de la distribución.

Conviene lanzar el `--dry-run` cuando haya dudas, porque el script borra del
bucket los archivos que ya no existen en la carpeta.

### Cómo se cachean los archivos

| Archivos | Caché | Por qué |
|---|---|---|
| HTML, robots.txt, sitemap.xml | revalidar siempre | un cambio de texto o precio se ve al instante |
| CSS y JS | revalidar siempre | no llevan hash en el nombre; si se cachearan, el diseño se rompería tras un cambio |
| Imágenes | 7 días | pesan más y cambian poco |

El script termina invalidando la caché de CloudFront (`/*`). Sin ese paso,
CloudFront seguiría sirviendo la versión anterior durante horas. AWS regala
1.000 invalidaciones al mes.

## Coste aproximado

Entre **1 y 3 USD al mes** para este tamaño (1 MB de archivos, tráfico bajo):
unos céntimos de S3, CloudFront casi cubierto por la capa gratuita el primer
año, y 0,50 USD fijos por la zona de Route 53. El certificado es gratis.

## Si algo falla

- **"Access Denied" al entrar en la web** → falta la política del bucket que
  autoriza a CloudFront (OAC), o el *default root object* no está puesto.
- **Los cambios no se ven** → no se invalidó la caché; revisa que
  `CLOUDFRONT_DISTRIBUTION_ID` esté exportado.
- **Una imagen se descarga en vez de mostrarse** → content-type equivocado;
  `deploy.sh` los fuerza correctamente.
- **El certificado caduca** → ACM lo renueva solo mientras el dominio siga
  apuntando a Route 53. Si algún día se mueve el DNS de vuelta a Hostinger,
  la renovación falla y el sitio deja de cargar por HTTPS.
