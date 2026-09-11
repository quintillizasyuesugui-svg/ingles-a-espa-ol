"""
Traductor por voz Español -> Inglés
------------------------------------
Servidor Flask que expone dos endpoints:
  - /api/traducir : recibe texto en español y devuelve la traducción al inglés
                     (modelo Helsinki-NLP/opus-mt-es-en, vía MarianMT). Corre
                     localmente en el servidor, sin ninguna API externa ni
                     depender de límites de uso de terceros.
  - /api/hablar    : recibe texto en inglés y devuelve un audio con voz
                     masculina neuronal, generado por la API de edge-tts.

El micrófono y el reconocimiento de voz en español ocurren en el navegador
(Web Speech API), en estaticos/js/script.js. Este servidor no graba audio:
solo traduce texto (localmente) y genera el audio de salida en inglés
(con la API de edge-tts).
"""

import asyncio
import os
import tempfile
import threading

import edge_tts
import torch
from flask import Flask, jsonify, render_template, request, send_file
from transformers import MarianMTModel, MarianTokenizer

app = Flask(__name__, template_folder="plantillas", static_folder="estaticos")
app.config["TEMPLATES_AUTO_RELOAD"] = True  # para que index.html se recargue sin reiniciar el servidor

NOMBRE_MODELO = "Helsinki-NLP/opus-mt-es-en"

print("Cargando modelo de traducción español -> inglés (solo la primera vez tarda más)...")
tokenizador = MarianTokenizer.from_pretrained(NOMBRE_MODELO)
modelo = MarianMTModel.from_pretrained(NOMBRE_MODELO)
modelo.eval()
# Cuantización dinámica: comprime los pesos de las capas más pesadas del
# modelo (de 32 a 8 bits) para que ocupe bastante menos memoria en el
# servidor. No cambia cómo se usa el modelo ni la calidad de la traducción
# de forma perceptible, solo lo hace más liviano para correr en CPU.
modelo = torch.quantization.quantize_dynamic(modelo, {torch.nn.Linear}, dtype=torch.qint8)
modelo.generation_config.max_length = None  # evita el aviso: max_new_tokens ya define el límite
print("Modelo de traducción listo.")

# El modelo de traducción y el motor de voz no son seguros para usarse desde
# varios hilos a la vez, así que cada uno tiene su propio candado.
candado_traduccion = threading.Lock()
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

    with candado_traduccion:
        entrada = tokenizador(texto, return_tensors="pt", truncation=True)
        salida = modelo.generate(
            **entrada,
            max_new_tokens=60,
            # Estos parámetros evitan que la traducción se trabe repitiendo
            # una palabra en frases poco comunes.
            num_beams=4,
            no_repeat_ngram_size=3,
            repetition_penalty=1.3,
            early_stopping=True,
        )
        traduccion = tokenizador.decode(salida[0], skip_special_tokens=True)

    return jsonify({"espanol": texto, "ingles": traduccion})


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
    # Render (y la mayoría de plataformas en la nube) asignan el puerto por
    # la variable de entorno PORT y hay que escuchar en 0.0.0.0, no en
    # 127.0.0.1. En tu computadora, sin esa variable, sigue usando el 5000.
    puerto = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=puerto, debug=False)
