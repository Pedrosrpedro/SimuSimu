document.addEventListener('DOMContentLoaded', () => {
    // === DEFINIÇÕES GLOBAIS DE ANIMAIS E COMIDAS ===
    const DEFINICOES_ANIMAIS = {
        rato: { nome: 'Rato', come: ['racao'], classeCss: 'rato' },
        coelho: { nome: 'Coelho', come: ['grama'], classeCss: 'coelho' },
    };
    const DEFINICOES_COMIDAS = {
        racao: { nome: 'Ração', classeCss: 'racao' },
        grama: { nome: 'Grama', classeCss: 'grama' },
    };

    // === GERENCIADOR DE TELAS ===
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
    const btnNovaSimulacao = document.getElementById('btn-nova-simulacao');
    const scenarioSelect = document.getElementById('scenario');
    const numComidaInput = document.getElementById('numComida');
    const numAguaInput = document.getElementById('numAgua');
    const animalSelectionDiv = document.getElementById('animal-selection');
    const iniciarSimulacaoBtn = document.getElementById('iniciarSimulacao');
    const btnVoltarMenu = document.getElementById('btn-voltar-menu');
    const world = document.getElementById('world');
    const populacaoTotalSpan = document.getElementById('populacaoTotal');
    const tempoSpan = document.getElementById('tempo');
    const animalCountsDiv = document.getElementById('animal-counts');
    const resetarSimulacaoBtn = document.getElementById('resetarSimulacao');

    // === VARIÁVEIS GLOBAIS DA SIMULAÇÃO ===
    let simulaçãoAtiva = false;
    let gameInterval;
    let tempo = 0;
    let animais = [];
    let comidas = [];
    let aguas = [];
    
    // CORREÇÃO: Definir dimensões fixas para evitar o bug do mundo invisível
    const WORLD_WIDTH = 800;
    const WORLD_HEIGHT = 600;

    // === LÓGICA DE CLASSES ===

    class Entidade {
        constructor(x, y, classeCss) {
            this.element = document.createElement('div');
            this.element.className = `entity ${classeCss}`;
            // CORREÇÃO: Usar as dimensões fixas
            this.x = x ?? Math.random() * (WORLD_WIDTH - 50);
            this.y = y ?? Math.random() * (WORLD_HEIGHT - 50);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            world.appendChild(this.element);
        }
        remover() {
            if (this.element.parentElement) {
                world.removeChild(this.element);
            }
            this.foiRemovido = true;
        }
    }

    class Comida extends Entidade {
        constructor(tipo) {
            super(null, null, DEFINICOES_COMIDAS[tipo].classeCss + ' comida');
            this.tipo = tipo;
        }
    }

    class Agua extends Entidade {
        constructor() {
            super(null, null, 'bebedouro agua');
        }
    }

    class Animal extends Entidade {
        constructor(tipo, x, y) {
            const definicao = DEFINICOES_ANIMAIS[tipo];
            super(x, y, definicao.classeCss + ' animal filhote');
            this.tipo = tipo;
            this.oQueCome = definicao.come;
            
            this.fome = 20; this.sede = 20; this.age = 0; this.reproductionUrge = 0;
            this.velocidade = 1.5 + Math.random();
            this.isMature = false;
            this.maxAge = 80 + Math.random() * 40;
            this.gender = Math.random() > 0.5 ? 'male' : 'female';
            this.isGestating = false; this.gestationTimer = 0;
            
            this.lastKnownFoodLocation = null; this.lastKnownWaterLocation = null;
            this.alvo = null; this.estado = 'vagando';
        }

        atualizar() {
            if (this.foiRemovido) return;

            // Envelhecimento e necessidades
            this.age += 0.02;
            this.fome += 0.1;
            this.sede += (scenarioSelect.value === 'deserto' ? 0.22 : 0.15);
            if (this.isMature) this.reproductionUrge += 0.2;

            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge) {
                this.morrer();
                return;
            }
            
            // Maturidade
            if (!this.isMature && this.age > 20) {
                this.isMature = true;
                this.element.classList.remove('filhote');
            }

            // Gestação e Ações
            if (this.isGestating) {
                this.gestationTimer--;
                if (this.gestationTimer <= 0) this.darALuz();
            } else {
                this.decidirAcao();
                if (this.alvo) this.moverParaAlvo();
                else this.vagar();
            }
            
            // Update Visual
            this.element.style.opacity = Math.max(0.3, (100 - Math.max(this.fome, this.sede)) / 100);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
        }
        
        decidirAcao() {
            if (this.sede > 60) { this.alvo = this.encontrarMaisProximo(aguas); this.estado = 'buscandoAgua'; return; }
            if (this.fome > 50) { this.alvo = this.encontrarComida(); this.estado = 'buscandoComida'; return; }
            if (this.isMature && this.gender === 'female' && this.reproductionUrge > 70 && this.fome < 40 && this.sede < 40) {
                const parceiro = this.encontrarMaisProximo(animais.filter(a => a.tipo === this.tipo && a.isMature && a.gender === 'male' && !a.isGestating));
                if(parceiro) {
                    this.alvo = parceiro;
                    this.estado = 'buscandoParceiro';
                }
                return;
            }
            if (this.sede > 30 && this.lastKnownWaterLocation) { this.alvo = this.lastKnownWaterLocation; this.estado = 'buscandoAgua'; return; }
            if (this.fome > 30 && this.lastKnownFoodLocation) { this.alvo = this.lastKnownFoodLocation; this.estado = 'buscandoComida'; return; }
            
            this.estado = 'vagando'; this.alvo = null;
        }

        encontrarComida() {
            const comidasCompativeis = comidas.filter(c => this.oQueCome.includes(c.tipo));
            return this.encontrarMaisProximo(comidasCompativeis);
        }

        encontrarMaisProximo(lista) {
            return lista.reduce((maisProximo, alvo) => {
                if (!alvo || alvo === this || alvo.foiRemovido) return maisProximo;
                const dist = Math.hypot(this.x - alvo.x, this.y - alvo.y);
                if (!maisProximo || dist < maisProximo.dist) {
                    return { alvo: alvo, dist: dist };
                }
                return maisProximo;
            }, null)?.alvo;
        }
        
        moverParaAlvo() {
            if (!this.alvo || this.alvo.foiRemovido) { this.alvo = null; return; }
            const alvoX = this.alvo.x; const alvoY = this.alvo.y;
            const dx = alvoX - this.x; const dy = alvoY - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 15) { this.interagirComAlvo(); } 
            else {
                this.x += (dx / dist) * this.velocidade;
                this.y += (dy / dist) * this.velocidade;
            }
        }
        
        interagirComAlvo() {
            switch(this.estado) {
                case 'buscandoComida':
                    this.fome = Math.max(0, this.fome - 60);
                    this.lastKnownFoodLocation = { x: this.alvo.x, y: this.alvo.y, foiRemovido: true };
                    this.alvo.remover();
                    comidas = comidas.filter(c => c !== this.alvo);
                    break;
                case 'buscandoAgua':
                    this.sede = Math.max(0, this.sede - 70);
                    this.lastKnownWaterLocation = { x: this.alvo.x, y: this.alvo.y };
                    break;
                case 'buscandoParceiro':
                    if(this.alvo?.isMature) {
                        this.isGestating = true;
                        this.gestationTimer = 150;
                        this.reproductionUrge = 0;
                    }
                    break;
            }
            this.alvo = null;
        }
        
        vagar() {
            if (!this.vagarAlvo || Math.random() < 0.05) {
                this.vagarAlvo = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
            }
            const dx = this.vagarAlvo.x - this.x; const dy = this.vagarAlvo.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 20) { this.vagarAlvo = null; } 
            else { this.x += (dx / dist) * (this.velocidade / 2); this.y += (dy / dist) * (this.velocidade / 2); }
        }

        darALuz() {
            this.isGestating = false;
            const numFilhotes = Math.floor(Math.random() * 3) + 1;
            for(let i=0; i<numFilhotes; i++) {
                animais.push(new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10)));
            }
        }
        morrer() {
            this.foiRemovido = true;
            animais = animais.filter(a => a !== this);
            this.element.style.transform = 'rotate(180deg)';
            this.element.style.opacity = '0.4';
            this.element.style.zIndex = '1';
        }
    }
    
    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    function popularSetup() {
        animalSelectionDiv.innerHTML = '';
        for (const [tipo, def] of Object.entries(DEFINICOES_ANIMAIS)) {
            const group = document.createElement('div');
            group.className = 'animal-input-group';
            group.innerHTML = `
                <label for="num-${tipo}">${def.nome}:</label>
                <input type="number" id="num-${tipo}" data-tipo="${tipo}" value="2" min="0" max="20">
            `;
            animalSelectionDiv.appendChild(group);
        }
    }

    function iniciar() {
        world.innerHTML = '';
        animais = []; comidas = []; aguas = []; tempo = 0;

        world.className = `world-${scenarioSelect.value}`;
        
        for(let i=0; i<numAguaInput.value; i++) aguas.push(new Agua());
        
        const tiposAnimaisSelecionados = Array.from(animalSelectionDiv.querySelectorAll('input'))
            .filter(input => parseInt(input.value) > 0).map(input => input.dataset.tipo);
        
        if (tiposAnimaisSelecionados.length > 0) {
            let comidaCount = 0;
            const totalComida = parseInt(numComidaInput.value);
            while(comidaCount < totalComida) {
                tiposAnimaisSelecionados.forEach(tipoAnimal => {
                    if (comidaCount >= totalComida) return;
                    const tipoComida = DEFINICOES_ANIMAIS[tipoAnimal].come[0];
                    comidas.push(new Comida(tipoComida));
                    comidaCount++;
                });
            }
        }

        animalSelectionDiv.querySelectorAll('input').forEach(input => {
            const tipo = input.dataset.tipo;
            for(let i=0; i<input.value; i++) {
                animais.push(new Animal(tipo));
            }
        });
        
        simulaçãoAtiva = true;
        Telas.mostrar('game');
        gameInterval = setInterval(gameLoop, 100);
    }

    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1;
        
        [...animais].forEach(animal => animal.atualizar());

        populacaoTotalSpan.textContent = animais.length;
        tempoSpan.textContent = tempo.toFixed(1);
        
        const counts = {};
        animais.forEach(a => counts[a.tipo] = (counts[a.tipo] || 0) + 1);
        animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS)
            .map(([tipo, def]) => `<span>${def.nome}: ${counts[tipo] || 0}</span>`)
            .join('<br>');

        if (animais.length === 0 && tempo > 1) {
            finalizarSimulacao('extinção');
        }
    }

    function finalizarSimulacao(motivo) {
        simulaçãoAtiva = false;
        clearInterval(gameInterval);
        if (motivo === 'extinção') {
            alert(`A simulação terminou! A vida foi extinta em ${tempo.toFixed(1)} segundos.`);
        }
    }

    function resetar() {
        finalizarSimulacao('reset');
        Telas.mostrar('menu');
    }

    // === EVENT LISTENERS ===
    btnNovaSimulacao.addEventListener('click', () => Telas.mostrar('setup'));
    btnVoltarMenu.addEventListener('click', () => Telas.mostrar('menu'));
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);

    // === INICIALIZAÇÃO ===
    popularSetup();
    Telas.mostrar('menu');
});
