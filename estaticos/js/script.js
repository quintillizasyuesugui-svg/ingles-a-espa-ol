// Traductor por voz — lógica del navegador
//
// 1) Captura la voz en español con la Web Speech API (SpeechRecognition).
// 2) Cuando pasan 3 segundos sin que se detecte voz nueva, envía el texto
//    acumulado al servidor para traducirlo y para generar el audio en
//    inglés con voz masculina, y lo reproduce automáticamente.
// 3) También hay una entrada de texto manual, por si el navegador no
//    soporta reconocimiento de voz o el usuario prefiere escribir.

const MILISEGUNDOS_SILENCIO = 3000;
const URL_API_TRADUCCION = "https://api.mymemory.translated.net/get";

const botonMic = document.getElementById("boton-mic");
const estado = document.getElementById("estado");
const textoEspanol = document.getElementById("texto-espanol");
const textoIngles = document.getElementById("texto-ingles");
const mensajeError = document.getElementById("mensaje-error");
const formularioManual = document.getElementById("formulario-manual");
const entradaTexto = document.getElementById("entrada-texto");
const botonTraducir = document.getElementById("boton-traducir");
const barraProgreso = document.getElementById("barra-progreso");
const botonForzar = document.getElementById("boton-forzar");
const botonCopiarEs = document.getElementById("boton-copiar-es");
const botonCopiarEn = document.getElementById("boton-copiar-en");
const botonEscuchar = document.getElementById("boton-escuchar");

let escuchando = false;
let reconocimiento = null;
let temporizadorSilencio = null;
let transcripcionPendiente = "";
let procesando = false;

function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = false;
}

function ocultarError() {
  mensajeError.hidden = true;
}

function reiniciarAnimacion(elemento) {
  elemento.classList.remove("destello");
  void elemento.offsetWidth; // fuerza reflow para poder repetir la animación
  elemento.classList.add("destello");
}

function actualizarPanel(elemento, texto, textoVacio, botonCopiar) {
  const textoAnterior = elemento.textContent;
  const hayTexto = Boolean(texto && texto.trim());

  if (hayTexto) {
    elemento.textContent = texto;
    elemento.classList.remove("panel-texto-vacio");
  } else {
    elemento.textContent = textoVacio;
    elemento.classList.add("panel-texto-vacio");
  }

  if (elemento.textContent !== textoAnterior) {
    reiniciarAnimacion(elemento);
  }

  // Si el texto crece más que el bloque, mantenemos la vista en la última línea.
  elemento.scrollTop = elemento.scrollHeight;

  if (botonCopiar) {
    botonCopiar.disabled = !hayTexto;
  }
}

async function copiarTexto(elemento, boton) {
  if (elemento.classList.contains("panel-texto-vacio")) return;
  const texto = elemento.textContent;

  try {
    await navigator.clipboard.writeText(texto);
  } catch (error) {
    mostrarError("No se pudo copiar el texto al portapapeles.");
    return;
  }

  const etiquetaOriginal = boton.textContent;
  boton.textContent = "✓";
  boton.classList.add("copiado");
  setTimeout(() => {
    boton.textContent = etiquetaOriginal;
    boton.classList.remove("copiado");
  }, 1200);
}

function ponerEstado(texto) {
  if (estado.textContent === texto) return;
  estado.textContent = texto;
  reiniciarAnimacion(estado);
}

// MyMemory a veces devuelve código HTML sin limpiar (por ejemplo "&#10;" en
// vez de un salto de línea real). Esto lo pasa a texto normal usando el
// propio parser del navegador, y deja todo en una sola línea.
function limpiarTraduccion(texto) {
  const area = document.createElement("textarea");
  area.innerHTML = texto;
  return area.value.replace(/\s+/g, " ").trim();
}

