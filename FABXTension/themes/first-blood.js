"use strict";

document.querySelectorAll('button.largeButton, a.largeButton').forEach(boton => {
    // no duplicar si la página se refresca
    if (boton.querySelector('.drop')) return;

    // Inyectar las 5 gotas de sangre
    for (let i = 0; i < 5; i++) {
        const drop = document.createElement('span');
        drop.className = 'drop';
        boton.appendChild(drop);
    }
});