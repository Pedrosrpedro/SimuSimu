document.addEventListener('DOMContentLoaded', () => {
    // === DEFINIÇÕES GLOBAIS ===
    const DEFINICOES_ANIMAIS = {
        rato: { nome: 'Rato', come: ['racao', 'grama'], classeCss: 'rato' },
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
    const worldViewport = document.getElementById('world-viewport');
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
    const timeControlButtons = document.querySelectorAll('.btn-time');
    const logContainer = document.getElementById('log-container');
    const populationChartCtx = document.getElementById('populationChart').getContext('2d');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    let particleContainer;

    // === ELEMENTOS DO DOM (NOVOS) ===
    const mainInfoPanel = document.getElementById('main-info-panel');
    const inspectionPanel = document.getElementById('inspection-panel');
    const btnFecharInspecao = document.getElementById('btn-fechar-inspecao');

    // === VARIÁVEIS GLOBAIS DA SIMULAÇÃO ===
    let animais = [], comidas = [], aguas = [], obstaculos = [], abrigos = [];
    let tribos = [], carcacas = [];
    let simulaçãoAtiva = false, tempo = 0;
    const MAP_WIDTH = 800, MAP_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1, dayNightTimer = 0, isNight = false;
    let weatherTimer = 0, currentEvent = 'nenhum';
    let populationChart, logMessages = [], statsHistory = [];

    // === VARIÁVEIS DE INTERAÇÃO E UI ===
    let objetoSendoArrastado = null;
    let animalInspecionado = null;
    let isClickDrag = false;


    // === LÓGICA DE CLASSES ===

    class Tribe {
        constructor(fundador) {
            this.id = Date.now() + Math.random();
            this.nome = this.gerarNomeTribo();
            this.membros = [];
            this.lider = null;
            this.abrigo = fundador.abrigo;
            this.cor = `hsl(${Math.random() * 360}, 70%, 50%)`;
            this.recursos = { comida: 5 };
            this.territorioRaio = 150;
            this.diplomacia = {};

            this.elementoVisual = document.createElement('div');
            this.elementoVisual.className = 'territorio-visual';
            world.appendChild(this.elementoVisual);
            
            this.adicionarMembro(fundador, 'Lider');
            this.atualizarVisual();
            adicionarLog(`A ${this.nome} foi fundada!`, 'tribo');
        }

        gerarNomeTribo() {
            const prefixos = ["Clã", "Tribo", "Bando", "Família"];
            const sufixos = ["da Pedra", "do Riacho", "da Colina", "da Folha", "do Trovão", "do Sol"];
            return `${prefixos[Math.floor(Math.random() * prefixos.length)]} ${sufixos[Math.floor(Math.random() * sufixos.length)]}`;
        }

        adicionarMembro(animal, funcao = null) {
            if (this.membros.includes(animal) || (this.membros.length > 0 && animal.tipo !== this.membros[0].tipo)) return;

            this.membros.push(animal);
            animal.tribo = this;
            animal.element.style.setProperty('--cor-tribo', this.cor);
            
            if (funcao) animal.funcao = funcao;
            if (funcao === 'Lider') this.lider = animal;
            if (!animal.funcao) animal.funcao = 'Coletor';
            
            animal.atualizarVisualTribo();
        }

        removerMembro(animal) {
            this.membros = this.membros.filter(m => m.id !== animal.id);
            animal.tribo = null;
            animal.funcao = null;
            animal.element.style.removeProperty('--cor-tribo');
            animal.atualizarVisualTribo();

            if (animal === this.lider && this.membros.length > 0) {
                this.lider = this.membros[0];
                this.lider.funcao = 'Lider';
                adicionarLog(`${this.lider.nome} é o novo líder da ${this.nome}.`, 'tribo');
            }
            if (this.membros.length === 0) {
                this.dissolver();
            }
        }
        
        atualizarTribo() {
            if (this.membros.length === 0) return;
            if (Math.random() < 0.05) this.atribuirFuncoes();
            this.expandirTerritorio();
            this.atualizarDiplomacia();
            this.atualizarVisual();
        }

        atribuirFuncoes() {
            const guerreirosDesejados = Math.floor(this.membros.length / 4);
            let guerreirosAtuais = this.membros.filter(m => m.funcao === 'Guerreiro').length;

            for (const membro of this.membros.filter(m => m.funcao !== 'Lider')) {
                if (guerreirosAtuais < guerreirosDesejados) {
                    if(membro.funcao !== 'Guerreiro') {
                        membro.funcao = 'Guerreiro';
                        guerreirosAtuais++;
                    }
                } else {
                    if(membro.funcao === 'Guerreiro') {
                       membro.funcao = 'Coletor';
                       guerreirosAtuais--;
                    }
                }
            }
        }

        expandirTerritorio() {
            const raioDesejado = 100 + this.membros.length * 10;
            if (this.territorioRaio < raioDesejado) {
                this.territorioRaio += 0.1;
            }
        }
        
        atualizarDiplomacia() {
             for (const outraTribo of tribos) {
                if (outraTribo.id === this.id) continue;
                const dist = Math.hypot(this.abrigo.x - outraTribo.abrigo.x, this.abrigo.y - outraTribo.abrigo.y);
                const estaoEmConflito = dist < this.territorioRaio + outraTribo.territorioRaio;

                if (estaoEmConflito && this.diplomacia[outraTribo.id] !== 'GUERRA') {
                    this.diplomacia[outraTribo.id] = 'GUERRA';
                    outraTribo.diplomacia[this.id] = 'GUERRA';
                    adicionarLog(`Guerra declarada entre ${this.nome} e ${outraTribo.nome}!`, 'guerra');
                }
            }
        }

        anexarTribo(triboPerdedora) {
            adicionarLog(`A ${this.nome} anexou os remanescentes da ${triboPerdedora.nome}!`, 'guerra');
            const membrosRestantes = [...triboPerdedora.membros];
            for (const membro of membrosRestantes) {
                this.adicionarMembro(membro);
            }
            triboPerdedora.dissolver();
        }

        atualizarVisual() {
            this.elementoVisual.style.display = 'block';
            this.elementoVisual.style.width = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.height = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.left = `${this.abrigo.x + (this.abrigo.width / 2) - this.territorioRaio}px`;
            this.elementoVisual.style.top = `${this.abrigo.y + (this.abrigo.height / 2) - this.territorioRaio}px`;
            this.elementoVisual.style.borderColor = this.cor;
        }

        dissolver() {
            if (!this.foiRemovido) {
                adicionarLog(`A ${this.nome} foi desfeita.`, 'tribo');
                this.foiRemovido = true;
                this.membros.forEach(m => { if (m) { m.tribo = null; m.estado = 'Vagando'; }});
                if (this.abrigo) { this.abrigo.remover(); abrigos = abrigos.filter(ab => ab.id !== this.abrigo.id); }
                if (this.elementoVisual.parentElement) world.removeChild(this.elementoVisual);
                tribos = tribos.filter(t => t.id !== this.id);
            }
        }
    }

    class Entidade {
        constructor(x, y, classeCss) {
            this.element = document.createElement('div');
            this.element.className = `entity ${classeCss}`;
            this.x = x ?? Math.random() * (MAP_WIDTH - 50);
            this.y = y ?? Math.random() * (MAP_HEIGHT - 50);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            world.appendChild(this.element);
            this.width = this.element.offsetWidth;
            this.height = this.element.offsetHeight;
            this.element.entidade = this;
            this.id = Date.now() + Math.random();
            this.foiRemovido = false;
        }
        remover() {
            if (this.element.parentElement && !this.foiRemovido) {
                world.removeChild(this.element);
                this.foiRemovido = true;
            }
        }
    }

    class Obstaculo extends Entidade { constructor(x, y) { super(x, y, 'pedra'); } }
    class Comida extends Entidade { constructor(tipo, x, y) { super(x, y, DEFINICOES_COMIDAS[tipo].classeCss + ' comida'); this.tipo = tipo; } }
    class Agua extends Entidade { constructor() { super(null, null, 'agua'); } refill() { this.element.style.transition = 'transform 0.2s'; this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); } }
    class Abrigo extends Entidade { constructor(x, y) { super(x, y, 'abrigo'); } }

    class Carcaca extends Entidade {
        constructor(x, y) { super(x, y, 'carcaca'); this.nutrientes = 100; this.timerDecomposicao = 400; }
        atualizar() {
            this.timerDecomposicao--;
            this.element.style.opacity = this.timerDecomposicao / 400;
            if (this.timerDecomposicao <= 0 || this.nutrientes <= 0) {
                this.remover();
                carcacas = carcacas.filter(c => c.id !== this.id);
            }
        }
    }

    class Animal extends Entidade {
        constructor(tipo, x, y) {
            super(x, y, DEFINICOES_ANIMAIS[tipo].classeCss + ' animal');
            Object.assign(this, {
                tipo, nome: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} #${Math.floor(Math.random()*1000)}`,
                fome: 20, sede: 20, age: 0, reproductionUrge: 0,
                velocidade: 2.5 + Math.random(), isMature: false, maxAge: 80 + Math.random() * 40,
                gender: Math.random() > 0.5 ? 'male' : 'female', isGestating: false, gestationTimer: 0,
                alvo: null, estado: 'Vagando', abrigo: null, frio: 0, oQueCome: DEFINICOES_ANIMAIS[tipo].come,
                tribo: null, funcao: null, itemCarregado: null, vagarAlvo: null
            });
            this.element.classList.add('filhote');
            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer);
        }

        atualizar() {
            if (this.foiRemovido || objetoSendoArrastado === this) return;

            this.age += 0.05 * currentSpeedMultiplier; this.fome += 0.2 * currentSpeedMultiplier; this.sede += 0.25 * currentSpeedMultiplier;
            if (this.isMature) this.reproductionUrge += 0.3 * currentSpeedMultiplier;
            if (currentEvent === 'nevasca' && !this.estaNoAbrigo()) this.frio += 0.4; else this.frio = Math.max(0, this.frio - 0.2);
            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge || this.frio >= 100) { this.morrer(); return; }
            if (!this.isMature && this.age > 20) { this.isMature = true; this.element.classList.remove('filhote'); }
            if (this.isGestating) { this.gestationTimer--; if(this.gestationTimer <= 0) this.darALuz(); }
            
            this.decidirAcao();
            if (this.alvo) { this.moverParaAlvo(this.alvo); }

            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            this.atualizarUI();
        }

        decidirAcao() {
             if (this.tribo) {
                if (this.itemCarregado) { this.estado = 'Levando para o abrigo'; this.alvo = this.tribo.abrigo; return; }
                
                switch (this.funcao) {
                    case 'Lider':
                        if (this.isMature && this.gender === 'female' && !this.isGestating && this.reproductionUrge > 50) {
                            const parceiro = this.encontrarMaisProximo(this.tribo.membros.filter(m => m.gender === 'male' && m.isMature));
                            if (parceiro) { this.estado = 'Procurando parceiro'; this.alvo = parceiro; return; }
                        }
                        this.estado = 'Protegendo o lar'; this.alvo = null; this.vagarPertoDoAbrigo(); return;

                    case 'Guerreiro':
                        const inimigo = this.encontrarInimigo();
                        if (inimigo) { this.estado = 'Atacando inimigo'; this.alvo = inimigo; return; }
                        this.estado = 'Patrulhando'; this.alvo = null; this.vagarPelaBorda(); return;

                    case 'Coletor':
                        if (this.sede > 60) { this.estado = 'Buscando Água'; this.alvo = this.encontrarMaisProximo(aguas); return; }
                        if (this.fome > 70 && this.tribo.recursos.comida > 0) { this.estado = 'Comendo no abrigo'; this.alvo = this.tribo.abrigo; return; }
                        if (this.tribo.recursos.comida < this.tribo.membros.length * 2) { this.estado = 'Coletando Comida'; this.alvo = this.encontrarComida(); return; }
                        this.estado = 'Descansando'; this.alvo = this.tribo.abrigo; return;
                }
            } else {
                if (this.fome > 50) { this.estado = 'Buscando Comida'; this.alvo = this.encontrarComida(); return; }
                if (this.sede > 60) { this.estado = 'Buscando Água'; this.alvo = this.encontrarMaisProximo(aguas); return; }
                if (!this.abrigo && this.isMature) { this.estado = "Construindo abrigo"; this.alvo = { x: this.x, y: this.y, construindo: true }; return; }
                this.estado = 'Vagando'; this.alvo = null; this.vagar();
            }
        }

        moverParaAlvo(alvo) {
            if (!alvo || alvo.foiRemovido) { this.alvo = null; return; }
            const distMin = this.estado === 'Atacando inimigo' ? 20 : 10;
            const dx = alvo.x - this.x, dy = alvo.y - this.y, d = Math.hypot(dx, dy);
            if (d < distMin) { this.interagirComAlvo(); return; }

            let nX = this.x + (dx / d) * this.velocidade;
            let nY = this.y + (dy / d) * this.velocidade;
            if (!this.checarColisao(nX, nY)) { this.x = nX; this.y = nY; } else { this.alvo = null; this.vagarAlvo = null; }
        }

        interagirComAlvo() {
            if (!this.alvo) return;
            switch(this.estado) {
                case 'Atacando inimigo':
                    this.alvo.morrer('combate', this.tribo);
                    adicionarLog(`${this.nome} da ${this.tribo.nome} derrotou um inimigo!`, 'guerra');
                    break;
                case 'Coletando Comida':
                     if(this.alvo instanceof Comida){
                        this.itemCarregado = this.alvo.tipo; this.alvo.remover();
                        comidas = comidas.filter(c => c.id !== this.alvo.id);
                        this.alvo = this.tribo.abrigo; this.estado = 'Levando para o abrigo';
                     }
                     break;
                case 'Levando para o abrigo':
                    if (this.tribo) { this.tribo.recursos.comida++; this.itemCarregado = null; }
                    break;
                case 'Comendo no abrigo':
                    if (this.tribo && this.tribo.recursos.comida > 0) { this.tribo.recursos.comida--; this.fome = Math.max(0, this.fome - 80); }
                    break;
                case 'Construindo abrigo':
                    this.abrigo = new Abrigo(this.x, this.y); abrigos.push(this.abrigo);
                    this.tribo = new Tribe(this); tribos.push(this.tribo);
                    break;
                case 'Procurando parceiro':
                    if (this.alvo instanceof Animal) { this.isGestating = true; this.gestationTimer = 150; this.reproductionUrge = 0; }
                    break;
                 case 'Buscando Água': if (this.alvo instanceof Agua) { this.sede = Math.max(0, this.sede - 70); this.alvo.refill?.(); } break;
                 case 'Buscando Comida': if (this.alvo instanceof Comida) { this.fome = Math.max(0, this.fome - 60); this.alvo.remover(); comidas = comidas.filter(c => c.id !== this.alvo.id); } break;
            }
            this.alvo = null;
        }

        morrer(causa = 'causas naturais', atacanteTribe = null) {
            if (this.foiRemovido) return;
            const causaDaMorte = (this.fome >= 100 ? 'fome' : this.sede >= 100 ? 'sede' : this.frio >= 100 ? 'frio' : this.age >= this.maxAge ? 'velhice' : causa);
            adicionarLog(`${this.nome} (${this.tipo}) morreu de ${causaDaMorte}.`, 'morte');
            this.foiRemovido = true;
            
            carcacas.push(new Carcaca(this.x, this.y));
            const oldTribe = this.tribo;

            if (oldTribe) {
                oldTribe.removerMembro(this);
            }
            
            // LÓGICA DE ANEXAÇÃO
            if (this.funcao === 'Lider' && causa === 'combate' && atacanteTribe && oldTribe && oldTribe.membros.length < 3) {
                 if (Math.random() < 0.5) { // 50% de chance de anexar tribo enfraquecida
                    atacanteTribe.anexarTribo(oldTribe);
                 }
            }
            
            animais = animais.filter(a => a.id !== this.id);
            this.remover();
        }

        darALuz() {
            this.isGestating = false;
            const n = Math.floor(Math.random() * 2) + 1;
            adicionarLog(`${this.nome} deu à luz a ${n} filhote(s)!`, 'nascimento');
            for(let i=0; i<n; i++) {
                const filhote = new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10));
                if (this.tribo) this.tribo.adicionarMembro(filhote);
                animais.push(filhote);
            }
        }
        
        vagar() {
            if (!this.vagarAlvo || Math.hypot(this.vagarAlvo.x - this.x, this.vagarAlvo.y - this.y) < 10 || Math.random() < 0.01) {
                this.vagarAlvo = { x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT };
            }
            this.alvo = this.vagarAlvo;
        }
        vagarPertoDoAbrigo() {
            if (!this.tribo || !this.tribo.abrigo) { this.vagar(); return; }
            if (!this.vagarAlvo || Math.hypot(this.vagarAlvo.x - this.x, this.vagarAlvo.y - this.y) < 10 || Math.random() < 0.05) {
                this.vagarAlvo = {
                    x: this.tribo.abrigo.x + (Math.random() - 0.5) * 100,
                    y: this.tribo.abrigo.y + (Math.random() - 0.5) * 100
                };
            }
            this.alvo = this.vagarAlvo;
        }
        vagarPelaBorda() {
            if (!this.tribo || !this.tribo.abrigo) { this.vagar(); return; }
            if (!this.vagarAlvo || Math.hypot(this.vagarAlvo.x - this.x, this.vagarAlvo.y - this.y) < 10 || Math.random() < 0.05) {
                const angulo = Math.random() * 2 * Math.PI;
                this.vagarAlvo = {
                    x: this.tribo.abrigo.x + Math.cos(angulo) * this.tribo.territorioRaio,
                    y: this.tribo.abrigo.y + Math.sin(angulo) * this.tribo.territorioRaio
                };
            }
            this.alvo = this.vagarAlvo;
        }
        
        checarColisao(x, y) { for (const o of obstaculos) { const b = o.getBounds(); if (x < b.right && x + this.width > b.left && y < b.bottom && y + this.height > b.top) return true; } return false; }
        encontrarComida() { return this.encontrarMaisProximo(comidas.filter(c => this.oQueCome.includes(c.tipo))); }
        encontrarInimigo() { return this.encontrarMaisProximo(animais.filter(a => a.tribo && this.tribo && a.tribo.id !== this.tribo.id && this.tribo.diplomacia[a.tribo.id] === 'GUERRA')); }
        encontrarMaisProximo(lista) { return lista.reduce((maisProximo, atual) => { if (!atual || atual === this || atual.foiRemovido) return maisProximo; const d = Math.hypot(this.x - atual.x, this.y - atual.y); if (!maisProximo || d < maisProximo.dist) return { alvo: atual, dist: d }; return maisProximo; }, null)?.alvo; }

        atualizarUI() {
            const bemEstar = 100 - Math.max(this.fome, this.sede, this.frio);
            this.healthBarFill.style.width = `${bemEstar}%`;
            if (bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green';
            else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow';
            else this.healthBarFill.className = 'health-bar-fill health-red';
        }
        estaNoAbrigo() { return this.abrigo && Math.hypot(this.x - this.abrigo.x, this.y - this.abrigo.y) < 15; }
        atualizarVisualTribo() { this.element.classList.toggle('modo-territorio-animal', !!this.tribo); }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [t, d] of Object.entries(DEFINICOES_ANIMAIS)) { const g = document.createElement('div'); g.className = 'animal-input-group'; g.innerHTML = `<label for="num-${t}">${d.nome}:</label><input type="number" id="num-${t}" data-tipo="${t}" value="2" min="0" max="20">`; animalSelectionDiv.appendChild(g); } }
    
    function iniciar() {
        world.innerHTML = '<div id="world-overlay"></div><div id="particle-container"></div>';
        particleContainer = document.getElementById('particle-container');
        world.style.width = `${MAP_WIDTH}px`; world.style.height = `${MAP_HEIGHT}px`;
        world.style.transform = '';

        [...animais, ...comidas, ...aguas, ...obstaculos, ...abrigos, ...carcacas, ...tribos.map(t=>t.elementoVisual)].forEach(e => e.remover ? e.remover() : e.remove());
        tribos.forEach(t => t.dissolver());

        animais = []; comidas = []; aguas = []; obstaculos = []; abrigos = []; tribos = []; carcacas = [];
        tempo = 0; statsHistory = []; logMessages = []; logContainer.innerHTML = ''; currentEvent = 'nenhum';
        
        world.className = `world world-${scenarioSelect.value}`;
        for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua());
        for(let i=0; i<parseInt(numComidaInput.value); i++) comidas.push(new Comida('grama'));
        animalSelectionDiv.querySelectorAll('input').forEach(i => { for(let j=0; j<parseInt(i.value); j++) { if (i.value > 0) animais.push(new Animal(i.dataset.tipo)); } });
        
        setupChart(); setGameSpeed(1); Telas.mostrar('game'); adicionarLog("A simulação começou!", "info");
    }

    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1 * currentSpeedMultiplier;
        
        [...tribos].forEach(t => t.atualizarTribo());
        [...animais].forEach(a => a.atualizar());
        [...carcacas].forEach(c => c.atualizar());
        
        worldViewport.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD);
        populacaoTotalSpan.textContent = animais.length;
        tempoSpan.textContent = tempo.toFixed(1);
        const c = {}; animais.forEach(a => c[a.tipo] = (c[a.tipo] || 0) + 1);
        animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([t, d]) => `<span>${d.nome}: ${c[t] || 0}</span>`).join('<br>');
        
        if (animais.length === 0 && tempo > 10) finalizarSimulacao('extinção');
        if (Math.floor(tempo) % 2 === 0 && (!statsHistory.length || statsHistory[statsHistory.length-1].tempo !== Math.floor(tempo))) { updateChart(); }
        if (animalInspecionado) atualizarPainelInspecao();
    }

    function finalizarSimulacao(motivo) {
        setGameSpeed(0);
        if (motivo === 'extinção') {
            adicionarLog('A VIDA FOI EXTINTA!', 'morte');
            alert('A simulação terminou por extinção!');
        }
    }

    function resetar() {
        finalizarSimulacao('reset');
        fecharPainelInspecao();
        Telas.mostrar('menu');
    }

    function setGameSpeed(m) {
        clearInterval(gameInterval);
        currentSpeedMultiplier = m;
        simulaçãoAtiva = m > 0;
        if (simulaçãoAtiva) {
            gameInterval = setInterval(gameLoop, 100);
        }
        document.querySelectorAll('.btn-time').forEach(b => { b.classList.toggle('active', parseFloat(b.dataset.speed) === m); });
    }
    
    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => alert(`Erro: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    }

    function adicionarLog(mensagem, tipo = 'info') {
        const timestamp = tempo.toFixed(1);
        const logEntry = document.createElement('div');
        const icon = document.createElement('i');
        const iconMap = {
            nascimento: 'fa-solid fa-baby', morte: 'fa-solid fa-skull-crossbones',
            guerra: 'fa-solid fa-shield-halved', clima: 'fa-solid fa-cloud-sun',
            tribo: 'fa-solid fa-users', info: 'fa-solid fa-circle-info'
        };
        icon.className = iconMap[tipo];
        
        logEntry.className = `log-entry-${tipo}`;
        logEntry.appendChild(icon);
        logEntry.innerHTML += `<span>[${timestamp}s]</span> ${mensagem}`;
        logContainer.prepend(logEntry);
        if (logContainer.children.length > 50) logContainer.lastChild.remove();
    }

    function mostrarPainelInspecao(animal) {
        animalInspecionado = animal;
        mainInfoPanel.classList.add('hidden');
        inspectionPanel.classList.remove('hidden');
        atualizarPainelInspecao();
    }

    function fecharPainelInspecao() {
        animalInspecionado = null;
        mainInfoPanel.classList.remove('hidden');
        inspectionPanel.classList.add('hidden');
    }

    function atualizarPainelInspecao() {
        if (!animalInspecionado || animalInspecionado.foiRemovido) { fecharPainelInspecao(); return; }
        document.getElementById('inspect-nome').textContent = animalInspecionado.nome;
        document.getElementById('inspect-especie').textContent = animalInspecionado.tipo.charAt(0).toUpperCase() + animalInspecionado.tipo.slice(1);
        document.getElementById('inspect-idade').textContent = animalInspecionado.age.toFixed(1) + 's';
        document.getElementById('inspect-tribo').textContent = animalInspecionado.tribo ? animalInspecionado.tribo.nome : 'Nenhuma';
        document.getElementById('inspect-funcao').textContent = animalInspecionado.funcao || 'Nenhuma';
        document.getElementById('inspect-fome').style.width = `${100 - animalInspecionado.fome}%`;
        document.getElementById('inspect-sede').style.width = `${100 - animalInspecionado.sede}%`;
        document.getElementById('inspect-frio').style.width = `${animalInspecionado.frio}%`;
    }

    function setupChart() {
        if(populationChart) populationChart.destroy();
        const animalTypes = Object.keys(DEFINICOES_ANIMAIS);
        const datasets = animalTypes.map(tipo => {
            const color = tipo === 'rato' ? 'rgba(136, 136, 136, 0.8)' : 'rgba(212, 163, 115, 0.8)';
            const borderColor = tipo === 'rato' ? 'rgba(136, 136, 136, 1)' : 'rgba(212, 163, 115, 1)';
            return { label: DEFINICOES_ANIMAIS[tipo].nome, data: [], borderColor, backgroundColor: color, tension: 0.1 };
        });
        datasets.push({
            label: 'Idade Média', data: [], borderColor: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'rgba(255, 255, 255, 0.2)', yAxisID: 'y1', tension: 0.1
        });
        populationChart = new Chart(populationChartCtx, {
            type: 'line', data: { labels: [], datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'População' } },
                    y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, title: { display: true, text: 'Idade Média (s)' }, grid: { drawOnChartArea: false } },
                    x: { title: { display: true, text: 'Tempo (s)' } }
                }
            }
        });
    }

    function updateChart() {
        const t = Math.floor(tempo);
        const idadeMedia = animais.length > 0 ? animais.reduce((sum, a) => sum + a.age, 0) / animais.length : 0;
        statsHistory.push({
            tempo: t,
            counts: Object.keys(DEFINICOES_ANIMAIS).reduce((acc, tipo) => { acc[tipo] = animais.filter(a => a.tipo === tipo).length; return acc; }, {}),
            idadeMedia: idadeMedia
        });
        populationChart.data.labels = statsHistory.map(h => h.tempo);
        populationChart.data.datasets.forEach(dataset => {
            if (dataset.label === 'Idade Média') dataset.data = statsHistory.map(h => h.idadeMedia);
            else { const tipo = Object.keys(DEFINICOES_ANIMAIS).find(k => DEFINICOES_ANIMAIS[k].nome === dataset.label); dataset.data = statsHistory.map(h => h.counts[tipo]); }
        });
        populationChart.update();
    }

    // === EVENT LISTENERS ===
    btnNovaSimulacao.addEventListener('click', () => Telas.mostrar('setup'));
    btnVoltarMenu.addEventListener('click', () => Telas.mostrar('menu'));
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);
    btnFullscreen.addEventListener('click', toggleFullScreen);
    timeControlButtons.forEach(b => { b.addEventListener('click', () => setGameSpeed(parseFloat(b.dataset.speed))); });
    btnFecharInspecao.addEventListener('click', fecharPainelInspecao);

    worldViewport.addEventListener('mousedown', (e) => {
        isClickDrag = false;
        if (e.target.entidade instanceof Animal) objetoSendoArrastado = e.target.entidade;
    });
    window.addEventListener('mousemove', (e) => {
        if (objetoSendoArrastado) {
            isClickDrag = true;
            objetoSendoArrastado.element.classList.add('dragging');
            const rect = worldViewport.getBoundingClientRect();
            objetoSendoArrastado.x = e.clientX - rect.left - (objetoSendoArrastado.width / 2);
            objetoSendoArrastado.y = e.clientY - rect.top - (objetoSendoArrastado.height / 2);
        }
    });
    window.addEventListener('mouseup', () => {
        if (objetoSendoArrastado && !isClickDrag) mostrarPainelInspecao(objetoSendoArrastado);
        if (objetoSendoArrastado) { objetoSendoArrastado.element.classList.remove('dragging'); objetoSendoArrastado = null; }
    });

    // === INICIALIZAÇÃO DO JOGO ===
    popularSetup();
    Telas.mostrar('menu');
});