// La traducción la pide el propio navegador directamente a la API de
// MyMemory (en vez de pasar por nuestro servidor). Así cada visitante usa
// su propia conexión a internet, y no comparte límite de uso con todos los
// demás proyectos que corren en el mismo servicio de hosting.
async function traducirTexto(texto, intento = 0) {
  const url = new URL(URL_API_TRADUCCION);
  url.searchParams.set("q", texto);
  url.searchParams.set("langpair", "es|en");
  url.searchParams.set("de", "traductor-voz@example.com");

  const respuesta = await fetch(url);

  if (!respuesta.ok) {
    if (respuesta.status === 429 && intento < 2) {
      await new Promise((resolver) => setTimeout(resolver, 1500 * (intento + 1)));
      return traducirTexto(texto, intento + 1);
    }
    throw new Error("No se pudo traducir el texto.");
  }

  const datos = await respuesta.json();
  if (datos.responseStatus !== 200 && datos.responseStatus !== "200") {
    throw new Error(datos.responseDetails || "La API de traducción no respondió bien.");
  }

  return limpiarTraduccion(datos.responseData.translatedText);
}

// pedirAudio() sigue llamando a nuestro propio servidor, porque generar la
// voz sí necesita correr en Python (con la librería edge-tts).
async function pedirAudio(texto) {
  const respuesta = await fetch("/api/hablar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });

  if (!respuesta.ok) {
    throw new Error("No se pudo generar el audio.");
  }

  return respuesta.blob();
}

function reproducirBloqueAudio(bloqueAudio) {
  const url = URL.createObjectURL(bloqueAudio);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => {
    URL.revokeObjectURL(url);
    ponerEstado(escuchando ? "Escuchando…" : "Toca el micrófono para hablar");
  });
  return audio.play();
}

// Flujo automático: al hablar por el micrófono, traduce y reproduce el audio
// seguido, sin que el usuario tenga que tocar ningún botón.
async function procesarFrase(textoEspanolFinal) {
  if (!textoEspanolFinal || !textoEspanolFinal.trim() || procesando) return;
  procesando = true;
  ocultarError();
  ponerEstado("Traduciendo…");
  botonTraducir.disabled = true;
  barraProgreso.hidden = false;

  try {
    const ingles = await traducirTexto(textoEspanolFinal);
    actualizarPanel(textoIngles, ingles, "Translation will appear here…", botonCopiarEn);
    botonEscuchar.disabled = false;

    ponerEstado("Generando audio…");
    const bloqueAudio = await pedirAudio(ingles);

    barraProgreso.hidden = true;
    ponerEstado("Reproduciendo…");
    await reproducirBloqueAudio(bloqueAudio);
  } catch (error) {
    mostrarError(error.message || "Ocurrió un error al procesar la frase.");
    ponerEstado(escuchando ? "Escuchando…" : "Toca el micrófono para hablar");
  } finally {
    procesando = false;
    botonTraducir.disabled = false;
    barraProgreso.hidden = true;
  }
}

function reiniciarTemporizadorSilencio() {
  if (temporizadorSilencio) clearTimeout(temporizadorSilencio);
  temporizadorSilencio = setTimeout(() => {
    const frase = transcripcionPendiente.trim();
    transcripcionPendiente = "";
    if (frase) {
      procesarFrase(frase);
    }
  }, MILISEGUNDOS_SILENCIO);
}

function crearReconocimiento() {
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reconocedor) return null;

  const r = new Reconocedor();
  r.lang = "es-ES";
  r.continuous = true;
  r.interimResults = true;

  r.onresult = (evento) => {
    let finalNuevo = "";
    let interino = "";

    for (let i = evento.resultIndex; i < evento.results.length; i++) {
      const resultado = evento.results[i];
      if (resultado.isFinal) {
        finalNuevo += resultado[0].transcript;
      } else {
        interino += resultado[0].transcript;
      }
    }

    if (finalNuevo) {
      transcripcionPendiente = (transcripcionPendiente + " " + finalNuevo).trim();
    }

    actualizarPanel(
      textoEspanol,
      (transcripcionPendiente + " " + interino).trim(),
      "Aquí aparecerá lo que digas…",
      botonCopiarEs
    );
    reiniciarTemporizadorSilencio();
  };

  r.onerror = (evento) => {
    if (evento.error === "no-speech") return;
    mostrarError("Error del reconocimiento de voz: " + evento.error);
  };

  r.onend = () => {
    // El navegador detiene el reconocimiento tras un rato; si el usuario
    // sigue con el micrófono activado, lo reiniciamos automáticamente.
    if (escuchando) {
      try {
        r.start();
      } catch (e) {
        /* ya estaba iniciado */
      }
    }
  };

  return r;
}

