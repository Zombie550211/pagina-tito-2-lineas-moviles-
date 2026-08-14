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
| Certificado ACM | `arn:aws:acm:us-east-1:964060772387:certificate/b8b0def4-952c-4993-bf01-2914c2eece74` |
| Distribución CloudFront | *pendiente: necesita el certificado validado* |

Cuenta AWS: `964060772387`.

## Paso pendiente: cambiar los nameservers en Hostinger

El dominio está registrado en Hostinger y su DNS todavía apunta a la página
de parking. Hay que cambiarlo en el panel de Hostinger, en la sección de
DNS / Nameservers del dominio, y poner estos cuatro:

```
ns-604.awsdns-11.net
ns-2040.awsdns-63.co.uk
ns-99.awsdns-12.com
ns-1382.awsdns-44.org
```

Hasta que ese cambio se propague (de unos minutos a 48 horas, normalmente
menos de 2), el certificado no se puede validar y CloudFront no se puede
crear. Para comprobar cómo va:

```bash
dig +short offers-mobile.com NS                  # deben salir los de AWS
aws acm describe-certificate --region us-east-1 \
  --certificate-arn arn:aws:acm:us-east-1:964060772387:certificate/b8b0def4-952c-4993-bf01-2914c2eece74 \
  --query 'Certificate.Status' --output text     # debe decir ISSUED
```

Los registros que validan el certificado ya están puestos en la zona de
Route 53; en cuanto el dominio apunte allí, ACM lo detecta solo.

### Por qué hay que mover el DNS

El dominio raíz (`offers-mobile.com`, sin `www`) no puede apuntar a
CloudFront con un CNAME: el estándar de DNS no lo permite en la raíz de un
dominio. Route 53 lo resuelve con un registro *A alias*, que es una
extensión propia de AWS. Hostinger no ofrece equivalente.

## Cuando el certificado esté validado

Falta crear la distribución de CloudFront con estos valores (los mismos que
`speed-internet.com`, que ya funciona):

| Campo | Valor |
|---|---|
| Origin | `offers-mobile-com-site.s3.us-east-1.amazonaws.com` |
| Origin access | Origin access control (OAC) |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Default root object | `index.html` |
| Alternate domain names | `offers-mobile.com`, `www.offers-mobile.com` |
| Custom SSL certificate | el de la tabla de arriba |
| Compress objects automatically | sí |

Después, en Route 53, dos registros **A** con *Alias* activado (raíz y
`www`) apuntando a la distribución, y añadir la política del bucket que
autoriza a CloudFront a leerlo.

El **default root object** es lo que hace que `offers-mobile.com/` cargue la
portada. Las demás páginas (`/ayuda.html`...) funcionan sin configurar nada,
porque son archivos reales del bucket.

## Publicar cambios

```bash
export CLOUDFRONT_DISTRIBUTION_ID=E...   # cuando exista la distribución

./deploy.sh --dry-run    # ver qué se subiría, sin tocar nada
./deploy.sh              # publicar
```

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
- **El certificado sigue en `PENDING_VALIDATION`** → los nameservers todavía
  no apuntan a AWS, o no han propagado.
- **Una imagen se descarga en vez de mostrarse** → content-type equivocado;
  `deploy.sh` los fuerza correctamente.
