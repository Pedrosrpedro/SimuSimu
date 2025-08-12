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
    // Botões
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
    let simulaçãoAtiva = false, tempo = 0, animalSendoArrastado = null, modoDeColocarPedra = false;
    const WORLD_WIDTH = 800, WORLD_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1, dayNightTimer = 0, isNight = false, rainTimer = 0;

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
        }
        remover() {
            if (this.element.parentElement) world.removeChild(this.element);
            this.foiRemovido = true;
        }
        getBounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; }
    }

    class Obstaculo extends Entidade { constructor(x, y) { super(x - 35, y - 35, 'pedra'); } }
    class Comida extends Entidade { constructor(tipo) { super(null, null, DEFINICOES_COMIDAS[tipo].classeCss + ' comida'); this.tipo = tipo; } }
    class Agua extends Entidade {
        constructor() { super(null, null, 'bebedouro agua'); }
        refill() {
            this.element.style.transition = 'transform 0.2s';
            this.element.style.transform = 'scale(1.2)';
            setTimeout(() => this.element.style.transform = 'scale(1)', 500);
        }
    }

    class Animal extends Entidade {
        constructor(tipo, x, y) {
            super(x, y, DEFINICOES_ANIMAIS[tipo].classeCss + ' animal filhote');
            this.tipo = tipo; this.oQueCome = DEFINICOES_ANIMAIS[tipo].come;
            this.fome = 20; this.sede = 20; this.age = 0; this.reproductionUrge = 0;
            this.velocidade = 2.5 + Math.random(); this.isMature = false; this.maxAge = 80 + Math.random() * 40;
            this.gender = Math.random() > 0.5 ? 'male' : 'female'; this.isGestating = false; this.gestationTimer = 0;
            this.lastKnownFoodLocation = null; this.lastKnownWaterLocation = null;
            this.alvo = null; this.estado = 'Vagando';
            this.movedSincePress = false; this.pressTimer = null;

            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill);
            this.element.appendChild(this.healthBarContainer);

            this.statusBubble = document.createElement('div'); this.statusBubble.className = 'status-bubble';
            this.element.appendChild(this.statusBubble);

            this.element.addEventListener('mousedown', (e) => this.handlePress(e));
            this.element.addEventListener('mouseup', (e) => this.handleRelease(e));
            this.element.addEventListener('touchstart', (e) => this.handlePress(e), { passive: false });
            this.element.addEventListener('touchend', (e) => this.handleRelease(e));
        }
        handlePress(e) {
            if (modoDeColocarPedra) return;
            e.preventDefault();
            this.movedSincePress = false;
            animalSendoArrastado = this; // Inicia o arraste imediatamente para o mouse
            if (e.type === 'touchstart') {
                this.pressTimer = setTimeout(() => { // Em toque, espera para diferenciar de um toque simples
                    if (this.movedSincePress) this.element.classList.add('dragging');
                }, 200);
            } else {
                this.element.classList.add('dragging');
            }
        }
        handleRelease(e) {
            clearTimeout(this.pressTimer);
            if (!this.movedSincePress && animalSendoArrastado) {
                this.toggleStatusBubble();
            }
            if (animalSendoArrastado) this.element.classList.remove('dragging');
            animalSendoArrastado = null; // Limpa a variável global
        }
        toggleStatusBubble() {
            document.querySelectorAll('.status-bubble.visible').forEach(b => {
                if (b !== this.statusBubble) b.classList.remove('visible');
            });
            this.statusBubble.classList.toggle('visible');
        }
        atualizar() {
            if (this.foiRemovido || animalSendoArrastado === this) return;
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
            if (bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green';
            else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow';
            else this.healthBarFill.className = 'health-bar-fill health-red';
            this.statusBubble.textContent = this.getStatusText();
        }
        getStatusText() {
            let status = this.estado, needs = [];
            if (this.fome > 70) needs.push('morrendo de fome'); else if (this.fome > 40) needs.push('com fome');
            if (this.sede > 70) needs.push('morrendo de sede'); else if (this.sede > 40) needs.push('com sede');
            return `${status}${needs.length > 0 ? ': ' + needs.join(' e ') : ''}`;
        }
        decidirAcao() {
            if (this.sede > 60) { this.alvo = this.encontrarMaisProximo(aguas); this.estado = 'Buscando Água'; return; }
            if (this.fome > 50) { this.alvo = this.encontrarComida(); this.estado = 'Buscando Comida'; return; }
            if (this.isMature && this.gender === 'female' && this.reproductionUrge > 70 && this.fome < 40 && this.sede < 40) {
                const parceiro = this.encontrarMaisProximo(animais.filter(a => a.tipo === this.tipo && a.isMature && a.gender === 'male' && !a.isGestating));
                if (parceiro) { this.alvo = parceiro; this.estado = 'Procurando parceiro'; return; }
            }
            if (this.sede > 30 && this.lastKnownWaterLocation) { this.alvo = this.lastKnownWaterLocation; this.estado = 'Indo para água conhecida'; return; }
            if (this.fome > 30 && this.lastKnownFoodLocation) { this.alvo = this.lastKnownFoodLocation; this.estado = 'Indo para comida conhecida'; return; }
            this.estado = 'Vagando'; this.alvo = null;
        }
        encontrarComida() { const comidasCompativeis = comidas.filter(c => this.oQueCome.includes(c.tipo)); return this.encontrarMaisProximo(comidasCompativeis); }
        encontrarMaisProximo(lista) { return lista.reduce((maisProximo, alvo) => { if (!alvo || alvo === this || alvo.foiRemovido) return maisProximo; const dist = Math.hypot(this.x - alvo.x, this.y - alvo.y); if (!maisProximo || dist < maisProximo.dist) { return { alvo: alvo, dist: dist }; } return maisProximo; }, null)?.alvo; }
        moverParaAlvo() {
            if (!this.alvo || this.alvo.foiRemovido) { this.alvo = null; return; }
            const dx = this.alvo.x - this.x, dy = this.alvo.y - this.y, dist = Math.hypot(dx, dy);
            if (dist < 15) { this.interagirComAlvo(); return; }
            let nextX = this.x + (dx / dist) * this.velocidade, nextY = this.y + (dy / dist) * this.velocidade;
            if (this.checarColisao(nextX, nextY)) {
                nextX = this.x + (Math.random() - 0.5) * 5; nextY = this.y + (Math.random() - 0.5) * 5;
                if (this.checarColisao(nextX, nextY)) { this.alvo = null; return; }
            }
            this.x = nextX; this.y = nextY;
        }
        interagirComAlvo() {
            switch(this.estado) {
                case 'Buscando Comida': case 'Indo para comida conhecida': this.fome = Math.max(0, this.fome - 60); this.lastKnownFoodLocation = { x: this.alvo.x, y: this.alvo.y, foiRemovido: true }; this.alvo.remover(); comidas = comidas.filter(c => c !== this.alvo); break;
                case 'Buscando Água': case 'Indo para água conhecida': this.sede = Math.max(0, this.sede - 70); this.lastKnownWaterLocation = { x: this.alvo.x, y: this.alvo.y }; break;
                case 'Procurando parceiro': if(this.alvo?.isMature) { this.isGestating = true; this.gestationTimer = 150; this.reproductionUrge = 0; } break;
            }
            this.alvo = null;
        }
        checarColisao(x, y) { for (const obs of obstaculos) { const b = obs.getBounds(); if (x < b.right && x + this.width > b.left && y < b.bottom && y + this.height > b.top) return true; } return false; }
        vagar() { if (!this.vagarAlvo || Math.random() < 0.05) { this.vagarAlvo = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT }; } const dx = this.vagarAlvo.x - this.x, dy = this.vagarAlvo.y - this.y, dist = Math.hypot(dx, dy); if (dist < 20) { this.vagarAlvo = null; } else { this.x += (dx / dist) * (this.velocidade / 2); this.y += (dy / dist) * (this.velocidade / 2); } }
        darALuz() { this.isGestating = false; const numFilhotes = Math.floor(Math.random() * 3) + 1; for(let i=0; i<numFilhotes; i++) { animais.push(new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10))); } }
        morrer() { this.foiRemovido = true; animais = animais.filter(a => a !== this); this.element.style.transform = 'rotate(180deg)'; this.element.style.opacity = '0.4'; this.element.style.zIndex = '1'; }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [tipo, def] of Object.entries(DEFINICOES_ANIMAIS)) { const group = document.createElement('div'); group.className = 'animal-input-group'; group.innerHTML = `<label for="num-${tipo}">${def.nome}:</label><input type="number" id="num-${tipo}" data-tipo="${tipo}" value="2" min="0" max="20">`; animalSelectionDiv.appendChild(group); } }
    
    function iniciar() {
        world.innerHTML = '<div id="world-overlay"></div>'; animais = []; comidas = []; aguas = []; obstaculos = []; tempo = 0;
        world.className = `world-${scenarioSelect.value}`;
        for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua());
        const tiposSelecionados = Array.from(animalSelectionDiv.querySelectorAll('input')).filter(i => parseInt(i.value) > 0).map(i => i.dataset.tipo);
        if (tiposSelecionados.length > 0) { for (let i = 0; i < parseInt(numComidaInput.value); i++) { const tipoComida = DEFINICOES_ANIMAIS[tiposSelecionados[i % tiposSelecionados.length]].come[0]; comidas.push(new Comida(tipoComida)); } }
        animalSelectionDiv.querySelectorAll('input').forEach(input => { for(let j=0; j<parseInt(input.value); j++) { animais.push(new Animal(input.dataset.tipo)); } });
        setGameSpeed(1);
        Telas.mostrar('game');
    }

    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1 * currentSpeedMultiplier;
        updateWorldState();
        [...animais].forEach(a => a.atualizar());
        world.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD);
        populacaoTotalSpan.textContent = animais.length;
        tempoSpan.textContent = tempo.toFixed(1);
        const counts = {}; animais.forEach(a => counts[a.tipo] = (counts[a.tipo] || 0) + 1);
        animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([tipo, def]) => `<span>${def.nome}: ${counts[tipo] || 0}</span>`).join('<br>');
        if (animais.length === 0 && tempo > 1) finalizarSimulacao('extinção');
    }

    function updateWorldState() {
        dayNightTimer += (0.1 * currentSpeedMultiplier);
        if (dayNightTimer > 60) { dayNightTimer = 0; isNight = !isNight; world.classList.toggle('world-night', isNight); }
        if (rainTimer > 0) { rainTimer -= 0.1; if (rainTimer <= 0) world.classList.remove('world-rain'); }
        if (Math.random() < 0.0005 * currentSpeedMultiplier) { triggerRain(); }
    }

    function triggerRain() {
        if (rainTimer > 0) return;
        rainTimer = 10 + Math.random() * 10;
        world.classList.add('world-rain');
        aguas.forEach(agua => agua.refill());
    }

    function setGameSpeed(multiplier) {
        clearInterval(gameInterval);
        currentSpeedMultiplier = multiplier;
        if (multiplier > 0) {
            simulaçãoAtiva = true;
            gameInterval = setInterval(gameLoop, BASE_TICK_SPEED / multiplier);
        } else {
            simulaçãoAtiva = false;
        }
        timeControlButtons.forEach(btn => { btn.classList.toggle('active', parseFloat(btn.dataset.speed) === multiplier); });
    }

    function finalizarSimulacao(motivo) {
        clearInterval(gameInterval);
        simulaçãoAtiva = false;
        if (motivo === 'extinção') alert(`A simulação terminou! A vida foi extinta em ${tempo.toFixed(1)} segundos.`);
    }

    function resetar() {
        finalizarSimulacao('reset');
        modoDeColocarPedra = false;
        btnColocarPedra.classList.remove('active');
        world.classList.remove('placing-mode');
        Telas.mostrar('menu');
    }

    function adicionarAnimal(tipo) { animais.push(new Animal(tipo)); }
    function adicionarComidaAleatoria() { if(animais.length === 0) return; const tipoAnimal = animais[Math.floor(Math.random() * animais.length)].tipo; const tipoComida = DEFINICOES_ANIMAIS[tipoAnimal].come[0]; comidas.push(new Comida(tipoComida)); }
    function toggleModoPedra() { modoDeColocarPedra = !modoDeColocarPedra; btnColocarPedra.classList.toggle('active', modoDeColocarPedra); world.classList.toggle('placing-mode', modoDeColocarPedra); }

    // === EVENT LISTENERS GERAIS ===
    btnNovaSimulacao.addEventListener('click', () => Telas.mostrar('setup'));
    btnVoltarMenu.addEventListener('click', () => Telas.mostrar('menu'));
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);
    btnAddComida.addEventListener('click', adicionarComidaAleatoria);
    btnAddRato.addEventListener('click', () => adicionarAnimal('rato'));
    btnAddCoelho.addEventListener('click', () => adicionarAnimal('coelho'));
    btnColocarPedra.addEventListener('click', toggleModoPedra);
    timeControlButtons.forEach(button => { button.addEventListener('click', () => { setGameSpeed(parseFloat(button.dataset.speed)); }); });

    function getEventPosition(e) { return e.touches && e.touches.length > 0 ? e.touches[0] : e; }
    
    function handleGlobalMove(e) {
        if (!animalSendoArrastado) return;
        e.preventDefault();
        animalSendoArrastado.movedSincePress = true;
        if (!animalSendoArrastado.element.classList.contains('dragging')) animalSendoArrastado.element.classList.add('dragging');
        const pos = getEventPosition(e);
        const rect = world.getBoundingClientRect();
        animalSendoArrastado.x = pos.clientX - rect.left - (animalSendoArrastado.width / 2);
        animalSendoArrastado.y = pos.clientY - rect.top - (animalSendoArrastado.height / 2);
        animalSendoArrastado.element.style.left = `${animalSendoArrastado.x}px`;
        animalSendoArrastado.element.style.top = `${animalSendoArrastado.y}px`;
    }

    world.addEventListener('click', (e) => {
        if (modoDeColocarPedra) {
            const rect = world.getBoundingClientRect();
            obstaculos.push(new Obstaculo(e.clientX - rect.left, e.clientY - rect.top));
        }
    });
    
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', (e) => { if (animalSendoArrastado) handleEnd(e); });
    window.addEventListener('touchend', (e) => { if (animalSendoArrastado) handleEnd(e); });

    function handleEnd(e) {
        if(animalSendoArrastado) {
             animalSendoArrastado.handleRelease(e)
        }
    }

    // === INICIALIZAÇÃO ===
    popularSetup();
    Telas.mostrar('menu');
});
