# Traductor por voz: Español → Inglés

Página web que traduce lo que hablas en español al inglés y lo lee en voz alta con una voz masculina.

## Cómo funciona

1. Tocas el micrófono y hablas en español. El navegador (Web Speech API) va mostrando el texto en vivo.
2. A los 3 segundos de silencio, el texto se envía al servidor, que lo traduce con el modelo `Helsinki-NLP/opus-mt-es-en` (MarianMT).
3. La traducción se muestra en pantalla y se escucha automáticamente en inglés, con una voz masculina neuronal (edge-tts).
4. Si el reconocimiento de voz se traba, hay un botón manual **"🔁 Traducir ahora"** que fuerza la traducción de inmediato.

## Estructura del proyecto

```
app.py                     servidor Flask (traducción + audio)
requirements.txt           dependencias de Python
plantillas/index.html      página web
estaticos/css/estilos.css  estilos y animaciones
estaticos/js/script.js     micrófono, temporizador y reproducción
render.yaml                configuración para desplegar en Render
```

## Correrlo en tu computadora

Necesitas Python 3.11+.

```bash
pip install -r requirements.txt
python app.py
```

Abre `http://127.0.0.1:5000/` en Google Chrome o Microsoft Edge (el reconocimiento de voz del navegador no funciona en todos los navegadores, por ejemplo Firefox no lo soporta).

## Desplegarlo en Render

Este repositorio ya incluye `render.yaml`, así que Render puede configurar el servicio solo:

1. Entra a [render.com](https://render.com) y conecta tu cuenta de GitHub.
2. **New +** → **Blueprint** → elige este repositorio.
3. Render lee `render.yaml` y crea el servicio automáticamente (instala las dependencias y arranca con `gunicorn`).
4. Cuando termine el build, te da una URL pública en `https://tu-servicio.onrender.com`.

**Importante sobre el plan gratuito de Render:** este proyecto carga un modelo de traducción (PyTorch + Transformers) en memoria, lo que pesa más que una página web normal. El plan gratuito tiene poca RAM (512 MB) y puede quedarse sin memoria o tardar bastante en arrancar la primera vez. Si el despliegue falla o se cae, prueba con un plan de pago con más memoria (1–2 GB).

## Notas

- La voz en inglés usa el servicio gratuito de Microsoft Edge (edge-tts), que necesita internet.
- El servidor no graba ni guarda audio de tu voz: el reconocimiento en español ocurre en el navegador, y el audio de la traducción se genera al vuelo y se borra después de enviarlo.
