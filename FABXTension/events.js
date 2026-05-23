"use strict";

const FORO_DOMAIN = "armasblancas.mforos.com";
const FORO_URL_PATTERNS = [
    "http://armasblancas.mforos.com/*",
    "https://armasblancas.mforos.com/*"
];

// 1. Crear el árbol de menús al instalar/actualizar la extensión
chrome.runtime.onInstalled.addListener(function() {
    // Recuperar el tema actual para marcar el "radio" correcto por defecto
    chrome.storage.local.get({ temaActivo: "defecto" }, function(data) {
        
        // Menú Raíz Padre
        chrome.contextMenus.create({
            id: "fab-raiz",
            title: "FAB",
            contexts: ["all"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });

        // Submenú: Tema
        chrome.contextMenus.create({
            id: "fab-sub-tema",
            parentId: "fab-raiz",
            title: "Tema",
            contexts: ["all"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });

        // Opción: Por defecto
        chrome.contextMenus.create({
            id: "tema-defecto",
            parentId: "fab-sub-tema",
            title: "Por defecto",
            type: "radio",
            checked: data.temaActivo === "defecto",
            contexts: ["all"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });

        // Opción: marfil
        chrome.contextMenus.create({
            id: "tema-marfil",
            parentId: "fab-sub-tema",
            title: "marfil",
            type: "radio",
            checked: data.temaActivo === "marfil",
            contexts: ["all"],
            documentUrlPatterns: FORO_URL_PATTERNS
        });
        
        // Aquí podrás añadir más temas en el futuro de forma modular:
        // Por ejemplo: id: "tema-oscuro", title: "Oscuro", etc.
    });
});

// 2. Gestionar la selección del usuario en el menú
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (!tab || !tab.id || !tab.url || !tab.url.includes(FORO_DOMAIN)) return;

    let nuevoTema = "defecto";
    if (info.menuItemId === "tema-marfil") nuevoTema = "marfil";
    // if (info.menuItemId === "tema-oscuro") nuevoTema = "oscuro";

    // Guardar la configuración de forma persistente
    chrome.storage.local.set({ temaActivo: nuevoTema }, function() {
        // Refrescar la pestaña actual para que aplique el cambio limpiamente
        chrome.tabs.reload(tab.id);
    });
});

// 3. Inyectar el CSS de forma proactiva al cargar la página
// Escuchamos cuando una pestaña cambia de estado (comienza a cargar el DOM)
// 3. Inyectar el CSS de forma proactiva al cargar la página
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === "loading" && tab.url && tab.url.includes(FORO_DOMAIN)) {
        
        chrome.storage.local.get({ temaActivo: "defecto" }, function(data) {
            if (data.temaActivo === "defecto") return;

            let cssFile = "";
            // IMPORTANTE: Aseguramos la barra diagonal '/' al inicio para que la ruta sea absoluta dentro del paquete
            if (data.temaActivo === "marfil") cssFile = "/themes/marfil.css";

            if (cssFile) {
                chrome.scripting.insertCSS({
                    target: { tabId: tabId, allFrames: true },
                    files: [cssFile]
                }).then(() => {
                    console.log(`[FAB] CSS ${cssFile} inyectado con éxito en pestaña ${tabId}`);
                }).catch(err => {
                    // Este error ahora saltará directo en la consola del Service Worker
                    console.error("[FAB] Error crítico inyectando CSS:", err);
                });
            }
        });
    }
});