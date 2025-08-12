document.addEventListener('DOMContentLoaded', () => {
    // === DEFINIÇÕES E TELAS ===
    const DEFINICOES_ANIMAIS = { rato: { nome: 'Rato', come: ['racao'], classeCss: 'rato' }, coelho: { nome: 'Coelho', come: ['grama'], classeCss: 'coelho' }};
    const DEFINICOES_COMIDAS = { racao: { nome: 'Ração', classeCss: 'racao' }, grama: { nome: 'Grama', classeCss: 'grama' }};
    const Telas = { menu: document.getElementById('main-menu-container'), setup: document.getElementById('setup-container'), game: document.getElementById('game-container'), mostrar: function(n) { this.menu.classList.add('hidden'); this.setup.classList.add('hidden'); this.game.classList.add('hidden'); this[n].classList.remove('hidden'); }};

    // === ELEMENTOS DO DOM ===
    const world = document.getElementById('world');
    const animalSelectionDiv = document.getElementById('animal-selection');
    // ... (vários outros elementos do DOM)
    
    // === VARIÁVEIS GLOBAIS ===
    let animais = [], comidas = [], aguas = [], obstaculos = [];
    let simulaçãoAtiva = false, tempo = 0, animalSendoArrastado = null, modoDeColocarPedra = false;
    const WORLD_WIDTH = 800, WORLD_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1;
    let dayNightTimer = 0, isNight = false, rainTimer = 0;

    // === LÓGICA DE CLASSES ===
    class Entidade { /* ... (sem alterações) ... */ }
    class Obstaculo extends Entidade { constructor(x, y) { super(x - 35, y - 35, 'pedra'); } }
    class Comida extends Entidade { /* ... (sem alterações) ... */ }
    class Agua extends Entidade {
        constructor() { super(null, null, 'bebedouro agua'); }
        refill() { this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); }
    }
    class Animal extends Entidade {
        constructor(tipo, x, y) {
            super(x, y, DEFINICOES_ANIMAIS[tipo].classeCss + ' animal filhote');
            // ... (propriedades do animal como tipo, fome, sede, etc.)
            this.movedSincePress = false; this.pressTimer = null;
            // Criação dos elementos da UI do animal
            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer);
            this.statusBubble = document.createElement('div'); this.statusBubble.className = 'status-bubble'; this.element.appendChild(this.statusBubble);
            // Eventos de Toque e Clique
            this.element.addEventListener('mousedown', (e) => this.handlePress(e));
            this.element.addEventListener('touchstart', (e) => this.handlePress(e), { passive: false });
        }
        handlePress(e) {
            if (modoDeColocarPedra) return; e.preventDefault();
            this.movedSincePress = false;
            this.pressTimer = setTimeout(() => { // Inicia o modo de arrastar após um pequeno delay
                if (!this.movedSincePress) { animalSendoArrastado = this; this.element.classList.add('dragging'); }
            }, 150);
        }
        handleRelease() {
            clearTimeout(this.pressTimer);
            if (!this.movedSincePress) { this.toggleStatusBubble(); }
        }
        toggleStatusBubble() { this.statusBubble.classList.toggle('visible'); }
        atualizar() {
            if (this.foiRemovido || animalSendoArrastado === this) return;
            // ... (lógica principal de atualização de fome, sede, idade, etc.)
            this.atualizarUI();
        }
        atualizarUI() {
            const bemEstar = 100 - Math.max(this.fome, this.sede);
            this.healthBarFill.style.width = `${bemEstar}%`;
            if(bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green';
            else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow';
            else this.healthBarFill.className = 'health-bar-fill health-red';
            this.statusBubble.textContent = this.getStatusText();
        }
        getStatusText() {
            let status = this.estado; let needs = [];
            if(this.fome > 70) needs.push('morrendo de fome'); else if (this.fome > 40) needs.push('com fome');
            if(this.sede > 70) needs.push('morrendo de sede'); else if (this.sede > 40) needs.push('com sede');
            return `${status}${needs.length > 0 ? ': ' + needs.join(' e ') : ''}`;
        }
        // ... (outros métodos do animal: decidirAcao, mover, interagir, etc. permanecem com a mesma lógica)
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1 * currentSpeedMultiplier;
        updateWorldState();
        [...animais].forEach(animal => animal.atualizar());
        world.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD);
        // ... (lógica de atualizar painel)
    }
    function updateWorldState() {
        dayNightTimer += (0.1 * currentSpeedMultiplier);
        // Ciclo Dia/Noite (a cada 60s de tempo de jogo)
        if (dayNightTimer > 60) { dayNightTimer = 0; isNight = !isNight; world.classList.toggle('world-night', isNight); }
        // Evento de Chuva (chance a cada tick)
        if (rainTimer > 0) { rainTimer -= 0.1; if (rainTimer <= 0) world.classList.remove('world-rain'); }
        if (Math.random() < 0.0005 * currentSpeedMultiplier) { triggerRain(); }
    }
    function triggerRain() {
        if (rainTimer > 0) return; // Não chove se já está chovendo
        rainTimer = 10 + Math.random() * 10; // Duração da chuva
        world.classList.add('world-rain');
        aguas.forEach(agua => agua.refill());
    }
    
    // === EVENT LISTENERS GLOBAIS PARA TOQUE E MOUSE ===
    function handleMove(e) {
        if (!animalSendoArrastado) return;
        animalSendoArrastado.movedSincePress = true;
        const pos = getEventPosition(e); const rect = world.getBoundingClientRect();
        animalSendoArrastado.x = pos.x - rect.left - (animalSendoArrastado.width / 2);
        animalSendoArrastado.y = pos.y - rect.top - (animalSendoArrastado.height / 2);
        animalSendoArrastado.element.style.left = `${animalSendoArrastado.x}px`;
        animalSendoArrastado.element.style.top = `${animalSendoArrastado.y}px`;
    }
    function handleEnd(e) {
        if (animalSendoArrastado) {
            animalSendoArrastado.handleRelease();
            animalSendoArrastado.element.classList.remove('dragging');
            animalSendoArrastado = null;
        }
    }
    function getEventPosition(e) {
        return e.touches ? e.touches[0] : e;
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    
    // ... (Restante das funções: iniciar, resetar, adicionarAnimal, etc. e os event listeners dos botões)
    // O código completo deve ser colado, esta é uma representação com as principais mudanças.
    // Use o bloco de código completo abaixo.
});

