"""
Traductor por voz Español -> Inglés
------------------------------------
Servidor Flask que expone dos endpoints, cada uno apoyado en una API externa:
  - /api/traducir : recibe texto en español y devuelve la traducción al inglés,
                     pidiéndosela a la API gratuita de MyMemory Translation.
  - /api/hablar    : recibe texto en inglés y devuelve un audio con voz
                     masculina neuronal, generado por la API de edge-tts.

El micrófono y el reconocimiento de voz en español ocurren en el navegador
(Web Speech API), en estaticos/js/script.js. Este servidor no graba audio ni
carga ningún modelo de IA en memoria: solo reenvía el texto a esas dos APIs
y entrega la respuesta. (Antes la traducción corría con un modelo local,
pero eso hacía que el servidor se quedara sin memoria en Render y en Railway,
así que se volvió a una API para que el proyecto sea liviano en cualquier
plataforma gratuita.)
"""

import asyncio
import html
import os
import tempfile
import threading
import time

import edge_tts
import requests
from flask import Flask, jsonify, render_template, request, send_file

app = Flask(__name__, template_folder="plantillas", static_folder="estaticos")
app.config["TEMPLATES_AUTO_RELOAD"] = True  # para que index.html se recargue sin reiniciar el servidor

URL_API_TRADUCCION = "https://api.mymemory.translated.net/get"

# El motor de voz no es seguro para usarse desde varios hilos a la vez.
candado_voz = threading.Lock()

VOZ_MASCULINA = "en-US-GuyNeural"  # voz neuronal gratuita de edge-tts


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/traducir", methods=["POST"])
def traducir():
    datos = request.get_json(force=True, silent=True) or {}
    texto = (datos.get("texto") or "").strip()
    if not texto:
        return jsonify({"error": "El texto está vacío."}), 400

    # La IP compartida de un plan gratis de hosting a veces topa el límite de
    # uso anónimo de MyMemory (error 429). Muchas veces es pasajero, así que
    # antes de rendirse se reintenta un par de veces con una pequeña espera.
    ultimo_error = None
    for intento in range(3):
        try:
            respuesta = requests.get(
                URL_API_TRADUCCION,
                # El parámetro "de" (un contacto, no hace falta que sea real)
                # le sube el límite diario gratis a MyMemory.
                params={"q": texto, "langpair": "es|en", "de": "traductor-voz@example.com"},
                timeout=10,
            )
            respuesta.raise_for_status()
            datos_api = respuesta.json()

            estado = datos_api.get("responseStatus")
            if estado not in (200, "200"):
                raise ValueError(datos_api.get("responseDetails", "respuesta inesperada de la API"))

            # MyMemory junta traducciones hechas por usuarios, así que a veces
            # vienen con código HTML sin limpiar (por ejemplo "&#10;" en vez
            # de un salto de línea real) o con saltos de línea/espacios de
            # más. html.unescape() lo pasa a texto normal, y split()+join()
            # lo deja todo en una sola línea.
            traduccion_bruta = html.unescape(datos_api["responseData"]["translatedText"])
            traduccion = " ".join(traduccion_bruta.split())
            return jsonify({"espanol": texto, "ingles": traduccion})
        except (requests.RequestException, KeyError, ValueError) as error:
            ultimo_error = error
            es_limite = isinstance(error, requests.HTTPError) and error.response is not None and error.response.status_code == 429
            if es_limite and intento < 2:
                time.sleep(1.5 * (intento + 1))
                continue
            break

    return jsonify({"error": f"No se pudo traducir el texto: {ultimo_error}"}), 502


# Genera el audio en inglés (voz masculina) y lo entrega al navegador.
@app.route("/api/hablar", methods=["POST"])
def hablar():
    datos = request.get_json(force=True, silent=True) or {}
    texto = (datos.get("texto") or "").strip()
    if not texto:
        return jsonify({"error": "El texto está vacío."}), 400

    descriptor, ruta_audio = tempfile.mkstemp(suffix=".mp3", prefix="voz_ingles_")
    os.close(descriptor)

    with candado_voz:
        try:
            asyncio.run(edge_tts.Communicate(texto, voice=VOZ_MASCULINA).save(ruta_audio))
        except Exception as error:
            os.remove(ruta_audio)
            return jsonify({"error": f"No se pudo generar el audio: {error}"}), 502

    respuesta = send_file(ruta_audio, mimetype="audio/mpeg")

    def borrar_temporal():
        try:
            os.remove(ruta_audio)
        except OSError:
            pass

    respuesta.call_on_close(borrar_temporal)
    return respuesta


if __name__ == "__main__":
    # Railway (y la mayoría de plataformas en la nube) asignan el puerto por
    # la variable de entorno PORT y hay que escuchar en 0.0.0.0, no en
    # 127.0.0.1. En tu computadora, sin esa variable, sigue usando el 5000.
    puerto = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=puerto, debug=False)
