/**
 * FABXTension - Core Content Script Module
 */
const FABXTension = {
    // Configuración y estados globales del script
    config: {
		debug: true,
        foroDomain: "armasblancas.mforos.com"
    },

    /**
     * Punto de entrada principal
     */
	init: function() {
        const hrf = window.location.href;
        
        // Filtro de seguridad: si no estamos en el subdominio del FAB, abortar inmediatamente
        if (!hrf.includes(this.config.foroDomain)) return;
        
        this.log("Inicializando módulos activos...");
        
        // 1. Enrutador de URLs (Switch modular)
        this.router(hrf);
        
        // 2. Inicializar detector de imágenes sin enlace
        this.initImageInteractivity();
    },
    
    /**
     * Enrutador de URL modular
     * Permite añadir sub-módulos fácilmente sin alterar el flujo principal
     */
	router: function(url) {
        if (url.includes('/new-messages/')) {
            this.modules.newMessages(url);
        } 
        else if (url.includes('/post.php?')) {
            this.modules.postEditor(url);
        }
    },
    
    /**
     * Contenedor de submódulos específicos del foro
     */
	modules: {
        newMessages: function(url) { console.log("[FAB] Módulo: Nuevos Mensajes"); },
        
        postEditor: function(url) { 
            console.log("[FAB] Módulo: Editor de Posts (TinyMCE) dinámico"); 

            // 1. Buscamos el iframe con nuestro vigilante
            const buscarIframe = setInterval(() => {
                const iframe = document.getElementById('tinyMCE_texto_ifr');
                
                if (iframe) {
                    clearInterval(buscarIframe);

                    // 2. Preguntamos al almacenamiento local qué tema se está usando ahora mismo
                    chrome.storage.local.get({ temaActivo: "defecto" }, (data) => {
                        const tema = data.temaActivo;
                        if (tema === "defecto") return; // Si es el de serie, no tocamos nada

                        // 3. Si ya está cargado el iframe, disparamos; si no, esperamos a que cargue
                        const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                        if (docInterno && docInterno.body && docInterno.readyState === 'complete') {
                            this.vincularCSSAlEditor(iframe, tema);
                        } else {
                            iframe.addEventListener('load', () => {
                                this.vincularCSSAlEditor(iframe, tema);
                            });
                        }
                    });
                }
            }, 100);
            
			// NUEVO: Vigilante para la Barra de Herramientas 3 (Emoticonos)
            const buscarToolbar = setInterval(() => {
                // Buscamos la fila del cuerpo de la tabla de la toolbar 3
                const mceToolbarRow = document.querySelector('#tinyMCE_texto_toolbar3 tbody tr');
                
                if (mceToolbarRow) {
                    clearInterval(buscarToolbar);
                    this.prepararKitEmoticonos(mceToolbarRow);
                }
            }, 100);
        },

        /**
         * Lee el JSON e inyecta el botón personalizado en la barra de herramientas
         */
        prepararKitEmoticonos: function(toolbarRow) {
			// ESCUDO ANTIDUPLICADO: Si el botón ya existe en la barra, salimos corriendo
            if (document.getElementById('fab_custom_emojis_btn')) {
                return;
            }
            console.log("[FAB] Fila de herramientas 3 detectada. Acoplando botón de emojis...");

            // 1. Creamos la celda <td> siguiendo la estructura exacta de TinyMCE
            const nuevaCelda = document.createElement('td');
            nuevaCelda.style.position = 'relative';

            // 2. Creamos el botón (usamos un emoji de nativo como icono 16x16 provisional)
            const boton = document.createElement('a');
            boton.role = 'button';
            boton.id = 'fab_custom_emojis_btn';
            boton.href = 'javascript:;';
            boton.className = 'mceButton mceButtonEnabled fab-mce-button';
            boton.title = 'Insertar Emoticonos del Kit Extendido';
            boton.style.display = 'flex';
            boton.style.alignItems = 'center';
            boton.style.justifyContent = 'center';
            boton.style.fontSize = '14px';
            boton.textContent = '😎'; // Icono provisional visual de 16x16 aprox.

            nuevaCelda.appendChild(boton);
            toolbarRow.appendChild(nuevaCelda); // Lo enganchamos al final de la fila 3

            // 3. Cargamos el archivo JSON de forma asíncrona desde nuestra carpeta res/
            const jsonURL = chrome.runtime.getURL('res/emojis.json');
            fetch(jsonURL)
                .then(response => response.json())
                .then(emojisData => {
                    // Creamos el panel oculto asociado a este botón
                    const popup = this.crearPanelEmojis(emojisData, boton);
                    document.body.appendChild(popup);

                    // Evento para abrir/cerrar el panel
                    boton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const estaAbierto = popup.style.display === 'grid';
                        
                        // Cerramos todos los paneles antes de actuar
                        document.querySelectorAll('.fab-emoji-popup').forEach(p => p.style.display = 'none');
                        
                        if (!estaAbierto) {
                            // Calculamos la posición del botón en la pantalla para flotar justo debajo
                            const rect = boton.getBoundingClientRect();
                            popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
                            popup.style.left = `${rect.left + window.scrollX}px`;
                            popup.style.display = 'grid';
                        }
                    });
                })
                .catch(err => console.error("[FAB Error] No se pudo leer res/emojis.json:", err));

            // Cerrar el panel flotante si se hace clic en cualquier otra parte de la pantalla
            document.addEventListener('click', () => {
                document.querySelectorAll('.fab-emoji-popup').forEach(p => p.style.display = 'none');
            });
        },

        /**
         * Construye el elemento HTML del panel flotante con la lista de emojis
         */
        crearPanelEmojis: function(emojis, botonOrigen) {
            const popup = document.createElement('div');
            popup.className = 'fab-emoji-popup';
            popup.style.display = 'none';

            // Evitamos que hacer clic dentro del panel lo cierre solo
            popup.addEventListener('click', (e) => e.stopPropagation());

            // Recorremos el JSON que editaste para pintar las casillas
            emojis.forEach(emoji => {
                const item = document.createElement('div');
                item.className = 'fab-emoji-item';
                item.title = emoji.alt;

                const img = document.createElement('img');
                img.src = emoji.url;
                img.alt = emoji.alt;

                item.appendChild(img);
                popup.appendChild(item);

                // ACCIÓN CRUCIAL: Al clickar el emoji, lo inyectamos en TinyMCE
                item.addEventListener('click', () => {
                    this.inyectarEmojiEnEditor(emoji);
                    popup.style.display = 'none'; // Cerramos el panel tras insertar
                });
            });

            return popup;
        },

        /**
         * Usa la API nativa de TinyMCE que miarroba tiene expuesta globalmente
         * para clavar el HTML exacto de la imagen donde apunte el cursor.
         */
		/**
         * Burla el aislamiento de Chrome inyectando un script directamente en la página real
         */
         
		/**
         * Inyecta el emoji de forma directa en el HTML del iframe usando comandos nativos del navegador
         */
        inyectarEmojiEnEditor: function(emoji) {
            try {
                // 1. Buscamos el iframe de Miarroba
                const iframe = document.getElementById('tinyMCE_texto_ifr');
                if (!iframe) {
                    console.error("[FAB Error] No se encontró el iframe del editor.");
                    return;
                }

                // 2. Accedemos al documento interno del iframe
                const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                
                // 3. Forzamos el foco dentro del cuadro de texto para que sepa dónde meterlo
                const bodyInterno = docInterno.getElementById('tinymce');
                if (bodyInterno) {
                    bodyInterno.focus();
                }

                // 4. Generamos el HTML exacto de la imagen
                const htmlEmoticono = `<img class="caretoMia" style="border: 0px; width: ${emoji.w}px; height: ${emoji.h}px;" src="${emoji.url}" alt="${emoji.alt}" />`;

                // 5. Usamos el comando de inserción nativo de Chrome sobre el documento del iframe
                // Esto no usa la API de TinyMCE, usa el motor del propio navegador. ¡Inmune a bloqueos!
                docInterno.execCommand('insertHTML', false, htmlEmoticono);
                
                console.log(`[FAB] Emoticono ${emoji.alt} estampado directamente en el iframe.`);

            } catch (err) {
                console.error("[FAB Error] Fallo al insertar emoji en el iframe:", err);
            }
        },
                
        /**
         * Inyecta un <link> físico dentro del iframe apuntando al CSS del tema actual
         */
        vincularCSSAlEditor: function(iframe, nombreTema) {
            try {
                const docInterno = iframe.contentDocument || iframe.contentWindow.document;
                
                // Evitamos duplicar la etiqueta si ya la habíamos metido
                if (docInterno.getElementById('fab-css-iframe-tema')) return;

                // 1. Generamos la URL real y absoluta de tu archivo (ej: themes/blanco.css)
                const cssURL = chrome.runtime.getURL(`themes/${nombreTema}.css`);

                // 2. Creamos la etiqueta <link> clásica de HTML
                const link = docInterno.createElement("link");
                link.rel = "stylesheet";
                link.type = "text/css";
                link.href = cssURL;
                link.id = "fab-css-iframe-tema";

                // 3. La clavamos en el <head> del iframe
                (docInterno.head || docInterno.documentElement).appendChild(link);
                console.log(`[FAB] Hoja de estilos "${nombreTema}.css" vinculada con éxito dentro del editor.`);

            } catch (error) {
                console.error("[FAB Error] Fallo al vincular CSS en el iframe:", error);
            }
        }
    },
     
	/**
     * Interactividad blindada mediante una máscara de control estática
     */
	initImageInteractivity: function() {
        this.log("Iniciando escucha mediante máscara estática...");

        document.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;

            // NUEVO FILTRO: Si el clic ocurre dentro de nuestro panel de emojis, NO HACEMOS ZOOM
            if (e.target.closest('.fab-emoji-popup')) {
                this.log("Clic en emoji del panel detectado. Ignorando módulo de zoom.");
                return; 
            }

            const mascara = e.target.closest('.fab-img-mask');
            const img = e.target.closest('img');

            if ((!img && !mascara) || (img && img.closest('a'))) return;

            e.preventDefault();
            e.stopPropagation();

            if (mascara && mascara.dataset.zoomActivo === "true") {
                this.resetZoom(mascara);
                return;
            }

            if (img && !img.classList.contains('fab-img-target')) {
                this.toggleZoom(img, e);
            }
        }, true);
    },
    
    /**
     * Enuelve la imagen y aplica la ampliación sin mover la zona de clic
     */
    toggleZoom: function(img, event) {
        const naturalWidth = img.naturalWidth;
        const currentWidth = img.clientWidth;

        if (naturalWidth <= currentWidth) return; // Ya está a tamaño real

        const scaleFactor = naturalWidth / currentWidth;

        // Coordenadas del cursor para el punto de origen
        const rect = img.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const originX = (clickX / rect.width) * 100;
        const originY = (clickY / rect.height) * 100;

        // 1. Creamos el contenedor principal (Base fija en el post)
        const wrapper = document.createElement('div');
        wrapper.classList.add('fab-img-wrapper');
        
        // 2. Creamos la Máscara de Control (El botón invisible que nunca se mueve)
        const mascara = document.createElement('div');
        mascara.classList.add('fab-img-mask');
        
		// Estilos de la base fija (El marco del cuadro que recorta el desborde)
        Object.assign(wrapper.style, {
            display: window.getComputedStyle(img).display === 'block' ? 'block' : 'inline-block',
            width: img.offsetWidth + 'px',
            height: img.offsetHeight + 'px',
            position: 'relative',
            overflow: 'hidden', // <-- ¡EL TRUCO CRUCIAL! Esto hace de guillotina para el zoom
            margin: window.getComputedStyle(img).margin,
            float: window.getComputedStyle(img).float,
            verticalAlign: window.getComputedStyle(img).verticalAlign || 'middle',
            zIndex: '99999' // Elevamos el marco para que no lo tapen otros elementos del foro al ampliar por dentro
        });
        
        // Estilos de la Máscara Invisible Superior (Donde daremos los clics)
        Object.assign(mascara.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '100000', // Por encima de todo para recibir los clics
            cursor: 'zoom-out',
            backgroundColor: 'transparent' // Totalmente invisible
        });

        // Modificamos el árbol HTML: metemos el wrapper antes de la imagen
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        wrapper.appendChild(mascara); // Metemos el botón invisible encima

        // Estilos de la imagen para que responda a la transformación por hardware
        img.classList.add('fab-img-target');
        Object.assign(img.style, {
            width: '100%',
            height: '100%',
            display: 'block',
            margin: '0',
            transition: 'transform 0.25s ease-out',
            transformOrigin: `${originX}% ${originY}%`,
            position: 'relative',
            zIndex: '99999', // Justo debajo de la máscara
            pointerEvents: 'none' // La imagen real se vuelve fantasma
        });

        // Guardamos el enlace en la máscara para poder encoger la imagen luego
        mascara.imagenAsociada = img;
        mascara.dataset.zoomActivo = "true";

        // ¡ Lanzamos el zoom exclusivamente sobre el nodo de la imagen !
        img.style.transform = `scale(${scaleFactor})`;
        this.log("Zoom aplicado.");
    },

    /**
     * Devuelve la imagen interna a su escala normal
     */
    resetZoom: function(mascara) {
        const img = mascara.imagenAsociada;
        if (!img) return;

        img.style.transform = 'scale(1)';
        mascara.dataset.zoomActivo = "false";
        mascara.style.cursor = 'zoom-in';
        this.log("Zoom retirado.");
        
        // Destruimos la estructura para dejar el HTML del foro limpio como al principio
        setTimeout(() => {
            if (mascara.dataset.zoomActivo !== "true" && img.parentNode) {
                const wrapper = img.parentNode;
                img.classList.remove('fab-img-target');
                img.style.transform = '';
                img.style.transformOrigin = '';
                img.style.zIndex = '';
                img.style.pointerEvents = '';
                
                // Devolvemos la imagen a su sitio original en el foro y borramos los divs
                wrapper.parentNode.insertBefore(img, wrapper);
                wrapper.remove();
            }
        }, 250); // Esperamos a que acabe la animación visual para limpiar el DOM
    },
            
    /**
     * Canal de escucha para acciones procedentes de las opciones del menú contextual (events.js)
     */
    initExtensionListener: function() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.log("Mensaje recibido desde el background script:", message);
            
            // Aquí puedes mapear futuras funciones que lances desde el menú de la extensión
            if (message.action === "ejecutar_funcion_dummy") {
                // Tu código aquí...
            }
        });
    },

    /**
     * Helper de logs controlado
     */
    log: function(...args) {
        if (this.config.debug) {
            console.log("%c[FABXTension]", "color: #ff9900; font-weight: bold;", ...args);
        }
    }
};

// Ejecución segura respetando el ciclo de vida manifest_start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FABXTension.init());
} else {
    FABXTension.init();
}