# Traductor por voz: Español → Inglés

Página web que traduce lo que hablas en español al inglés y lo lee en voz alta con una voz masculina.

## Cómo funciona

1. Tocas el micrófono y hablas en español. El navegador (Web Speech API) va mostrando el texto en vivo.
2. A los 3 segundos de silencio, el texto se envía al servidor, que pide la traducción a la **API de MyMemory Translation**.
3. La traducción se muestra en pantalla y se escucha automáticamente en inglés, con una voz masculina neuronal generada por la **API de edge-tts**.
4. Si el reconocimiento de voz se traba, hay un botón manual **"🔁 Traducir ahora"** que fuerza la traducción de inmediato.

También hay dos botones independientes para probar cada función por separado:

- **Traducir** → llama solo a `/api/traducir` (API de MyMemory).
- **🔊 Escuchar** → llama solo a `/api/hablar` (API de edge-tts).

Junto al botón "🔊 Escuchar" hay un **interruptor 🔌 "API de voz"**:

- **Activado (por defecto):** al escuchar, sí se llama a la API de edge-tts y se reproduce el audio.
- **Desactivado:** no se llama a la API — ni el botón "Escuchar" ni el flujo automático del micrófono reproducen audio, y se avisa que la API está apagada.

Las dos funciones del servidor (`/api/traducir` y `/api/hablar`) son APIs propias que a su vez consumen APIs externas — no hay ningún modelo de IA cargado en el servidor, así que el proyecto es liviano y funciona bien en cualquier plan gratuito.

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
2. **New +** → **Blueprint** → elige este repositorio (tiene que ser "Blueprint", no "Web Service", para que Render lea `render.yaml`).
3. Render lee `render.yaml` y crea el servicio automáticamente (instala las dependencias y arranca con `gunicorn`).
4. Cuando termine el build, te da una URL pública en `https://tu-servicio.onrender.com`.

Como el servidor ya no carga ningún modelo de IA (solo llama a APIs externas), el proyecto es liviano y funciona bien en el plan gratuito.

## Notas

- La traducción usa la API gratuita de [MyMemory](https://mymemory.translated.net/) (sin necesidad de clave), que tiene un límite de uso diario razonable para un proyecto de clase.
- La voz en inglés usa el servicio gratuito de Microsoft Edge (edge-tts), que necesita internet.
- El servidor no graba ni guarda audio de tu voz: el reconocimiento en español ocurre en el navegador, y el audio de la traducción se genera al vuelo y se borra después de enviarlo.
