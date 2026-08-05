import requests
import time
import keyboard
import pyttsx3
from datetime import datetime

# Endpoints oficiales de Screenpipe y tu LLM local/gateway
SCREENPIPE_API = "http://localhost:3030/search"
OPENCLAW_GATEWAY = "http://localhost:18789/v1/chat/completions"

# Configuración del motor de voz nativo de Windows (SAPI5)
engine = pyttsx3.init()
voices = engine.getProperty('voices')
for voice in voices:
    if "spanish" in voice.name.lower() or "es-es" in voice.id.lower() or "es-mx" in voice.id.lower():
        engine.setProperty('voice', voice.id)
        break
engine.setProperty('rate', 165)

def log(tag, mensaje, tipo="INFO"):
    """Función para imprimir logs estructurados en la consola"""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    prefix = f"[{timestamp}] [{tag}]"
    if tipo == "INFO":
        print(f"\033[94m{prefix} {mensaje}\033[0m")
    elif tipo == "SUCCESS":
        print(f"\033[92m{prefix} {mensaje}\033[0m")
    elif tipo == "WARN":
        print(f"\033[93m{prefix} {mensaje}\033[0m")
    elif tipo == "ERROR":
        print(f"\033[91m{prefix} {mensaje}\033[0m")

def hablar(texto):
    log("SINTETIZADOR", "Reproduciendo respuesta por altavoces...", "INFO")
    engine.say(texto)
    engine.runAndWait()

def ejecutar_puente_por_tecla():
    print("\n" + "="*60)
    print("🤖 AGENTE MULTIMODAL CON LOGS ACTIVOS")
    print("👉 MANTÉN PRESIONADA LA 'BARRA ESPACIADORA' PARA HABLAR.")
    print("="*60 + "\n")
    
    while True:
        try:
            if keyboard.is_pressed('space'):
                log("TECLADO", "Barra espaciadora detectada. Activando modo escucha.", "SUCCESS")
                print("🎙️ Habla ahora...")
                
                # Bucle de espera mientras mantienes presionada la tecla
                while keyboard.is_pressed('space'):
                    time.sleep(0.05)
                
                log("TECLADO", "Tecla liberada. Iniciando procesamiento...", "INFO")
                
                # 1. LLAMADA AL AGENTE DE AUDIO (Screenpipe STT)
                transcription = ""
                intentos = 0
                while intentos < 3 and not transcription:
                    log("AGENTE_AUDIO", "Consultando última transcripción en Screenpipe...", "INFO")
                    
                    audio_params = {"content_type": "audio", "limit": 1}
                    audio_response = requests.get(SCREENPIPE_API, params=audio_params, timeout=3).json()
                    
                    if audio_response and "data" in audio_response and len(audio_response["data"]) > 0:
                        item = audio_response["data"][0]
                        if "content" in item and "transcription" in item["content"]:
                            transcription = item["content"]["transcription"]
                        elif "transcription" in item:
                            transcription = item["transcription"]
                    
                    if not transcription:
                        log("AGENTE_AUDIO", "Aún procesando audio... reintentando en 1s.", "WARN")
                        time.sleep(1)
                        intentos += 1
                
                if not transcription:
                    log("AGENTE_AUDIO", "No se detectó voz clara. Abortando ciclo.", "WARN")
                    continue
                    
                log("AGENTE_AUDIO", f"Texto detectado: '{transcription}'", "SUCCESS")
                
                # 2. LLAMADA AL AGENTE DE VISIÓN (Screenpipe OCR)
                log("AGENTE_VISION", "Capturando contexto OCR instantáneo de la pantalla...", "INFO")
                
                vision_params = {"content_type": "ocr", "limit": 1}
                vision_response = requests.get(SCREENPIPE_API, params=vision_params, timeout=3).json()
                
                screen_text = ""
                if vision_response and "data" in vision_response and len(vision_response["data"]) > 0:
                    item = vision_response["data"][0]
                    if "content" in item and "text" in item["content"]:
                        screen_text = item["content"]["text"]
                    elif "text" in item:
                        screen_text = item["text"]
                        
                if screen_text:
                    log("AGENTE_VISION", f"Se extrajeron {len(screen_text)} caracteres de texto de la pantalla.", "SUCCESS")
                else:
                    log("AGENTE_VISION", "No se detectó texto legible en la pantalla actual.", "WARN")
                
                # 3. LLAMADA AL CEREBRO CENTRAL (OpenClaw / LLM)
                log("CEREBRO_LOGIC", "Empaquetando datos y enviando prompt a la IA...", "INFO")
                
                system_prompt = (
                    "Eres un asistente IA de escritorio experto y analítico. "
                    "Tienes acceso a lo que el usuario está viendo en pantalla mediante este texto OCR:\n"
                    f"--- INICIO PANTALLA ---\n{screen_text}\n--- FIN PANTALLA ---\n\n"
                    "Tu objetivo es responder a la petición de voz del usuario analizando la pantalla. "
                    "Si el usuario pide datos objetivos, contrástalos con tus conocimientos actualizados "
                    "y corrige cualquier información errónea. Responde de forma directa, natural y concisa (máximo 2 o 3 frases) "
                    "ya que tu respuesta será leída por un sintetizador de voz."
                )
                
                # 🔥 AQUÍ ESTÁ LA CORRECCIÓN CRÍTICA: Se añade el modelo que OpenClaw requiere obligatoriamente
                payload = {
                    "model": "openrouter/openrouter/free",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": transcription}
                    ],
                    "stream": False
                }
                
                headers = {"Authorization": "Bearer local-token"}
                t_inicio = time.time()
                claw_response = requests.post(OPENCLAW_GATEWAY, json=payload, headers=headers, timeout=15)
                
                # 4. PROCESAMIENTO DE RESPUESTA FINAL
                if claw_response.status_code == 200:
                    log("CEREBRO_LOGIC", f"LLM respondió con éxito en {(time.time() - t_inicio):.2f}s", "SUCCESS")
                    reply = claw_response.json()['choices'][0]['message']['content'] 
                    print(f"\n🤖 [Cerebro IA]: {reply}\n")
                    hablar(reply)
                else:
                    log("CEREBRO_LOGIC", f"Fallo en el LLM: Status {claw_response.status_code} - {claw_response.text}", "ERROR")
                    
        except requests.exceptions.Timeout:
            log("SISTEMA", "Tiempo de espera agotado al conectar con las APIs.", "ERROR")
        except Exception as e:
            log("SISTEMA", f"Error inesperado en el bucle: {str(e)}", "ERROR")
            
        time.sleep(0.05)

if __name__ == "__main__":
    ejecutar_puente_por_tecla()