function activarMicrofono() {
  if (!reconocimiento) {
    reconocimiento = crearReconocimiento();
  }
  if (!reconocimiento) {
    mostrarError(
      "Este navegador no soporta reconocimiento de voz. Usa Google Chrome o escribe la frase abajo."
    );
    return;
  }

  ocultarError();
  escuchando = true;
  textoEspanol.classList.add("en-vivo");
  botonMic.setAttribute("aria-pressed", "true");
  ponerEstado("Escuchando…");
  try {
    reconocimiento.start();
  } catch (e) {
    /* ya estaba iniciado */
  }
}

function desactivarMicrofono() {
  escuchando = false;
  textoEspanol.classList.remove("en-vivo");
  botonMic.setAttribute("aria-pressed", "false");
  ponerEstado("Toca el micrófono para hablar");
  if (reconocimiento) {
    reconocimiento.stop();
  }
  if (temporizadorSilencio) clearTimeout(temporizadorSilencio);
}

botonMic.addEventListener("click", () => {
  if (escuchando) {
    desactivarMicrofono();
  } else {
    activarMicrofono();
  }
});

// Botón "Traducir": llama solo a la función/API de traducción y muestra el
// resultado. No reproduce audio por su cuenta.
formularioManual.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const texto = entradaTexto.value.trim();
  if (!texto || procesando) return;

  actualizarPanel(textoEspanol, texto, "Aquí aparecerá lo que digas…", botonCopiarEs);
  entradaTexto.value = "";

  procesando = true;
  ocultarError();
  ponerEstado("Traduciendo…");
  botonTraducir.disabled = true;
  botonEscuchar.disabled = true;

  try {
    const ingles = await traducirTexto(texto);
    actualizarPanel(textoIngles, ingles, "Translation will appear here…", botonCopiarEn);
    botonEscuchar.disabled = false;
    ponerEstado("Toca 🔊 Escuchar para oír la traducción");
  } catch (error) {
    mostrarError(error.message || "Ocurrió un error al traducir.");
    ponerEstado(escuchando ? "Escuchando…" : "Toca el micrófono para hablar");
  } finally {
    procesando = false;
    botonTraducir.disabled = false;
  }
});

// Botón "🔊 Escuchar": llama solo a la función/API de voz, con el texto en
// inglés que ya esté en pantalla (sin volver a traducir).
botonEscuchar.addEventListener("click", async () => {
  if (textoIngles.classList.contains("panel-texto-vacio") || procesando) return;

  const texto = textoIngles.textContent;

  procesando = true;
  ocultarError();
  ponerEstado("Generando audio…");
  botonEscuchar.disabled = true;

  try {
    const bloqueAudio = await pedirAudio(texto);
    ponerEstado("Reproduciendo…");
    await reproducirBloqueAudio(bloqueAudio);
  } catch (error) {
    mostrarError(error.message || "Ocurrió un error al generar el audio.");
    ponerEstado(escuchando ? "Escuchando…" : "Toca el micrófono para hablar");
  } finally {
    procesando = false;
    botonEscuchar.disabled = false;
  }
});

// Botón de respaldo: por si el temporizador de 3 segundos se traba o el
// reconocimiento de voz se queda esperando, esto fuerza la traducción de
// inmediato con lo último que se haya escuchado.
botonForzar.addEventListener("click", () => {
  if (temporizadorSilencio) clearTimeout(temporizadorSilencio);

  let frase = transcripcionPendiente.trim();
  if (!frase && !textoEspanol.classList.contains("panel-texto-vacio")) {
    frase = textoEspanol.textContent.trim();
  }
  transcripcionPendiente = "";

  if (!frase) {
    mostrarError("Todavía no hay ninguna frase en español para traducir.");
    return;
  }
  procesarFrase(frase);
});

botonCopiarEs.addEventListener("click", () => copiarTexto(textoEspanol, botonCopiarEs));
botonCopiarEn.addEventListener("click", () => copiarTexto(textoIngles, botonCopiarEn));
