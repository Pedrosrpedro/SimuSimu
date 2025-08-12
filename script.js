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
    const logContainer = document.getElementById('log-container');
    const populationChartCtx = document.getElementById('populationChart').getContext('2d');
    const btnModoTerritorio = document.getElementById('btn-modo-territorio');
    let particleContainer;

    // === VARIÁVEIS GLOBAIS DA SIMULAÇÃO ===
    let animais = [], comidas = [], aguas = [], obstaculos = [], abrigos = [];
    let tribos = [], carcacas = [];
    let simulaçãoAtiva = false, tempo = 0, modoDeColocarPedra = false, modoTerritorio = false;
    const WORLD_WIDTH = 800, WORLD_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 15;
    let gameInterval, currentSpeedMultiplier = 1, dayNightTimer = 0, isNight = false;
    let weatherTimer = 0, currentEvent = 'nenhum';
    let populationChart, logMessages = [], statsHistory = [];

    // === VARIÁVEIS DE INTERAÇÃO ===
    let objetoInteragido = null, isDragging = false, startX, startY;

    // === LÓGICA DE CLASSES ===

    class Tribe {
        constructor(fundador) {
            this.id = Date.now() + Math.random();
            this.membros = [fundador];
            this.abrigo = fundador.abrigo;
            this.cor = `hsl(${Math.random() * 360}, 70%, 50%)`;
            this.territorioRaio = 150;

            this.elementoVisual = document.createElement('div');
            this.elementoVisual.className = 'territorio-visual';
            this.elementoVisual.style.width = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.height = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.left = `${this.abrigo.x + (this.abrigo.width / 2) - this.territorioRaio}px`;
            this.elementoVisual.style.top = `${this.abrigo.y + (this.abrigo.height / 2) - this.territorioRaio}px`;
            this.elementoVisual.style.borderColor = this.cor;
            world.appendChild(this.elementoVisual);
            this.atualizarVisual();
        }
        adicionarMembro(animal) {
            if (!this.membros.includes(animal)) {
                this.membros.push(animal);
            }
        }
        removerMembro(animal) {
            this.membros = this.membros.filter(m => m.id !== animal.id);
            if (this.membros.length === 0) {
                this.dissolver();
            }
        }
        atualizarVisual() {
            this.elementoVisual.style.display = modoTerritorio ? 'block' : 'none';
        }
        dissolver() {
            this.membros.forEach(m => {
                if (m) {
                    m.tribo = null;
                    m.estado = 'Vagando';
                }
            });
            if (this.abrigo) {
                this.abrigo.remover();
                abrigos = abrigos.filter(ab => ab.id !== this.abrigo.id);
            }
            if (this.elementoVisual.parentElement) {
                world.removeChild(this.elementoVisual);
            }
            tribos = tribos.filter(t => t.id !== this.id);
        }
    }

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
            this.element.entidade = this;
            this.id = Date.now() + Math.random();
            this.foiRemovido = false;
        }
        remover() {
            if (this.element.parentElement) world.removeChild(this.element);
            this.foiRemovido = true;
        }
        getBounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; }
    }

    class Obstaculo extends Entidade { constructor(x, y) { super(x - 35, y - 35, 'pedra'); } }
    class Comida extends Entidade { constructor(tipo, x, y) { super(x, y, DEFINICOES_COMIDAS[tipo].classeCss + ' comida'); this.tipo = tipo; } }
    class Agua extends Entidade {
        constructor() { super(null, null, 'agua'); }
        refill() { this.element.style.transition = 'transform 0.2s'; this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); }
    }
    class Abrigo extends Entidade {
        constructor(x, y) {
            super(x, y, 'abrigo');
            this.estoqueComida = [];
            this.capacidadeEstoque = 5;
            this.element.style.setProperty('--food-count', this.estoqueComida.length);
            adicionarLog(`Um abrigo foi construído.`);
        }
        adicionarComida(comida) {
            if (this.estoqueComida.length < this.capacidadeEstoque) {
                this.estoqueComida.push(comida.tipo);
                comida.remover();
                comidas = comidas.filter(c => c.id !== comida.id);
                this.element.style.setProperty('--food-count', this.estoqueComida.length);
                return true;
            } return false;
        }
        pegarComida() {
            if (this.estoqueComida.length > 0) {
                this.estoqueComida.pop();
                this.element.style.setProperty('--food-count', this.estoqueComida.length);
                return true;
            } return null;
        }
    }

    class Carcaca extends Entidade {
        constructor(x, y) {
            super(x, y, 'carcaca');
            this.nutrientes = 100;
            this.timerDecomposicao = 400;
            this.element.style.zIndex = 1;
        }
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
                tipo, fome: 20, sede: 20, age: 0, reproductionUrge: 0,
                velocidade: 2.5 + Math.random(), isMature: false, maxAge: 80 + Math.random() * 40,
                gender: Math.random() > 0.5 ? 'male' : 'female', isGestating: false, gestationTimer: 0,
                alvo: null, estado: 'Vagando', abrigo: null, frio: 0, oQueCome: DEFINICOES_ANIMAIS[tipo].come,
                tribo: null, triboInimiga: null, alvoDeAtaque: null
            });

            // MODIFICAÇÃO: Aumentar a longevidade dos ratos
            if (this.tipo === 'rato') {
                this.maxAge = 200 + Math.random() * 50; // Ratos vivem consideravelmente mais
            }

            this.element.classList.add('filhote');
            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer);
            this.statusBubble = document.createElement('div'); this.statusBubble.className = 'status-bubble'; this.element.appendChild(this.statusBubble);
        }
        toggleStatusBubble() { document.querySelectorAll('.status-bubble.visible').forEach(b => { if (b !== this.statusBubble) b.classList.remove('visible'); }); this.statusBubble.classList.toggle('visible'); }
        atualizar() {
            if (this.foiRemovido || (objetoInteragido === this && isDragging)) return;

            this.age += 0.05; this.fome += 0.2; this.sede += (scenarioSelect.value === 'deserto' ? 0.3 : 0.25);
            if (this.isMature) this.reproductionUrge += 0.3;
            if (this.isGestating) this.gestationTimer--;
            if (this.gestationTimer <= 0 && this.isGestating) this.darALuz();
            if (currentEvent === 'nevasca' && !this.estaNoAbrigo()) this.frio += 0.4; else this.frio = Math.max(0, this.frio - 0.2);
            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge || this.frio >= 100) { this.morrer(); return; }
            if (!this.isMature && this.age > 20) { this.isMature = true; this.element.classList.remove('filhote'); }
            
            this.decidirAcao();
            const alvoMovimento = this.alvoDeAtaque || this.alvo;
            if (alvoMovimento) {
                this.moverParaAlvo(alvoMovimento, !!this.alvoDeAtaque);
            } else {
                this.vagar();
            }

            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            this.element.style.opacity = Math.max(0.3, (100 - Math.max(this.fome, this.sede, this.frio)) / 100);
            this.atualizarUI();
        }
        estaNoAbrigo() { if (!this.abrigo) return false; return Math.hypot(this.x - this.abrigo.x, this.y - this.abrigo.y) < 15; }
        atualizarUI() {
            const bemEstar = 100 - Math.max(this.fome, this.sede, this.frio);
            this.healthBarFill.style.width = `${bemEstar}%`;
            if (bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green'; else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow'; else this.healthBarFill.className = 'health-bar-fill health-red';
            this.statusBubble.textContent = this.getStatusText();
            const deveSeEsconder = this.estaNoAbrigo() && ['Descansando no abrigo', 'Buscando abrigo', 'Pegando comida no abrigo'].includes(this.estado);
            this.element.classList.toggle('escondido', deveSeEsconder);
        }
        getStatusText() {
            let s = this.estado, n = [];
            if(this.fome > 70) n.push('morrendo de fome'); else if (this.fome > 40) n.push('com fome');
            if(this.sede > 70) n.push('morrendo de sede'); else if (this.sede > 40) n.push('com sede');
            if(currentEvent === 'chuva' && !this.estaNoAbrigo()) n.push('molhado');
            if(this.frio > 70) n.push('congelando'); else if (this.frio > 40) n.push('com frio');
            return `${s}${n.length > 0 ? ': ' + n.join(' e ') : ''}`;
        }
        decidirAcao() {
            this.alvoDeAtaque = null;
            
            // Verificações de segurança para tribos
            if (this.tribo && !tribos.includes(this.tribo)) this.tribo = null;
            if (this.triboInimiga && !tribos.includes(this.triboInimiga)) this.triboInimiga = null;

            if (this.tribo && this.estado !== 'Guerreando') {
                const inimigoNoTerritorio = this.encontrarInimigoNoTerritorio();
                if (inimigoNoTerritorio && inimigoNoTerritorio.tribo) {
                    this.estado = 'Guerreando';
                    this.triboInimiga = inimigoNoTerritorio.tribo;
                }
            }
            if (this.estado === 'Guerreando') {
                if (this.triboInimiga && this.triboInimiga.membros.length > 0) {
                    this.alvoDeAtaque = this.encontrarMaisProximo(this.triboInimiga.membros);
                    if (this.alvoDeAtaque) return;
                }
                this.estado = 'Vagando'; this.triboInimiga = null;
            }

            if (currentEvent === 'nevasca' && this.frio > 30 && this.abrigo && !this.estaNoAbrigo()) { this.estado = "Buscando abrigo"; this.alvo = this.abrigo; return; }
            if (this.sede > 60) { this.estado = 'Buscando Água'; this.alvo = this.encontrarMaisProximo(aguas); return; }
            if (this.fome > 50) {
                if (this.abrigo && this.abrigo.estoqueComida.length > 0) { this.estado = 'Pegando comida no abrigo'; this.alvo = this.abrigo; return; }
                this.estado = 'Buscando Comida'; this.alvo = this.encontrarComida(); return;
            }

            const podeConstruirAbrigo = ['floresta', 'deserto'].includes(scenarioSelect.value);
            if (podeConstruirAbrigo && !this.abrigo && this.isMature && this.fome < 30 && this.sede < 30) { this.estado = "Construindo abrigo"; this.alvo = { x: this.x, y: this.y, construindo: true }; return; }
            
            // MODIFICAÇÃO: Facilitar a procriação dos ratos
            const reproductionThreshold = (this.tipo === 'rato') ? 50 : 70;
            if (this.isMature && this.gender === 'female' && !this.isGestating && this.reproductionUrge > reproductionThreshold && this.fome < 40 && this.sede < 40) {
                const p = this.encontrarMaisProximo(animais.filter(a => a.tipo === this.tipo && a.isMature && a.gender === 'male' && !a.isGestating));
                if (p) { this.estado = 'Procurando parceiro'; this.alvo = p; return; }
            }

            if (this.abrigo && this.abrigo.estoqueComida.length < this.abrigo.capacidadeEstoque && this.fome < 40) { this.estado = 'Estocando comida'; this.alvo = this.encontrarComida(); return; }
            if (this.estaNoAbrigo() && this.fome < 80 && this.sede < 80) { this.estado = 'Descansando no abrigo'; this.alvo = null; return; }
            
            this.estado = 'Vagando'; this.alvo = null;
        }
        encontrarInimigoNoTerritorio() {
            if (!this.tribo || !this.tribo.abrigo) return null;
            const raio2 = this.tribo.territorioRaio * this.tribo.territorioRaio;
            for (const animal of animais) {
                if (animal.tipo === this.tipo && animal.tribo && animal.tribo.id !== this.tribo.id) {
                    if (Math.pow(this.tribo.abrigo.x - animal.x, 2) + Math.pow(this.tribo.abrigo.y - animal.y, 2) < raio2) {
                        return animal;
                    }
                }
            }
            return null;
        }
        encontrarComida() {
            const fontesDeComida = comidas.filter(c => !c.foiRemovido && this.oQueCome.includes(c.tipo));
            if (this.tipo === 'rato') {
                fontesDeComida.push(...carcacas.filter(c => !c.foiRemovido && c.nutrientes > 0));
            }
            return this.encontrarMaisProximo(fontesDeComida);
        }
        encontrarMaisProximo(lista) {
            return lista.reduce((maisProximo, atual) => {
                if (!atual || atual === this || atual.foiRemovido) return maisProximo;
                const d = Math.hypot(this.x - atual.x, this.y - atual.y);
                if (!maisProximo || d < maisProximo.dist) return { alvo: atual, dist: d };
                return maisProximo;
            }, null)?.alvo;
        }
        moverParaAlvo(alvo, ehAtaque) {
            if (!alvo || alvo.foiRemovido) { this.alvo = null; this.alvoDeAtaque = null; return; }
            const dx = alvo.x - this.x, dy = alvo.y - this.y, d = Math.hypot(dx, dy);
            if (d < 15) {
                if (ehAtaque && !alvo.foiRemovido) {
                    adicionarLog(`Um ${this.tipo} atacou e derrotou um ${alvo.tipo}!`);
                    alvo.morrer();
                    this.alvoDeAtaque = null;
                    this.estado = 'Vagando';
                } else {
                    this.interagirComAlvo();
                }
                return;
            }
            let nX = this.x + (dx / d) * this.velocidade, nY = this.y + (dy / d) * this.velocidade;
            if (this.checarColisao(nX, nY)) { this.alvo = null; this.alvoDeAtaque = null; } else { this.x = nX; this.y = nY; }
        }
        interagirComAlvo() {
            if (!this.alvo) return;
            switch(this.estado) {
                case 'Buscando Comida': 
                    if (this.alvo instanceof Carcaca) {
                        this.fome = Math.max(0, this.fome - this.alvo.nutrientes);
                        this.alvo.nutrientes = 0;
                    } else if (this.alvo instanceof Comida) {
                        this.fome = Math.max(0, this.fome - 60); this.alvo.remover(); comidas = comidas.filter(c => c.id !== this.alvo.id);
                    }
                    break;
                case 'Buscando Água': if (this.alvo instanceof Agua) { this.sede = Math.max(0, this.sede - 70); this.alvo.refill?.(); } break;
                case 'Procurando parceiro': 
                    if (this.alvo instanceof Animal && this.alvo.isMature) {
                        this.isGestating = true;
                        // MODIFICAÇÃO: Gestação mais rápida para ratos
                        this.gestationTimer = (this.tipo === 'rato') ? 80 : 150; 
                        this.reproductionUrge = 0;
                    }
                    break;
                case 'Construindo abrigo':
                    this.abrigo = new Abrigo(this.x, this.y);
                    abrigos.push(this.abrigo);
                    this.tribo = new Tribe(this);
                    tribos.push(this.tribo);
                    break;
                case 'Estocando comida': if (this.abrigo && this.alvo instanceof Comida) { this.abrigo.adicionarComida(this.alvo); } break;
                case 'Pegando comida no abrigo': if (this.abrigo?.pegarComida()) { this.fome = Math.max(0, this.fome - 60); } break;
            }
            this.alvo = null;
        }
        checarColisao(x, y) { for (const o of [...obstaculos, ...abrigos.filter(a => a !== this.abrigo)]) { const b = o.getBounds(); if (x < b.right && x + this.width > b.left && y < b.bottom && y + this.height > b.top) return true; } return false; }
        vagar() {
            let alvoX, alvoY;
            if (this.tribo && this.tribo.abrigo) {
                alvoX = this.tribo.abrigo.x + (Math.random() - 0.5) * this.tribo.territorioRaio * 2;
                alvoY = this.tribo.abrigo.y + (Math.random() - 0.5) * this.tribo.territorioRaio * 2;
            } else {
                alvoX = Math.random() * WORLD_WIDTH;
                alvoY = Math.random() * WORLD_HEIGHT;
            }
            if (!this.vagarAlvo || Math.random() < 0.05) { this.vagarAlvo = { x: alvoX, y: alvoY }; }
            const dx = this.vagarAlvo.x - this.x, dy = this.vagarAlvo.y - this.y, d = Math.hypot(dx, dy);
            if (d < 20) { this.vagarAlvo = null; }
            else { let nX = this.x + (dx / d) * (this.velocidade / 2), nY = this.y + (dy / d) * (this.velocidade / 2); if (!this.checarColisao(nX, nY)) { this.x = nX; this.y = nY; } else { this.vagarAlvo = null; } }
        }
        darALuz() {
            this.isGestating = false;
            // MODIFICAÇÃO: Ninhadas maiores para os ratos
            const n = (this.tipo === 'rato') ? Math.floor(Math.random() * 3) + 2 : Math.floor(Math.random() * 2) + 1; // Ratos têm 2-4 filhotes
            for(let i=0; i<n; i++) {
                const filhote = new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10));
                if (this.tribo) {
                    filhote.tribo = this.tribo;
                    this.tribo.adicionarMembro(filhote);
                }
                animais.push(filhote);
            }
        }
        morrer() {
            if (this.foiRemovido) return;
            const causaDaMorte = this.fome >= 100 ? 'fome' : this.sede >= 100 ? 'sede' : this.frio >= 100 ? 'frio' : this.age >= this.maxAge ? 'velhice' : 'combate';
            adicionarLog(`Um ${this.tipo} morreu de ${causaDaMorte}.`);
            this.foiRemovido = true;
            
            carcacas.push(new Carcaca(this.x, this.y));
            if (this.tribo) {
                this.tribo.removerMembro(this);
            }
            
            animais = animais.filter(a => a.id !== this.id);
            this.remover();
        }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [t, d] of Object.entries(DEFINICOES_ANIMAIS)) { const g = document.createElement('div'); g.className = 'animal-input-group'; g.innerHTML = `<label for="num-${t}">${d.nome}:</label><input type="number" id="num-${t}" data-tipo="${t}" value="2" min="0" max="20">`; animalSelectionDiv.appendChild(g); } }
    function iniciar() {
        world.innerHTML = '<div id="world-overlay"></div><div id="particle-container"></div>';
        particleContainer = document.getElementById('particle-container');
        
        tribos.forEach(t => t.dissolver());
        [...animais, ...comidas, ...aguas, ...obstaculos, ...abrigos, ...carcacas].forEach(e => e.remover());

        animais = []; comidas = []; aguas = []; obstaculos = []; abrigos = []; tribos = []; carcacas = [];
        tempo = 0; statsHistory = []; logMessages = []; logContainer.innerHTML = ''; currentEvent = 'nenhum';
        
        world.className = `world-${scenarioSelect.value}`;
        for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua());
        const tiposSel = Array.from(animalSelectionDiv.querySelectorAll('input')).filter(i => parseInt(i.value) > 0).map(i => i.dataset.tipo);
        if (tiposSel.length > 0) { for (let i = 0; i < parseInt(numComidaInput.value); i++) { const tC = DEFINICOES_ANIMAIS[tiposSel[Math.floor(Math.random() * tiposSel.length)]].come[0]; comidas.push(new Comida(tC)); } }
        animalSelectionDiv.querySelectorAll('input').forEach(i => { for(let j=0; j<parseInt(i.value); j++) { if (i.value > 0) animais.push(new Animal(i.dataset.tipo)); } });
        
        setupChart(); setGameSpeed(1); Telas.mostrar('game'); adicionarLog("A simulação começou!");
    }
    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1 * currentSpeedMultiplier;
        updateWorldState();
        
        [...animais].forEach(a => a.atualizar());
        [...carcacas].forEach(c => c.atualizar());
        
        if (['floresta', 'deserto'].includes(scenarioSelect.value)) {
            let chanceCrescimento = currentEvent === 'chuva' ? 0.01 : 0.001;
            if (Math.random() < chanceCrescimento * currentSpeedMultiplier && comidas.filter(c => c.tipo === 'grama').length < 50) {
                comidas.push(new Comida('grama'));
            }
        }
        
        world.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD);
        populacaoTotalSpan.textContent = animais.length;
        tempoSpan.textContent = tempo.toFixed(1);
        const c = {}; animais.forEach(a => c[a.tipo] = (c[a.tipo] || 0) + 1);
        animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([t, d]) => `<span>${d.nome}: ${c[t] || 0}</span>`).join('<br>');
        if (animais.length === 0 && tempo > 10) finalizarSimulacao('extinção');
        if (Math.floor(tempo) % 2 === 0 && (!statsHistory.length || statsHistory[statsHistory.length-1].tempo !== Math.floor(tempo))) { updateChart(); }
    }
    function updateWorldState() {
        dayNightTimer += (0.1 * currentSpeedMultiplier);
        if (dayNightTimer > 60) { dayNightTimer = 0; isNight = !isNight; world.classList.toggle('world-night', isNight); }
        if (weatherTimer > 0) { weatherTimer -= (0.1 * currentSpeedMultiplier); }
        else if (currentEvent !== 'nenhum') {
            adicionarLog(`O evento de ${currentEvent} terminou.`);
            world.classList.remove(`world-event`);
            if (particleContainer) particleContainer.innerHTML = '';
            currentEvent = 'nenhum';
        } else if (Math.random() < 0.005 * currentSpeedMultiplier) {
            triggerWeatherEvent(Math.random() > 0.5 ? 'chuva' : 'nevasca');
        }
    }
    function triggerWeatherEvent(evento) {
        if (weatherTimer > 0) return;
        currentEvent = evento;
        weatherTimer = 20 + Math.random() * 20;
        world.classList.add(`world-event`);
        adicionarLog(`Um evento de ${evento} começou!`);
        criarParticulas(evento, 50);
        if (evento === 'chuva') aguas.forEach(a => a.refill());
    }
    function criarParticulas(tipo, quantidade) {
        if (!particleContainer) return;
        particleContainer.innerHTML = '';
        for (let i = 0; i < quantidade; i++) {
            const p = document.createElement('div');
            p.className = `particula ${tipo}`;
            p.style.left = `${Math.random() * 100}%`;
            p.style.animationDuration = `${1 + Math.random() * 1}s`;
            p.style.animationDelay = `${Math.random() * 2}s`;
            particleContainer.appendChild(p);
        }
    }
    function setGameSpeed(m) {
        clearInterval(gameInterval);
        currentSpeedMultiplier = m;
        if (m > 0) {
            simulaçãoAtiva = true;
            gameInterval = setInterval(gameLoop, 100 / m);
        } else {
            simulaçãoAtiva = false;
        }
        document.querySelectorAll('.btn-time').forEach(b => { b.classList.toggle('active', parseFloat(b.dataset.speed) === m); });
    }
    function finalizarSimulacao(m) {
        clearInterval(gameInterval);
        simulaçãoAtiva = false;
        if (m === 'extinção') {
            const msg = `A simulação terminou! A vida foi extinta em ${tempo.toFixed(1)} segundos.`;
            adicionarLog(msg);
            alert(msg);
        }
    }
    function resetar() {
        finalizarSimulacao('reset');
        modoDeColocarPedra = false;
        btnColocarPedra.classList.remove('active');
        world.classList.remove('placing-mode');
        Telas.mostrar('menu');
    }
    function adicionarAnimal(t) { animais.push(new Animal(t)); }
    function adicionarComidaAleatoria() { if (animais.length === 0) return; const tC = Object.keys(DEFINICOES_COMIDAS)[Math.floor(Math.random() * Object.keys(DEFINICOES_COMIDAS).length)]; comidas.push(new Comida(tC)); }
    function toggleModoPedra() { modoDeColocarPedra = !modoDeColocarPedra; btnColocarPedra.classList.toggle('active', modoDeColocarPedra); world.classList.toggle('placing-mode', modoDeColocarPedra); }
    function toggleModoTerritorio() {
        modoTerritorio = !modoTerritorio;
        btnModoTerritorio.classList.toggle('active', modoTerritorio);
        tribos.forEach(t => t.atualizarVisual());
        adicionarLog(`Modo de visualização de território ${modoTerritorio ? 'ativado' : 'desativado'}.`);
    }
    function adicionarLog(mensagem) { const timestamp = tempo.toFixed(1); const logEntry = document.createElement('div'); logEntry.innerHTML = `<span>[${timestamp}s]</span> ${mensagem}`; logContainer.prepend(logEntry); logMessages.unshift(`[${timestamp}s] ${mensagem}`); if (logMessages.length > 50) { logMessages.pop(); logContainer.lastChild.remove(); } }
    function setupChart() { if(populationChart) populationChart.destroy(); const animalTypes = Object.keys(DEFINICOES_ANIMAIS); const datasets = animalTypes.map(tipo => { const color = tipo === 'rato' ? 'rgba(136, 136, 136, 0.8)' : 'rgba(212, 163, 115, 0.8)'; const borderColor = tipo === 'rato' ? 'rgba(136, 136, 136, 1)' : 'rgba(212, 163, 115, 1)'; return { label: DEFINICOES_ANIMAIS[tipo].nome, data: [], borderColor: borderColor, backgroundColor: color, tension: 0.1 }; }); populationChart = new Chart(populationChartCtx, { type: 'line', data: { labels: [], datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'População' } }, x: { title: { display: true, text: 'Tempo (s)' } } }, plugins: { legend: { position: 'top' } } } }); }
    function updateChart() { const t = Math.floor(tempo); statsHistory.push({ tempo: t, counts: Object.keys(DEFINICOES_ANIMAIS).reduce((acc, tipo) => { acc[tipo] = animais.filter(a => a.tipo === tipo).length; return acc; }, {}) }); populationChart.data.labels = statsHistory.map(h => h.tempo); populationChart.data.datasets.forEach(dataset => { const tipo = Object.keys(DEFINICOES_ANIMAIS).find(k => DEFINICOES_ANIMAIS[k].nome === dataset.label); dataset.data = statsHistory.map(h => h.counts[tipo]); }); populationChart.update(); }

    // === EVENT LISTENERS & INTERAÇÃO ===
    btnNovaSimulacao.addEventListener('click', () => Telas.mostrar('setup'));
    btnVoltarMenu.addEventListener('click', () => Telas.mostrar('menu'));
    iniciarSimulacaoBtn.addEventListener('click', iniciar);
    resetarSimulacaoBtn.addEventListener('click', resetar);
    btnAddComida.addEventListener('click', adicionarComidaAleatoria);
    btnAddRato.addEventListener('click', () => adicionarAnimal('rato'));
    btnAddCoelho.addEventListener('click', () => adicionarAnimal('coelho'));
    btnColocarPedra.addEventListener('click', toggleModoPedra);
    btnModoTerritorio.addEventListener('click', toggleModoTerritorio);
    timeControlButtons.forEach(b => { b.addEventListener('click', () => { setGameSpeed(parseFloat(b.dataset.speed)); }); });
    function getEventPosition(e) { return e.touches && e.touches.length > 0 ? e.touches[0] : e; }
    function handleInteractionStart(e) { if (modoDeColocarPedra) { if (e.target === world || e.target.id === 'world-overlay') { const rect = world.getBoundingClientRect(); const pos = getEventPosition(e); obstaculos.push(new Obstaculo(pos.clientX - rect.left, pos.clientY - rect.top)); } return; } if (e.target.entidade instanceof Animal) { e.preventDefault(); objetoInteragido = e.target.entidade; isDragging = false; const pos = getEventPosition(e); startX = pos.clientX; startY = pos.clientY; } }
    function handleInteractionMove(e) { if (!objetoInteragido) return; e.preventDefault(); const pos = getEventPosition(e); const dX = Math.abs(pos.clientX - startX); const dY = Math.abs(pos.clientY - startY); if (dX > 5 || dY > 5) { isDragging = true; } if (isDragging) { if (!objetoInteragido.element.classList.contains('dragging')) { objetoInteragido.element.classList.add('dragging'); } const rect = world.getBoundingClientRect(); objetoInteragido.x = pos.clientX - rect.left - (objetoInteragido.width / 2); objetoInteragido.y = pos.clientY - rect.top - (objetoInteragido.height / 2); objetoInteragido.element.style.left = `${objetoInteragido.x}px`; objetoInteragido.element.style.top = `${objetoInteragido.y}px`; } }
    function handleInteractionEnd(e) { if (!objetoInteragido) return; if (!isDragging) { objetoInteragido.toggleStatusBubble(); } objetoInteragido.element.classList.remove('dragging'); objetoInteragido = null; isDragging = false; }
    world.addEventListener('mousedown', handleInteractionStart); world.addEventListener('touchstart', handleInteractionStart, { passive: false });
    window.addEventListener('mousemove', handleInteractionMove); window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('mouseup', handleInteractionEnd); window.addEventListener('touchend', handleInteractionEnd);
    
    // === INICIALIZAÇÃO DO JOGO ===
    popularSetup(); Telas.mostrar('menu');
});
