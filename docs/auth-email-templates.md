# Plantillas de autenticación · Lucy B Nails

Aplicar desde Authentication > Email Templates del proyecto alojado. No contienen credenciales. Mantener el enlace dinámico de Supabase y confirmar Site URL y Redirect URLs.

## Confirm sign up

Asunto: Confirmá tu cuenta | Lucy B Nails

```html
<div style="background:#fffef6;padding:24px;font-family:Arial,sans-serif;color:#241c25">
  <div style="max-width:520px;margin:auto;background:white;border:1px solid #eadfe6;border-radius:18px;padding:28px">
    <p style="color:#94356e;font-size:13px;font-weight:bold;letter-spacing:2px">LUCY B NAILS</p>
    <h1 style="font-size:24px;margin:16px 0">¡Bienvenida a Lucy B Nails!</h1>
    <p style="line-height:1.6">Confirmá tu correo electrónico para activar tu cuenta y consultar tus turnos.</p>
    <p style="margin:26px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#f985d5;color:#241c25;padding:14px 20px;border-radius:10px;font-weight:bold;text-decoration:none">Confirmar mi cuenta</a></p>
    <p style="font-size:13px;color:#746773;line-height:1.5">Si no solicitaste esta cuenta, podés ignorar el mensaje.</p>
    <hr style="border:0;border-top:1px solid #eadfe6">
    <p style="font-size:12px;color:#746773">Lucy B Nails · Cosquín y Córdoba Capital</p>
  </div>
</div>
```

## Reset password

Asunto: Recuperá tu contraseña | Lucy B Nails

```html
<div style="background:#fffef6;padding:24px;font-family:Arial,sans-serif;color:#241c25">
  <div style="max-width:520px;margin:auto;background:white;border:1px solid #eadfe6;border-radius:18px;padding:28px">
    <p style="color:#94356e;font-size:13px;font-weight:bold;letter-spacing:2px">LUCY B NAILS</p>
    <h1 style="font-size:24px;margin:16px 0">Recuperá tu contraseña</h1>
    <p style="line-height:1.6">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Tocá el botón para elegir una nueva.</p>
    <p style="margin:26px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#f985d5;color:#241c25;padding:14px 20px;border-radius:10px;font-weight:bold;text-decoration:none">Cambiar contraseña</a></p>
    <p style="font-size:13px;color:#746773;line-height:1.5">Si no solicitaste el cambio, ignorá este mensaje. Tu contraseña seguirá siendo la misma.</p>
    <hr style="border:0;border-top:1px solid #eadfe6">
    <p style="font-size:12px;color:#746773">Lucy B Nails · Cosquín y Córdoba Capital</p>
  </div>
</div>
```

## Validación

Crear una cuenta de prueba propia, comprobar entrega, abrir confirmación, iniciar sesión, solicitar recuperación, abrir el enlace, cambiar contraseña y volver a ingresar. No usar la cuenta administradora para esta prueba. No desactivar la confirmación de correo.
