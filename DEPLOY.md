# Publicar en AWS (S3 + CloudFront)

El sitio es estático (solo HTML, CSS, JS e imágenes), así que no necesita
servidor. Los archivos viven en un bucket de S3 y CloudFront los reparte por
HTTPS desde servidores repartidos por el mundo.

```
offers-mobile.com
      |
   Route 53          el DNS: traduce el dominio a una dirección
      |
  CloudFront         HTTPS + copias en caché por todo el mundo
      |
     S3              los archivos, en un bucket privado
```

## Antes de empezar

Las credenciales que tienes configuradas ahora son del usuario
`crm-migration` y **no tienen permisos** sobre S3, CloudFront, Route 53 ni
ACM. Necesitas un usuario o rol con acceso a esos cuatro servicios:

```bash
aws sts get-caller-identity      # comprueba con qué usuario estás
aws configure --profile tito     # o configura uno nuevo
export AWS_PROFILE=tito
```

## Configuración inicial (una sola vez)

### 1. Crear el bucket

La región `us-east-2` (Ohio) es la que ya tienes configurada; sirve igual
porque quien atiende a los visitantes es CloudFront, no S3.

```bash
aws s3 mb s3://offers-mobile.com --region us-east-2
```

Déjalo **privado**, sin activar "static website hosting". CloudFront leerá
del bucket con un permiso propio (OAC), que es más seguro: nadie puede
saltarse CloudFront y entrar directo al bucket.

### 2. Certificado SSL

Tiene que estar en **us-east-1**, sí o sí. Es un requisito de CloudFront,
aunque tu bucket esté en Ohio.

```bash
aws acm request-certificate \
  --domain-name offers-mobile.com \
  --subject-alternative-names www.offers-mobile.com \
  --validation-method DNS \
  --region us-east-1
```

Para validarlo hay que añadir un registro CNAME al DNS. Si el dominio está
en Route 53, la consola de ACM tiene un botón "Create records in Route 53"
que lo hace solo. Si lo compraste en otro sitio (GoDaddy, Namecheap...),
copia el nombre y el valor que te da ACM y créalo a mano allí.

Tarda entre 5 minutos y unas horas en pasar a `ISSUED`.

### 3. Distribución de CloudFront

Desde la consola es más rápido que por CLI. Los valores que importan:

| Campo | Valor |
|---|---|
| Origin | el bucket `offers-mobile.com` |
| Origin access | Origin access control (OAC), y aplicar la política que sugiere |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Default root object | `index.html` |
| Alternate domain names | `offers-mobile.com` y `www.offers-mobile.com` |
| Custom SSL certificate | el del paso 2 |
| Compress objects automatically | sí |

El **default root object** es necesario para que `offers-mobile.com/` cargue
la portada. Las demás páginas (`/ayuda.html`, `/contacto.html`...) funcionan
sin configurar nada, porque son archivos reales dentro del bucket.

### 4. Apuntar el dominio

En Route 53, dentro de la zona de `offers-mobile.com`, crea dos registros
de tipo **A** con la opción *Alias* activada, apuntando a la distribución
de CloudFront:

- `offers-mobile.com`
- `www.offers-mobile.com`

Si el DNS está fuera de AWS, crea un CNAME de `www` hacia el dominio de
CloudFront (`d111111abcdef8.cloudfront.net`). Ojo: el dominio raíz sin
`www` no admite CNAME según el estándar de DNS; para eso hace falta
Route 53 o un proveedor con "ALIAS" o "ANAME".

## Publicar cambios

Una vez montado lo anterior:

```bash
export CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC   # el ID de tu distribución

./deploy.sh --dry-run    # ver qué se subiría, sin tocar nada
./deploy.sh              # publicar
```

Merece la pena lanzar siempre el `--dry-run` la primera vez, porque el
script borra del bucket los archivos que ya no existen en la carpeta.

### Cómo se cachean los archivos

| Archivos | Caché | Por qué |
|---|---|---|
| HTML, robots.txt, sitemap.xml | revalidar siempre | un cambio de texto o precio se ve al instante |
| CSS y JS | revalidar siempre | no llevan hash en el nombre; si se cachearan, el diseño se rompería tras un cambio |
| Imágenes | 7 días | pesan más y cambian poco |

El script termina invalidando la caché de CloudFront (`/*`), que es lo que
hace que los cambios se vean de verdad. Sin ese paso, CloudFront seguiría
sirviendo la versión anterior durante horas.

AWS regala 1.000 invalidaciones al mes; a partir de ahí cuestan unos
0,005 USD cada una.

## Coste aproximado

Para un sitio de este tamaño (1,1 MB de imágenes, tráfico bajo), entre
**1 y 3 USD al mes**: unos céntimos de S3, el primer año de CloudFront casi
cubierto por la capa gratuita, y 0,50 USD fijos por la zona de Route 53.
El certificado de ACM es gratis.

## Si algo falla

- **Sale "Access Denied" al entrar en la web** → falta la política del bucket
  que autoriza a CloudFront (OAC), o el *default root object* no está puesto.
- **Los cambios no se ven** → no se invalidó la caché; revisa que
  `CLOUDFRONT_DISTRIBUTION_ID` esté exportado.
- **El certificado no aparece al elegirlo en CloudFront** → se pidió en una
  región que no es us-east-1, o todavía no está en estado `ISSUED`.
- **Una imagen se descarga en vez de mostrarse** → se subió con el
  content-type equivocado; `./deploy.sh` los fuerza correctamente.
