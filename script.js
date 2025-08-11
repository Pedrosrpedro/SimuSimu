document.addEventListener('DOMContentLoaded', () => {
    // === ELEMENTOS DO DOM ===
    const setupContainer = document.getElementById('setup-container');
    const scenarioSelect = document.getElementById('scenario');
    const numRatosInput = document.getElementById('numRatos');
    const numRacoesInput = document.getElementById('numRacoes');
    const numBebedourosInput = document.getElementById('numBebedouros');
    const iniciarSimulacaoBtn = document.getElementById('iniciarSimulacao');
    
    const gameContainer = document.getElementById('game-container');
    const world = document.getElementById('world');
    const ratosVivosSpan = document.getElementById('ratosVivos');
    const tempoSpan = document.getElementById('tempo');
    const adicionarComidaBtn = document.getElementById('adicionarComida');
    const resetarSimulacaoBtn = document.getElementById('resetarSimulacao');
    
    // === CONSTANTES E VARIÁVEIS GLOBAIS ===
    let simulaçãoAtiva = false;
    let gameInterval;
    let tempo = 0;
    const WORLD_WIDTH = 800;
    const WORLD_HEIGHT = 600;

    let ratos = [];
    let racoes = [];
    let bebedouros = [];
    
    // Parâmetros da Simulação
    const FOME_POR_TICK = 0.1;
    let SEDE_POR_TICK = 0.15; // Pode mudar com o cenário
    const REPRODUCAO_POR_TICK = 0.2;
    const IDADE_POR_TICK = 0.02;
    const IDADE_MATURIDADE = 20;
    const VIDA_MAXIMA = 100; // Anos de simulação
    const GESTACAO_DURACAO = 150; // Em ticks de tempo

    class Entidade {
        constructor(className) {
            this.element = document.createElement('div');
            this.element.className = className;
            this.x = Math.random() * (WORLD_WIDTH - 50);
            this.y = Math.random() * (WORLD_HEIGHT - 50);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            world.appendChild(this.element);
        }

        remover() {
            if (this.element.parentElement) {
                world.removeChild(this.element);
            }
        }
    }

    class Rato extends Entidade {
        constructor() {
            super('rato');
            this.element.classList.add('filhote'); // Começa como filhote
            
            // Atributos básicos
            this.fome = 20;
            this.sede = 20;
            this.velocidade = 2;

            // Envelhecimento
            this.age = 0;
            this.maxAge = VIDA_MAXIMA * (0.8 + Math.random() * 0.4); // Variação de 20% na vida máxima
            this.isMature = false;

            // Reprodução
            this.gender = Math.random() > 0.5 ? 'male' : 'female';
            this.reproductionUrge = 0;
            this.isGestating = false;
            this.gestationTimer = 0;

            // IA (Memória)
            this.lastKnownFoodLocation = null;
            this.lastKnownWaterLocation = null;

            this.alvo = null;
            this.estado = 'vagando';
        }

        atualizar() {
            // --- ATUALIZAÇÃO DE STATUS ---
            this.age += IDADE_POR_TICK;
            this.fome += FOME_POR_TICK;
            this.sede += SEDE_POR_TICK;
            if (this.isMature) this.reproductionUrge += REPRODUCAO_POR_TICK;

            // --- CHECAGEM DE MORTE ---
            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge) {
                this.morrer();
                return;
            }

            // --- MATURIDADE ---
            if (!this.isMature && this.age > IDADE_MATURIDADE) {
                this.isMature = true;
                this.element.classList.remove('filhote');
            }
            
            // --- GESTAÇÃO ---
            if(this.isGestating) {
                this.gestationTimer--;
                if(this.gestationTimer <= 0) {
                    this.darALuz();
                }
                return; // Fica parada durante a gestação
            }

            // --- LÓGICA DE DECISÃO (IA) ---
            this.decidirAcao();
            
            // --- MOVIMENTO ---
            if (this.alvo) this.moverParaAlvo();
            else this.vagar();

            // --- ATUALIZAÇÃO VISUAL ---
            this.element.style.opacity = Math.max(0.3, (100 - Math.max(this.fome, this.sede)) / 100);
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
        }
        
        decidirAcao() {
            // Prioridade 1: Sede
            if (this.sede > 60) {
                this.buscarAgua();
                return;
            }
            // Prioridade 2: Fome
            if (this.fome > 50) {
                this.buscarComida();
                return;
            }
            // Prioridade 3: Reprodução
            if (this.isMature && this.gender === 'female' && this.reproductionUrge > 70 && this.fome < 40 && this.sede < 40) {
                 this.buscarParceiro();
                 return;
            }

            // Se nenhuma necessidade é urgente, usa a memória ou vaga
            if (this.sede > 30 && this.lastKnownWaterLocation) {
                 this.alvo = this.lastKnownWaterLocation; this.estado = 'buscandoAgua'; return;
            }
            if (this.fome > 30 && this.lastKnownFoodLocation) {
                 this.alvo = this.lastKnownFoodLocation; this.estado = 'buscandoComida'; return;
            }

            this.estado = 'vagando';
            this.alvo = null;
        }

        buscarComida() {
            this.estado = 'buscandoComida';
            this.alvo = this.encontrarMaisProximo(racoes);
            // Se não achar comida visível, esquece a última localização
            if (!this.alvo) this.lastKnownFoodLocation = null;
        }

        buscarAgua() {
            this.estado = 'buscandoAgua';
            this.alvo = this.encontrarMaisProximo(bebedouros);
        }
        
        buscarParceiro() {
            this.estado = 'buscandoParceiro';
            this.alvo = this.encontrarMaisProximo(ratos.filter(r => r.isMature && r.gender === 'male'));
        }
        
        encontrarMaisProximo(listaDeAlvos) {
            return listaDeAlvos.reduce((maisProximo, alvoAtual) => {
                if (!alvoAtual || alvoAtual === this) return maisProximo;
                const dist = Math.hypot(this.x - alvoAtual.x, this.y - alvoAtual.y);
                if (dist < (maisProximo ? maisProximo.distancia : Infinity)) {
                    return { alvo: alvoAtual, distancia: dist };
                }
                return maisProximo;
            }, null)?.alvo;
        }

        moverParaAlvo() {
            if (!this.alvo || this.alvo.foiRemovido) {
                this.alvo = null;
                this.estado = 'vagando';
                return;
            }

            const dx = this.alvo.x - this.x;
            const dy = this.alvo.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 15) { // Chegou ao alvo
                this.interagirComAlvo();
            } else {
                this.x += (dx / dist) * this.velocidade;
                this.y += (dy / dist) * this.velocidade;
            }
        }
        
        interagirComAlvo() {
            switch(this.estado) {
                case 'buscandoComida':
                    this.fome = Math.max(0, this.fome - 60);
                    this.lastKnownFoodLocation = { x: this.alvo.x, y: this.alvo.y }; // Lembra onde comeu
                    this.alvo.remover();
                    racoes = racoes.filter(r => r !== this.alvo);
                    break;
                case 'buscandoAgua':
                    this.sede = Math.max(0, this.sede - 70);
                    this.lastKnownWaterLocation = { x: this.alvo.x, y: this.alvo.y }; // Lembra onde bebeu
                    break;
                case 'buscandoParceiro':
                    if(this.alvo.isMature && this.gender === 'female' && !this.isGestating) {
                        this.isGestating = true;
                        this.gestationTimer = GESTACAO_DURACAO;
                        this.reproductionUrge = 0;
                    }
                    break;
            }
            this.alvo = null;
            this.estado = 'vagando';
        }

        vagar() {
            if (Math.random() < 0.05) { // Muda de direção ocasionalmente
                this.vagarAlvo = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
            }
            if (this.vagarAlvo) {
                const dx = this.vagarAlvo.x - this.x;
                const dy = this.vagarAlvo.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 20) {
                    this.vagarAlvo = null;
                } else {
                    this.x += (dx / dist) * (this.velocidade / 2); // Vaga mais devagar
                    this.y += (dy / dist) * (this.velocidade / 2);
                }
            }
        }
        
        darALuz() {
            this.isGestating = false;
            const numFilhotes = Math.floor(Math.random() * 3) + 2; // Ninhada de 2 a 4
            for(let i = 0; i < numFilhotes; i++) {
                const novoRato = new Rato();
                novoRato.x = this.x + (Math.random() - 0.5) * 20;
                novoRato.y = this.y + (Math.random() - 0.5) * 20;
                ratos.push(novoRato);
            }
        }

        morrer() {
            this.foiRemovido = true;
            this.element.style.transform = 'rotate(180deg)';
            this.element.style.opacity = '0.4';
            this.element.style.zIndex = '1';
            // Deixa o corpo no cenário, mas o remove da lista de ratos ativos
            ratos = ratos.filter(r => r !== this);
        }
    }
    
    class Racao extends Entidade {
        constructor() { super('racao'); }
    }

    class Bebedouro extends Entidade {
        constructor() { super('bebedouro'); }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    
    function iniciar() {
        // Aplica o cenário
        const scenario = scenarioSelect.value;
        world.className = `world-${scenario}`;
        SEDE_POR_TICK = scenario === 'deserto' ? 0.22 : 0.15;

        // Cria as entidades
        const numRatos = parseInt(numRatosInput.value);
        for (let i = 0; i < numRatos; i++) ratos.push(new Rato());
        
        const numRacoes = parseInt(numRacoesInput.value);
        for (let i = 0; i < numRacoes; i++) racoes.push(new Racao());

        const numBebedouros = parseInt(numBebedourosInput.value);
        for (let i = 0; i < numBebedouros; i++) bebedouros.push(new Bebedouro());
        
        // Inicia o jogo
        simulaçãoAtiva = true;
        setupContainer.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        gameInterval = setInterval(gameLoop, 100);
    }
    
    function gameLoop() {
        if (!simulaçãoAtiva) return;
        
        tempo += 0.1;
        
        // Atualiza uma cópia da array para evitar problemas ao adicionar/remover ratos
        [...ratos].forEach(rato => rato.atualizar());

        // Atualiza o painel de informações
        ratosVivosSpan.textContent = ratos.length + ratos.filter(r=>r.foiRemovido).length;
        tempoSpan.textContent = tempo.toFixed(1);
        
        // Condição de fim
        if (ratos.length === 0 && tempo > 1) {
            finalizarSimulacao();
        }
    }

    function finalizarSimulacao() {
        simulaçãoAtiva = false;
        clearInterval(gameInterval);
        alert(`A simulação terminou! A população de ratos chegou a zero após ${tempo.toFixed(1)} segundos.`);
    }

    function resetar() {
        clearInterval(gameInterval);
        world.innerHTML = '';
        ratos = [];
        racoes = [];
        bebedouros = [];
        simulaçãoAtiva = false;
        tempo = 0;
        gameContainer.classList.add('hidden');
        setupContainer.classList.remove('hidden');
    }

    function adicionarComida() {
        for(let i = 0; i < 5; i++) {
             racoes.push(new Racao());
        }
    }

    // === EVENT LISTENERS ===
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);
    adicionarComidaBtn.addEventListener('click', adicionarComida);
});
