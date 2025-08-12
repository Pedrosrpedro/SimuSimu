document.addEventListener('DOMContentLoaded', () => {
    // === DEFINIÇÕES GLOBAIS ===
    const DEFINICOES_ANIMAIS = {
        rato: { nome: 'Rato', come: ['racao'], classeCss: 'rato' },
        coelho: { nome: 'Coelho', come: ['grama'], classeCss: 'coelho' },
    };
    const DEFINICOES_COMIDAS = {
        racao: { nome: 'Ração', classeCss: 'racao' },
        grama: { nome: 'Grama', classeCss: 'grama' },
    };
    const Telas = {
        menu: document.getElementById('main-menu-container'),
        setup: document.getElementById('setup-container'),
        game: document.getElementById('game-container'),
        mostrar: function(nomeTela) {
            this.menu.classList.add('hidden');
            this.setup.classList.add('hidden');
            this.game.classList.add('hidden');
            this[nomeTela].classList.remove('hidden');
        }
    };

    // === ELEMENTOS DO DOM ===
    const world = document.getElementById('world');
    const animalSelectionDiv = document.getElementById('animal-selection');
    const populacaoTotalSpan = document.getElementById('populacaoTotal');
    const tempoSpan = document.getElementById('tempo');
    const animalCountsDiv = document.getElementById('animal-counts');
    const scenarioSelect = document.getElementById('scenario');
    const numComidaInput = document.getElementById('numComida');
    const numAguaInput = document.getElementById('numAgua');
    const btnNovaSimulacao = document.getElementById('btn-nova-simulacao');
    const btnVoltarMenu = document.getElementById('btn-voltar-menu');
    const iniciarSimulacaoBtn = document.getElementById('iniciarSimulacao');
    const resetarSimulacaoBtn = document.getElementById('resetarSimulacao');
    const btnAddComida = document.getElementById('btn-add-comida');
    const btnAddRato = document.getElementById('btn-add-rato');
    const btnAddCoelho = document.getElementById('btn-add-coelho');
    const btnColocarPedra = document.getElementById('btn-colocar-pedra');
    const timeControlButtons = document.querySelectorAll('.btn-time');

    // === VARIÁVEIS GLOBAIS DA SIMULAÇÃO ===
    let animais = [], comidas = [], aguas = [], obstaculos = [];
    let simulaçãoAtiva = false, tempo = 0, modoDeColocarPedra = false;
    const WORLD_WIDTH = 800, WORLD_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1, dayNightTimer = 0, isNight = false, rainTimer = 0;

    // === VARIÁVEIS DE INTERAÇÃO (REFEITAS) ===
    let objetoInteragido = null;
    let isDragging = false;
    let startX, startY;

    // === LÓGICA DE CLASSES ===
    class Entidade {
        constructor(x, y, classeCss) {
            this.element = document.createElement('div');
            this.element.className = `entity ${classeCss}`;
            this.x = x ?? Math.random() * (WORLD_WIDTH - 50);
            this.y = y ?? Math.random() * (WORLD_HEIGHT - 50);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            world.appendChild(this.element);
            this.width = this.element.offsetWidth;
            this.height = this.element.offsetHeight;
            this.element.entidade = this; // Link do elemento DOM para o objeto da classe
        }
        remover() { if (this.element.parentElement) world.removeChild(this.element); this.foiRemovido = true; }
        getBounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; }
    }
    class Obstaculo extends Entidade { constructor(x, y) { super(x - 35, y - 35, 'pedra'); } }
    class Comida extends Entidade { constructor(tipo) { super(null, null, DEFINICOES_COMIDAS[tipo].classeCss + ' comida'); this.tipo = tipo; } }
    class Agua extends Entidade {
        constructor() { super(null, null, 'bebedouro agua'); }
        refill() { this.element.style.transition = 'transform 0.2s'; this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); }
    }
    class Animal extends Entidade {
        constructor(tipo, x, y) {
            super(x, y, DEFINICOES_ANIMAIS[tipo].classeCss + ' animal');
            this.tipo = tipo; this.oQueCome = DEFINICOES_ANIMAIS[tipo].come;
            this.fome = 20; this.sede = 20; this.age = 0; this.reproductionUrge = 0;
            this.velocidade = 2.5 + Math.random(); this.isMature = false; this.maxAge = 80 + Math.random() * 40;
            this.gender = Math.random() > 0.5 ? 'male' : 'female'; this.isGestating = false; this.gestationTimer = 0;
            this.lastKnownFoodLocation = null; this.lastKnownWaterLocation = null;
            this.alvo = null; this.estado = 'Vagando';
            this.element.classList.add('filhote');
            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer);
            this.statusBubble = document.createElement('div'); this.statusBubble.className = 'status-bubble'; this.element.appendChild(this.statusBubble);
        }
        toggleStatusBubble() {
            document.querySelectorAll('.status-bubble.visible').forEach(b => { if (b !== this.statusBubble) b.classList.remove('visible'); });
            this.statusBubble.classList.toggle('visible');
        }
        atualizar() {
            if (this.foiRemovido || objetoInteragido === this && isDragging) return;
            this.age += 0.05; this.fome += 0.2; this.sede += (scenarioSelect.value === 'deserto' ? 0.3 : 0.25);
            if (this.isMature) this.reproductionUrge += 0.3;
            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge) { this.morrer(); return; }
            if (!this.isMature && this.age > 20) { this.isMature = true; this.element.classList.remove('filhote'); }
            if (this.isGestating) { if (--this.gestationTimer <= 0) this.darALuz(); } 
            else { this.decidirAcao(); if (this.alvo) this.moverParaAlvo(); else this.vagar(); }
            this.element.style.left = `${this.x}px`; this.element.style.top = `${this.y}px`;
            this.element.style.opacity = Math.max(0.3, (100 - Math.max(this.fome, this.sede)) / 100);
            this.atualizarUI();
        }
        atualizarUI() {
            const bemEstar = 100 - Math.max(this.fome, this.sede);
            this.healthBarFill.style.width = `${bemEstar}%`;
            if (bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green'; else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow'; else this.healthBarFill.className = 'health-bar-fill health-red';
            this.statusBubble.textContent = this.getStatusText();
        }
        getStatusText() { let s = this.estado, n = []; if(this.fome > 70) n.push('morrendo de fome'); else if (this.fome > 40) n.push('com fome'); if(this.sede > 70) n.push('morrendo de sede'); else if (this.sede > 40) n.push('com sede'); return `${s}${n.length > 0 ? ': ' + n.join(' e ') : ''}`; }
        decidirAcao() { if (this.sede > 60) { this.alvo = this.encontrarMaisProximo(aguas); this.estado = 'Buscando Água'; return; } if (this.fome > 50) { this.alvo = this.encontrarComida(); this.estado = 'Buscando Comida'; return; } if (this.isMature && this.gender === 'female' && this.reproductionUrge > 70 && this.fome < 40 && this.sede < 40) { const p = this.encontrarMaisProximo(animais.filter(a => a.tipo === this.tipo && a.isMature && a.gender === 'male' && !a.isGestating)); if (p) { this.alvo = p; this.estado = 'Procurando parceiro'; return; } } if (this.sede > 30 && this.lastKnownWaterLocation) { this.alvo = this.lastKnownWaterLocation; this.estado = 'Indo para água conhecida'; return; } if (this.fome > 30 && this.lastKnownFoodLocation) { this.alvo = this.lastKnownFoodLocation; this.estado = 'Indo para comida conhecida'; return; } this.estado = 'Vagando'; this.alvo = null; }
        encontrarComida() { const c = comidas.filter(c => this.oQueCome.includes(c.tipo)); return this.encontrarMaisProximo(c); }
        encontrarMaisProximo(l) { return l.reduce((p, a) => { if (!a || a === this || a.foiRemovido) return p; const d = Math.hypot(this.x - a.x, this.y - a.y); if (!p || d < p.dist) return { alvo: a, dist: d }; return p; }, null)?.alvo; }
        moverParaAlvo() { if (!this.alvo || this.alvo.foiRemovido) { this.alvo = null; return; } const dx = this.alvo.x - this.x, dy = this.alvo.y - this.y, d = Math.hypot(dx, dy); if (d < 15) { this.interagirComAlvo(); return; } let nX = this.x + (dx / d) * this.velocidade, nY = this.y + (dy / d) * this.velocidade; if (this.checarColisao(nX, nY)) { nX = this.x + (Math.random() - 0.5) * 5; nY = this.y + (Math.random() - 0.5) * 5; if (this.checarColisao(nX, nY)) { this.alvo = null; return; } } this.x = nX; this.y = nY; }
        interagirComAlvo() { switch(this.estado) { case 'Buscando Comida': case 'Indo para comida conhecida': this.fome = Math.max(0, this.fome - 60); this.lastKnownFoodLocation = { x: this.alvo.x, y: this.alvo.y, foiRemovido: true }; this.alvo.remover(); comidas = comidas.filter(c => c !== this.alvo); break; case 'Buscando Água': case 'Indo para água conhecida': this.sede = Math.max(0, this.sede - 70); this.lastKnownWaterLocation = { x: this.alvo.x, y: this.alvo.y }; break; case 'Procurando parceiro': if(this.alvo?.isMature) { this.isGestating = true; this.gestationTimer = 150; this.reproductionUrge = 0; } break; } this.alvo = null; }
        checarColisao(x, y) { for (const o of obstaculos) { const b = o.getBounds(); if (x < b.right && x + this.width > b.left && y < b.bottom && y + this.height > b.top) return true; } return false; }
        vagar() { if (!this.vagarAlvo || Math.random() < 0.05) { this.vagarAlvo = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT }; } const dx = this.vagarAlvo.x - this.x, dy = this.vagarAlvo.y - this.y, d = Math.hypot(dx, dy); if (d < 20) this.vagarAlvo = null; else { this.x += (dx / d) * (this.velocidade / 2); this.y += (dy / d) * (this.velocidade / 2); } }
        darALuz() { this.isGestating = false; const n = Math.floor(Math.random() * 3) + 1; for(let i=0; i<n; i++) { animais.push(new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10))); } }
        morrer() { this.foiRemovido = true; animais = animais.filter(a => a !== this); this.element.style.transform = 'rotate(180deg)'; this.element.style.opacity = '0.4'; this.element.style.zIndex = '1'; }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [t, d] of Object.entries(DEFINICOES_ANIMAIS)) { const g = document.createElement('div'); g.className = 'animal-input-group'; g.innerHTML = `<label for="num-${t}">${d.nome}:</label><input type="number" id="num-${t}" data-tipo="${t}" value="2" min="0" max="20">`; animalSelectionDiv.appendChild(g); } }
    function iniciar() {
        world.innerHTML = '<div id="world-overlay"></div>'; animais = []; comidas = []; aguas = []; obstaculos = []; tempo = 0;
        world.className = `world-${scenarioSelect.value}`;
        for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua());
        const tiposSel = Array.from(animalSelectionDiv.querySelectorAll('input')).filter(i => parseInt(i.value) > 0).map(i => i.dataset.tipo);
        if (tiposSel.length > 0) { for (let i = 0; i < parseInt(numComidaInput.value); i++) { const tC = DEFINICOES_ANIMAIS[tiposSel[i % tiposSel.length]].come[0]; comidas.push(new Comida(tC)); } }
        animalSelectionDiv.querySelectorAll('input').forEach(i => { for(let j=0; j<parseInt(i.value); j++) { animais.push(new Animal(i.dataset.tipo)); } });
        setGameSpeed(1); Telas.mostrar('game');
    }
    function gameLoop() { if (!simulaçãoAtiva) return; tempo += 0.1 * currentSpeedMultiplier; updateWorldState(); [...animais].forEach(a => a.atualizar()); world.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD); populacaoTotalSpan.textContent = animais.length; tempoSpan.textContent = tempo.toFixed(1); const c = {}; animais.forEach(a => c[a.tipo] = (c[a.tipo] || 0) + 1); animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([t, d]) => `<span>${d.nome}: ${c[t] || 0}</span>`).join('<br>'); if (animais.length === 0 && tempo > 1) finalizarSimulacao('extinção'); }
    function updateWorldState() { dayNightTimer += (0.1 * currentSpeedMultiplier); if (dayNightTimer > 60) { dayNightTimer = 0; isNight = !isNight; world.classList.toggle('world-night', isNight); } if (rainTimer > 0) { rainTimer -= 0.1; if (rainTimer <= 0) world.classList.remove('world-rain'); } if (Math.random() < 0.0005 * currentSpeedMultiplier) { triggerRain(); } }
    function triggerRain() { if (rainTimer > 0) return; rainTimer = 10 + Math.random() * 10; world.classList.add('world-rain'); aguas.forEach(a => a.refill()); }
    function setGameSpeed(m) { clearInterval(gameInterval); currentSpeedMultiplier = m; if (m > 0) { simulaçãoAtiva = true; gameInterval = setInterval(gameLoop, 100 / m); } else { simulaçãoAtiva = false; } document.querySelectorAll('.btn-time').forEach(b => { b.classList.toggle('active', parseFloat(b.dataset.speed) === m); }); }
    function finalizarSimulacao(m) { clearInterval(gameInterval); simulaçãoAtiva = false; if (m === 'extinção') alert(`A simulação terminou! A vida foi extinta em ${tempo.toFixed(1)} segundos.`); }
    function resetar() { finalizarSimulacao('reset'); modoDeColocarPedra = false; btnColocarPedra.classList.remove('active'); world.classList.remove('placing-mode'); Telas.mostrar('menu'); }
    function adicionarAnimal(t) { animais.push(new Animal(t)); }
    function adicionarComidaAleatoria() { if(animais.length === 0) return; const tA = animais[Math.floor(Math.random() * animais.length)].tipo; const tC = DEFINICOES_ANIMAIS[tA].come[0]; comidas.push(new Comida(tC)); }
    function toggleModoPedra() { modoDeColocarPedra = !modoDeColocarPedra; btnColocarPedra.classList.toggle('active', modoDeColocarPedra); world.classList.toggle('placing-mode', modoDeColocarPedra); }

    // === EVENT LISTENERS DOS BOTÕES ===
    btnNovaSimulacao.addEventListener('click', () => Telas.mostrar('setup'));
    btnVoltarMenu.addEventListener('click', () => Telas.mostrar('menu'));
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);
    btnAddComida.addEventListener('click', adicionarComidaAleatoria);
    btnAddRato.addEventListener('click', () => adicionarAnimal('rato'));
    btnAddCoelho.addEventListener('click', () => adicionarAnimal('coelho'));
    btnColocarPedra.addEventListener('click', toggleModoPedra);
    timeControlButtons.forEach(b => { b.addEventListener('click', () => { setGameSpeed(parseFloat(b.dataset.speed)); }); });

    // === LÓGICA DE INTERAÇÃO (REFEITA E CORRIGIDA) ===
    function getEventPosition(e) { return e.touches && e.touches.length > 0 ? e.touches[0] : e; }

    function handleInteractionStart(e) {
        if (modoDeColocarPedra) {
            if (e.target === world) {
                const rect = world.getBoundingClientRect();
                const pos = getEventPosition(e);
                obstaculos.push(new Obstaculo(pos.clientX - rect.left, pos.clientY - rect.top));
            }
            return;
        }
        if (e.target.entidade instanceof Animal) {
            e.preventDefault();
            objetoInteragido = e.target.entidade;
            isDragging = false;
            const pos = getEventPosition(e);
            startX = pos.clientX;
            startY = pos.clientY;
        }
    }

    function handleInteractionMove(e) {
        if (!objetoInteragido) return;
        e.preventDefault();
        const pos = getEventPosition(e);
        const dX = Math.abs(pos.clientX - startX);
        const dY = Math.abs(pos.clientY - startY);
        if (dX > 5 || dY > 5) { // Limite para diferenciar toque de arrastar
            isDragging = true;
        }
        if (isDragging) {
            if (!objetoInteragido.element.classList.contains('dragging')) {
                objetoInteragido.element.classList.add('dragging');
            }
            const rect = world.getBoundingClientRect();
            objetoInteragido.x = pos.clientX - rect.left - (objetoInteragido.width / 2);
            objetoInteragido.y = pos.clientY - rect.top - (objetoInteragido.height / 2);
            objetoInteragido.element.style.left = `${objetoInteragido.x}px`;
            objetoInteragido.element.style.top = `${objetoInteragido.y}px`;
        }
    }

    function handleInteractionEnd(e) {
        if (!objetoInteragido) return;
        if (!isDragging) {
            objetoInteragido.toggleStatusBubble();
        }
        objetoInteragido.element.classList.remove('dragging');
        objetoInteragido = null;
        isDragging = false;
    }

    world.addEventListener('mousedown', handleInteractionStart);
    world.addEventListener('touchstart', handleInteractionStart, { passive: false });
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchend', handleInteractionEnd);
    
    // === INICIALIZAÇÃO DO JOGO ===
    popularSetup();
    Telas.mostrar('menu');
});