// =================== COPIE O SCRIPT COMPLETO ABAIXO ===================
document.addEventListener('DOMContentLoaded', () => {
    const DEFINICOES_ANIMAIS = { rato: { nome: 'Rato', come: ['racao'], classeCss: 'rato' }, coelho: { nome: 'Coelho', come: ['grama'], classeCss: 'coelho' }, };
    const DEFINICOES_COMIDAS = { racao: { nome: 'Ração', classeCss: 'racao' }, grama: { nome: 'Grama', classeCss: 'grama' }, };
    const Telas = { menu: document.getElementById('main-menu-container'), setup: document.getElementById('setup-container'), game: document.getElementById('game-container'), mostrar: function(n) { this.menu.classList.add('hidden'); this.setup.classList.add('hidden'); this.game.classList.add('hidden'); this[n].classList.remove('hidden'); }};
    const world = document.getElementById('world'), animalSelectionDiv = document.getElementById('animal-selection'), populacaoTotalSpan = document.getElementById('populacaoTotal'), tempoSpan = document.getElementById('tempo'), animalCountsDiv = document.getElementById('animal-counts'), scenarioSelect = document.getElementById('scenario'), numComidaInput = document.getElementById('numComida'), numAguaInput = document.getElementById('numAgua');
    let animais = [], comidas = [], aguas = [], obstaculos = [];
    let simulaçãoAtiva = false, tempo = 0, animalSendoArrastado = null, modoDeColocarPedra = false;
    const WORLD_WIDTH = 800, WORLD_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1, dayNightTimer = 0, isNight = false, rainTimer = 0;
    class Entidade { constructor(x, y, c) { this.element = document.createElement('div'); this.element.className = `entity ${c}`; this.x = x ?? Math.random()*(WORLD_WIDTH-50); this.y = y ?? Math.random()*(WORLD_HEIGHT-50); this.element.style.left = `${this.x}px`; this.element.style.top = `${this.y}px`; world.appendChild(this.element); this.width = this.element.offsetWidth; this.height = this.element.offsetHeight; } remover() { if (this.element.parentElement) world.removeChild(this.element); this.foiRemovido = true; } getBounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; } }
    class Obstaculo extends Entidade { constructor(x, y) { super(x - 35, y - 35, 'pedra'); } }
    class Comida extends Entidade { constructor(t) { super(null, null, DEFINICOES_COMIDAS[t].classeCss + ' comida'); this.tipo = t; } }
    class Agua extends Entidade { constructor() { super(null, null, 'bebedouro agua'); } refill() { this.element.style.transition = 'transform 0.2s'; this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); } }
    class Animal extends Entidade { constructor(t, x, y) { super(x, y, DEFINICOES_ANIMAIS[t].classeCss + ' animal filhote'); this.tipo = t; this.oQueCome = DEFINICOES_ANIMAIS[t].come; this.fome = 20; this.sede = 20; this.age = 0; this.reproductionUrge = 0; this.velocidade = 2.5 + Math.random(); this.isMature = false; this.maxAge = 80 + Math.random() * 40; this.gender = Math.random() > 0.5 ? 'male' : 'female'; this.isGestating = false; this.gestationTimer = 0; this.lastKnownFoodLocation = null; this.lastKnownWaterLocation = null; this.alvo = null; this.estado = 'Vagando'; this.movedSincePress = false; this.pressTimer = null; this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container'; this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill'; this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer); this.statusBubble = document.createElement('div'); this.statusBubble.className = 'status-bubble'; this.element.appendChild(this.statusBubble); this.element.addEventListener('mousedown', (e) => this.handlePress(e)); this.element.addEventListener('touchstart', (e) => this.handlePress(e), { passive: false }); } handlePress(e) { if (modoDeColocarPedra) return; e.preventDefault(); this.movedSincePress = false; this.pressTimer = setTimeout(() => { if (!this.movedSincePress) { animalSendoArrastado = this; this.element.classList.add('dragging'); } }, 150); } handleRelease() { clearTimeout(this.pressTimer); if (!this.movedSincePress) { this.toggleStatusBubble(); } } toggleStatusBubble() { document.querySelectorAll('.status-bubble.visible').forEach(b => { if (b !== this.statusBubble) b.classList.remove('visible'); }); this.statusBubble.classList.toggle('visible'); } atualizar() { if (this.foiRemovido || animalSendoArrastado === this) return; this.age += 0.05; this.fome += 0.2; this.sede += (scenarioSelect.value === 'deserto' ? 0.3 : 0.25); if (this.isMature) this.reproductionUrge += 0.3; if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge) { this.morrer(); return; } if (!this.isMature && this.age > 20) { this.isMature = true; this.element.classList.remove('filhote'); } if (this.isGestating) { if (--this.gestationTimer <= 0) this.darALuz(); } else { this.decidirAcao(); if (this.alvo) this.moverParaAlvo(); else this.vagar(); } this.element.style.left = `${this.x}px`; this.element.style.top = `${this.y}px`; this.element.style.opacity = Math.max(0.3, (100 - Math.max(this.fome, this.sede)) / 100); this.atualizarUI(); } atualizarUI() { const b = 100 - Math.max(this.fome, this.sede); this.healthBarFill.style.width = `${b}%`; if(b > 60) this.healthBarFill.className = 'health-bar-fill health-green'; else if (b > 30) this.healthBarFill.className = 'health-bar-fill health-yellow'; else this.healthBarFill.className = 'health-bar-fill health-red'; this.statusBubble.textContent = this.getStatusText(); } getStatusText() { let s = this.estado, n = []; if(this.fome > 70) n.push('morrendo de fome'); else if (this.fome > 40) n.push('com fome'); if(this.sede > 70) n.push('morrendo de sede'); else if (this.sede > 40) n.push('com sede'); return `${s}${n.length > 0 ? ': ' + n.join(' e ') : ''}`; } decidirAcao() { if (this.sede > 60) { this.alvo = this.encontrarMaisProximo(aguas); this.estado = 'Buscando Água'; return; } if (this.fome > 50) { this.alvo = this.encontrarComida(); this.estado = 'Buscando Comida'; return; } if (this.isMature && this.gender === 'female' && this.reproductionUrge > 70 && this.fome < 40 && this.sede < 40) { const p = this.encontrarMaisProximo(animais.filter(a => a.tipo === this.tipo && a.isMature && a.gender === 'male' && !a.isGestating)); if (p) { this.alvo = p; this.estado = 'Procurando parceiro'; return; } } if (this.sede > 30 && this.lastKnownWaterLocation) { this.alvo = this.lastKnownWaterLocation; this.estado = 'Buscando Água'; return; } if (this.fome > 30 && this.lastKnownFoodLocation) { this.alvo = this.lastKnownFoodLocation; this.estado = 'Buscando Comida'; return; } this.estado = 'Vagando'; this.alvo = null; } encontrarComida() { const c = comidas.filter(c => this.oQueCome.includes(c.tipo)); return this.encontrarMaisProximo(c); } encontrarMaisProximo(l) { return l.reduce((p, a) => { if (!a || a === this || a.foiRemovido) return p; const d = Math.hypot(this.x - a.x, this.y - a.y); if (!p || d < p.dist) { return { alvo: a, dist: d }; } return p; }, null)?.alvo; } moverParaAlvo() { if (!this.alvo || this.alvo.foiRemovido) { this.alvo = null; return; } const dx = this.alvo.x - this.x, dy = this.alvo.y - this.y, dist = Math.hypot(dx, dy); if (dist < 15) { this.interagirComAlvo(); return; } let nX = this.x + (dx / dist) * this.velocidade, nY = this.y + (dy / dist) * this.velocidade; if (this.checarColisao(nX, nY)) { nX = this.x + (Math.random() - 0.5) * 5; nY = this.y + (Math.random() - 0.5) * 5; if (this.checarColisao(nX, nY)) { this.alvo = null; return; } } this.x = nX; this.y = nY; } interagirComAlvo() { switch(this.estado) { case 'Buscando Comida': this.fome = Math.max(0, this.fome - 60); this.lastKnownFoodLocation = { x: this.alvo.x, y: this.alvo.y, foiRemovido: true }; this.alvo.remover(); comidas = comidas.filter(c => c !== this.alvo); break; case 'Buscando Água': this.sede = Math.max(0, this.sede - 70); this.lastKnownWaterLocation = { x: this.alvo.x, y: this.alvo.y }; break; case 'Procurando parceiro': if(this.alvo?.isMature) { this.isGestating = true; this.gestationTimer = 150; this.reproductionUrge = 0; } break; } this.alvo = null; } checarColisao(x, y) { for (const o of obstaculos) { const b = o.getBounds(); if (x < b.right && x + this.width > b.left && y < b.bottom && y + this.height > b.top) return true; } return false; } vagar() { if (!this.vagarAlvo || Math.random() < 0.05) { this.vagarAlvo = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT }; } const dx = this.vagarAlvo.x - this.x, dy = this.vagarAlvo.y - this.y, dist = Math.hypot(dx, dy); if (dist < 20) { this.vagarAlvo = null; } else { this.x += (dx / dist) * (this.velocidade / 2); this.y += (dy / dist) * (this.velocidade / 2); } } darALuz() { this.isGestating = false; const n = Math.floor(Math.random() * 3) + 1; for(let i=0; i<n; i++) { animais.push(new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10))); } } morrer() { this.foiRemovido = true; animais = animais.filter(a => a !== this); this.element.style.transform = 'rotate(180deg)'; this.element.style.opacity = '0.4'; this.element.style.zIndex = '1'; } }
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [t, d] of Object.entries(DEFINICOES_ANIMAIS)) { const g = document.createElement('div'); g.className = 'animal-input-group'; g.innerHTML = `<label for="num-${t}">${d.nome}:</label><input type="number" id="num-${t}" data-tipo="${t}" value="2" min="0" max="20">`; animalSelectionDiv.appendChild(g); } }
    function iniciar() { world.innerHTML = '<div id="world-overlay"></div>'; animais = []; comidas = []; aguas = []; obstaculos = []; tempo = 0; world.className = `world-${scenarioSelect.value}`; for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua()); const tS = Array.from(animalSelectionDiv.querySelectorAll('input')).filter(i => parseInt(i.value) > 0).map(i => i.dataset.tipo); if (tS.length > 0) { for (let i = 0; i < parseInt(numComidaInput.value); i++) { const tC = DEFINICOES_ANIMAIS[tS[i % tS.length]].come[0]; comidas.push(new Comida(tC)); } } animalSelectionDiv.querySelectorAll('input').forEach(i => { for(let j=0; j<parseInt(i.value); j++) { animais.push(new Animal(i.dataset.tipo)); } }); setGameSpeed(1); Telas.mostrar('game'); }
    function gameLoop() { if (!simulaçãoAtiva) return; tempo += 0.1 * currentSpeedMultiplier; updateWorldState(); [...animais].forEach(a => a.atualizar()); world.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD); populacaoTotalSpan.textContent = animais.length; tempoSpan.textContent = tempo.toFixed(1); const c = {}; animais.forEach(a => c[a.tipo] = (c[a.tipo] || 0) + 1); animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([t, d]) => `<span>${d.nome}: ${c[t] || 0}</span>`).join('<br>'); if (animais.length === 0 && tempo > 1) finalizarSimulacao('extinção'); }
    function updateWorldState() { dayNightTimer += (0.1 * currentSpeedMultiplier); if (dayNightTimer > 60) { dayNightTimer = 0; isNight = !isNight; world.classList.toggle('world-night', isNight); } if (rainTimer > 0) { rainTimer -= 0.1; if (rainTimer <= 0) world.classList.remove('world-rain'); } if (Math.random() < 0.0005 * currentSpeedMultiplier) { triggerRain(); } }
    function triggerRain() { if (rainTimer > 0) return; rainTimer = 10 + Math.random() * 10; world.classList.add('world-rain'); aguas.forEach(a => a.refill()); }
    function setGameSpeed(m) { clearInterval(gameInterval); currentSpeedMultiplier = m; if (m > 0) { simulaçãoAtiva = true; gameInterval = setInterval(gameLoop, BASE_TICK_SPEED / m); } else { simulaçãoAtiva = false; } document.querySelectorAll('.btn-time').forEach(b => { b.classList.toggle('active', parseFloat(b.dataset.speed) === m); }); }
    function finalizarSimulacao(m) { clearInterval(gameInterval); simulaçãoAtiva = false; if (m === 'extinção') alert(`A simulação terminou! A vida foi extinta em ${tempo.toFixed(1)} segundos.`); }
    function resetar() { finalizarSimulacao('reset'); modoDeColocarPedra = false; document.getElementById('btn-colocar-pedra').classList.remove('active'); world.classList.remove('placing-mode'); Telas.mostrar('menu'); }
    function adicionarAnimal(t) { animais.push(new Animal(t)); }
    function adicionarComidaAleatoria() { if(animais.length === 0) return; const tA = animais[Math.floor(Math.random() * animais.length)].tipo; const tC = DEFINICOES_ANIMAIS[tA].come[0]; comidas.push(new Comida(tC)); }
    function toggleModoPedra() { modoDeColocarPedra = !modoDeColocarPedra; document.getElementById('btn-colocar-pedra').classList.toggle('active', modoDeColocarPedra); world.classList.toggle('placing-mode', modoDeColocarPedra); }
    document.getElementById('btn-nova-simulacao').addEventListener('click', () => Telas.mostrar('setup')); document.getElementById('btn-voltar-menu').addEventListener('click', () => Telas.mostrar('menu')); document.getElementById('iniciarSimulacao').addEventListener('click', iniciar); document.getElementById('resetarSimulacao').addEventListener('click', resetar); document.getElementById('btn-add-comida').addEventListener('click', adicionarComidaAleatoria); document.getElementById('btn-add-rato').addEventListener('click', () => adicionarAnimal('rato')); document.getElementById('btn-add-coelho').addEventListener('click', () => adicionarAnimal('coelho')); document.getElementById('btn-colocar-pedra').addEventListener('click', toggleModoPedra); document.querySelectorAll('.btn-time').forEach(b => { b.addEventListener('click', () => { setGameSpeed(parseFloat(b.dataset.speed)); }); });
    function handleMove(e) { if (!animalSendoArrastado) return; e.preventDefault(); animalSendoArrastado.movedSincePress = true; const p = e.touches ? e.touches[0] : e, r = world.getBoundingClientRect(); animalSendoArrastado.x = p.clientX - r.left - (animalSendoArrastado.width / 2); animalSendoArrastado.y = p.clientY - r.top - (animalSendoArrastado.height / 2); animalSendoArrastado.element.style.left = `${animalSendoArrastado.x}px`; animalSendoArrastado.element.style.top = `${animalSendoArrastado.y}px`; }
    function handleEnd(e) { if(animalSendoArrastado) { animalSendoArrastado.handleRelease(); animalSendoArrastado.element.classList.remove('dragging'); animalSendoArrastado = null; } }
    world.addEventListener('click', (e) => { if (modoDeColocarPedra) { const rect = world.getBoundingClientRect(); obstaculos.push(new Obstaculo(e.clientX - rect.left, e.clientY - rect.top)); }});
    window.addEventListener('mousemove', handleMove); window.addEventListener('touchmove', handleMove, { passive: false }); window.addEventListener('mouseup', handleEnd); window.addEventListener('touchend', handleEnd);
    popularSetup(); Telas.mostrar('menu');
});
