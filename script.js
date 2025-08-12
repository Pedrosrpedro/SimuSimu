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
    const mainInfoPanel = document.getElementById('main-info-panel');
    const inspectionPanel = document.getElementById('inspection-panel');
    const btnFecharInspecao = document.getElementById('btn-fechar-inspecao');
    const btnAddComida = document.getElementById('btn-add-comida');
    const btnAddRato = document.getElementById('btn-add-rato');
    const btnAddCoelho = document.getElementById('btn-add-coelho');
    const btnColocarPedra = document.getElementById('btn-colocar-pedra');
    const btnModoTerritorio = document.getElementById('btn-modo-territorio');
    let particleContainer;

    // === VARIÁVEIS GLOBAIS DA SIMULAÇÃO ===
    let animais = [], comidas = [], aguas = [], obstaculos = [], abrigos = [];
    let tribos = [], carcacas = [];
    let simulaçãoAtiva = false, tempo = 0, modoTerritorio = false, modoDeColocarPedra = false;
    const MAP_WIDTH = 800, MAP_HEIGHT = 600, HEALTH_BAR_THRESHOLD = 30;
    let gameInterval, currentSpeedMultiplier = 1;
    let animalInspecionado = null, isClickDrag = false, objetoSendoArrastado = null;
    let populationChart;

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
            this.foiRemovido = false;
            this.elementoVisual = document.createElement('div');
            this.elementoVisual.className = 'territorio-visual';
            world.appendChild(this.elementoVisual);
            this.adicionarMembro(fundador, 'Lider');
            this.atualizarVisual();
            adicionarLog(`A ${this.nome} foi fundada!`, 'tribo');
        }

        gerarNomeTribo() {
            const prefixos = ["Clã", "Tribo", "Bando"];
            const sufixos = ["da Pedra", "do Riacho", "da Colina", "do Sol"];
            return `${prefixos[Math.floor(Math.random() * prefixos.length)]} ${sufixos[Math.floor(Math.random() * sufixos.length)]}`;
        }

        adicionarMembro(animal, funcao = null) {
            if (this.membros.includes(animal) || (this.membros.length > 0 && animal.tipo !== this.membros[0].tipo)) return;
            if (animal.tribo) animal.tribo.removerMembro(animal);
            this.membros.push(animal);
            animal.tribo = this;
            animal.element.style.setProperty('--cor-tribo', this.cor);
            animal.funcao = funcao || 'Coletor';
            if (funcao === 'Lider') this.lider = animal;
        }

        removerMembro(animal) {
            this.membros = this.membros.filter(m => m.id !== animal.id);
            animal.tribo = null; animal.funcao = null;
            animal.element.style.removeProperty('--cor-tribo');
            if (animal === this.lider && this.membros.length > 0) {
                this.lider = this.membros[0]; this.lider.funcao = 'Lider';
                adicionarLog(`${this.lider.nome} é o novo líder da ${this.nome}.`, 'tribo');
            }
            if (this.membros.length === 0) this.dissolver();
        }
        
        atualizarTribo() {
            if (this.foiRemovido) return;
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
                    if(membro.funcao !== 'Guerreiro') { membro.funcao = 'Guerreiro'; guerreirosAtuais++; }
                } else {
                    if(membro.funcao === 'Guerreiro') { membro.funcao = 'Coletor'; guerreirosAtuais--; }
                }
            }
        }

        expandirTerritorio() { this.territorioRaio += 0.01 * this.membros.length; }
        
        atualizarDiplomacia() {
             for (const outraTribo of tribos) {
                if (outraTribo.id === this.id || outraTribo.foiRemovido) continue;
                const dist = Math.hypot(this.abrigo.x - outraTribo.abrigo.x, this.abrigo.y - outraTribo.abrigo.y);
                if (dist < this.territorioRaio + outraTribo.territorioRaio && this.diplomacia[outraTribo.id] !== 'GUERRA') {
                    this.diplomacia[outraTribo.id] = 'GUERRA'; outraTribo.diplomacia[this.id] = 'GUERRA';
                    adicionarLog(`Guerra declarada: ${this.nome} vs ${outraTribo.nome}!`, 'guerra');
                }
            }
        }

        anexarTribo(triboPerdedora) {
            adicionarLog(`A ${this.nome} anexou os remanescentes da ${triboPerdedora.nome}!`, 'guerra');
            const membrosRestantes = [...triboPerdedora.membros];
            membrosRestantes.forEach(membro => this.adicionarMembro(membro));
            triboPerdedora.dissolver();
        }

        atualizarVisual() {
            this.elementoVisual.classList.toggle('active', modoTerritorio);
            this.elementoVisual.style.width = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.height = `${this.territorioRaio * 2}px`;
            this.elementoVisual.style.left = `${(this.abrigo?.x || 0) + (this.abrigo?.width / 2 || 0) - this.territorioRaio}px`;
            this.elementoVisual.style.top = `${(this.abrigo?.y || 0) + (this.abrigo?.height / 2 || 0) - this.territorioRaio}px`;
            this.elementoVisual.style.borderColor = this.cor;
            if (this.abrigo) {
                this.abrigo.element.style.setProperty('--food-count', `'${this.recursos.comida}'`);
                this.abrigo.element.style.setProperty('--food-display', this.recursos.comida > 0 ? 'block' : 'none');
            }
        }

        dissolver() {
            if (this.foiRemovido) return;
            this.foiRemovido = true;
            adicionarLog(`A ${this.nome} foi desfeita.`, 'tribo');
            this.membros.forEach(m => { if (m) { m.tribo = null; m.funcao = null; m.estado = 'Vagando'; }});
            if (this.abrigo) this.abrigo.remover();
            if (this.elementoVisual.parentElement) world.removeChild(this.elementoVisual);
            const index = tribos.findIndex(t => t.id === this.id);
            if(index > -1) tribos.splice(index, 1);
        }
    }

    class Entidade {
        constructor(x, y, classeCss) {
            this.element = document.createElement('div');
            this.element.className = `entity ${classeCss}`;
            this.x = x ?? Math.random() * (MAP_WIDTH - 50);
            this.y = y ?? Math.random() * (MAP_HEIGHT - 50);
            this.width = 0; this.height = 0;
            world.appendChild(this.element);
            setTimeout(() => {
                if(this.element) {
                    this.width = this.element.offsetWidth;
                    this.height = this.element.offsetHeight;
                }
            }, 0);
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
    class Agua extends Entidade { constructor() { super(null, null, 'agua'); } refill() { this.element.style.transform = 'scale(1.2)'; setTimeout(() => this.element.style.transform = 'scale(1)', 500); } }
    class Abrigo extends Entidade { constructor(x, y) { super(x, y, 'abrigo'); } }
    class Carcaca extends Entidade {
        constructor(x, y) { super(x, y, 'carcaca'); this.nutrientes = 100; this.timerDecomposicao = 400; }
        atualizar() {
            this.timerDecomposicao -= 1;
            this.element.style.opacity = this.timerDecomposicao / 400;
            if (this.timerDecomposicao <= 0 || this.nutrientes <= 0) {
                this.remover();
            }
        }
     }

    class Animal extends Entidade {
        constructor(tipo, x, y) {
            super(x, y, DEFINICOES_ANIMAIS[tipo].classeCss + ' animal');
            Object.assign(this, {
                tipo, nome: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} #${Math.floor(Math.random()*1000)}`,
                fome: 20, sede: 20, age: 0, reproductionUrge: 0,
                velocidade: 1.5 + Math.random(), isMature: false, 
                maxAge: 400 + Math.random() * 200, 
                gender: Math.random() > 0.5 ? 'male' : 'female', isGestating: false, gestationTimer: 0,
                alvo: null, estado: 'Vagando', abrigo: null, frio: 0, oQueCome: DEFINICOES_ANIMAIS[tipo].come,
                tribo: null, funcao: null, itemCarregado: null
            });
            this.element.classList.add('filhote');
            this.healthBarContainer = document.createElement('div'); this.healthBarContainer.className = 'health-bar-container';
            this.healthBarFill = document.createElement('div'); this.healthBarFill.className = 'health-bar-fill';
            this.healthBarContainer.appendChild(this.healthBarFill); this.element.appendChild(this.healthBarContainer);
        }

        atualizar() {
            if (this.foiRemovido || objetoSendoArrastado === this) return;
            this.age += 0.05; this.fome += 0.2; this.sede += 0.25;
            if (this.isMature) this.reproductionUrge += 0.5;
            if (!this.isMature && this.age > 20) { this.isMature = true; this.element.classList.remove('filhote'); }
            if (this.isGestating) { this.gestationTimer -= 1; if(this.gestationTimer <= 0) this.darALuz(); }
            
            if (this.fome >= 100 || this.sede >= 100 || this.age >= this.maxAge) { this.morrer(); return; }
            
            this.decidirAcao();
            if (this.alvo) this.moverParaAlvo();

            this.x = Math.max(0, Math.min(MAP_WIDTH - this.width, this.x));
            this.y = Math.max(0, Math.min(MAP_HEIGHT - this.height, this.y));
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
            this.atualizarUI();
        }

        decidirAcao() {
             if (this.alvo && !this.alvo.foiRemovido) return;
             if (this.tribo && !this.tribo.foiRemovido) {
                if (this.itemCarregado) { this.estado = 'Levando para Abrigo'; this.alvo = this.tribo.abrigo; return; }
                switch (this.funcao) {
                    case 'Lider':
                        if (this.isMature && this.gender === 'female' && !this.isGestating && this.reproductionUrge > 30) {
                            const parceiro = this.encontrarMaisProximo(this.tribo.membros.filter(m => m.id !== this.id && m.gender === 'male' && m.isMature));
                            if (parceiro) { this.estado = 'Acasalando'; this.alvo = parceiro; return; }
                        }
                        this.estado = 'Liderando'; this.vagarPertoDoAbrigo(); return;
                    case 'Guerreiro':
                        const inimigo = this.encontrarInimigo();
                        if (inimigo) { this.estado = 'Atacando'; this.alvo = inimigo; return; }
                        this.estado = 'Patrulhando'; this.vagarPelaBorda(); return;
                    case 'Coletor':
                        if (this.sede > 60) { this.estado = 'Bebendo Água'; this.alvo = this.encontrarMaisProximo(aguas); return; }
                        if (this.fome > 70 && this.tribo.recursos.comida > 0) { this.estado = 'Comendo no Abrigo'; this.alvo = this.tribo.abrigo; return; }
                        if (this.tribo.recursos.comida < this.tribo.membros.length * 3) { this.estado = 'Coletando Comida'; this.alvo = this.encontrarComida(); return; }
                        this.estado = 'Ocioso'; this.vagarPertoDoAbrigo(); return;
                }
            } else {
                if (this.fome > 50) { this.estado = 'Buscando Comida'; this.alvo = this.encontrarComida(); return; }
                if (this.sede > 60) { this.estado = 'Buscando Água'; this.alvo = this.encontrarMaisProximo(aguas); return; }
                if (!this.abrigo && this.isMature && Math.random() < 0.0005) { this.estado = "Fundando Tribo"; this.alvo = { x: this.x, y: this.y }; return; }
                this.estado = 'Vagando'; this.vagar();
            }
        }

        moverParaAlvo() {
            if (!this.alvo || (this.alvo.foiRemovido)) { this.alvo = null; return; }
            const dx = this.alvo.x - this.x, dy = this.alvo.y - this.y, d = Math.hypot(dx, dy);
            const distMin = (this.estado === 'Atacando') ? 20 : 10;
            if (d < distMin) { this.interagirComAlvo(); return; }
            let nX = this.x + (dx / d) * this.velocidade;
            let nY = this.y + (dy / d) * this.velocidade;
            this.x = nX; this.y = nY;
        }

        interagirComAlvo() {
            if (!this.alvo) return;
            switch(this.estado) {
                case 'Atacando': if (this.alvo.morrer) this.alvo.morrer('combate', this.tribo); break;
                case 'Coletando Comida': if(this.alvo instanceof Comida){ this.itemCarregado = this.alvo.tipo; this.alvo.remover(); } break;
                case 'Levando para Abrigo': if (this.tribo) { this.tribo.recursos.comida++; this.itemCarregado = null; } break;
                case 'Comendo no Abrigo': if (this.tribo && this.tribo.recursos.comida > 0) { this.tribo.recursos.comida--; this.fome = Math.max(0, this.fome - 80); } break;
                case 'Fundando Tribo': this.abrigo = new Abrigo(this.x, this.y); abrigos.push(this.abrigo); tribos.push(new Tribe(this)); break;
                case 'Acasalando': if (this.alvo instanceof Animal) { this.isGestating = true; this.gestationTimer = 150; this.reproductionUrge = 0; } break;
                case 'Bebendo Água': if (this.alvo instanceof Agua) { this.sede = Math.max(0, this.sede - 80); this.alvo.refill?.(); } break;
                case 'Buscando Comida': if (this.alvo instanceof Comida) { this.fome = Math.max(0, this.fome - 60); this.alvo.remover(); } break;
            }
            this.alvo = null;
        }

        morrer(causa = 'causas naturais', atacanteTribe = null) {
            if (this.foiRemovido) return;
            const causaDaMorte = (this.fome >= 100 ? 'fome' : this.sede >= 100 ? 'sede' : this.age >= this.maxAge ? 'velhice' : causa);
            adicionarLog(`${this.nome} (${this.tipo}) morreu de ${causaDaMorte}.`, 'morte');
            this.foiRemovido = true;
            
            const oldTribe = this.tribo;
            if (oldTribe) oldTribe.removerMembro(this);
            
            if (this.funcao === 'Lider' && causa === 'combate' && atacanteTribe && oldTribe && oldTribe.membros.length > 0 && Math.random() < 0.5) {
                atacanteTribe.anexarTribo(oldTribe);
            }
            
            animais = animais.filter(a => a.id !== this.id);
            this.remover();
        }

        darALuz() {
            this.isGestating = false;
            const n = Math.floor(Math.random() * 4) + 1;
            adicionarLog(`${this.nome} deu à luz a ${n} filhote(s)!`, 'nascimento');
            for(let i=0; i<n; i++) {
                const filhote = new Animal(this.tipo, this.x + (Math.random()*20-10), this.y + (Math.random()*20-10));
                if (this.tribo) this.tribo.adicionarMembro(filhote);
                animais.push(filhote);
            }
        }
        
        vagar() { this.alvo = { x: this.x + (Math.random() - 0.5) * 100, y: this.y + (Math.random() - 0.5) * 100 }; }
        vagarPertoDoAbrigo() { if(!this.tribo) return this.vagar(); this.alvo = { x: this.tribo.abrigo.x + (Math.random() - 0.5) * 150, y: this.tribo.abrigo.y + (Math.random() - 0.5) * 150 }; }
        vagarPelaBorda() { if(!this.tribo) return this.vagar(); const angulo = Math.random() * 2 * Math.PI; this.alvo = { x: this.tribo.abrigo.x + Math.cos(angulo) * this.tribo.territorioRaio, y: this.tribo.abrigo.y + Math.sin(angulo) * this.tribo.territorioRaio }; }
        encontrarComida() { return this.encontrarMaisProximo(comidas.filter(c => this.oQueCome.includes(c.tipo))); }
        encontrarInimigo() { return this.encontrarMaisProximo(animais.filter(a => a.tribo && this.tribo && a.tribo.id !== this.tribo.id && this.tribo.diplomacia[a.tribo.id] === 'GUERRA')); }
        encontrarMaisProximo(lista) { return lista.reduce((maisProximo, atual) => { if (!atual || atual.foiRemovido) return maisProximo; const d = Math.hypot(this.x - atual.x, this.y - atual.y); if (!maisProximo || d < maisProximo.dist) return { alvo: atual, dist: d }; return maisProximo; }, null)?.alvo; }

        atualizarUI() {
            const bemEstar = 100 - Math.max(this.fome, this.sede);
            this.healthBarFill.style.width = `${bemEstar}%`;
            if (bemEstar > 60) this.healthBarFill.className = 'health-bar-fill health-green';
            else if (bemEstar > 30) this.healthBarFill.className = 'health-bar-fill health-yellow';
            else this.healthBarFill.className = 'health-bar-fill health-red';
        }
    }

    // === FUNÇÕES DE CONTROLE DA SIMULAÇÃO ===
    
    function popularSetup() { animalSelectionDiv.innerHTML = ''; for (const [t, d] of Object.entries(DEFINICOES_ANIMAIS)) { const g = document.createElement('div'); g.className = 'animal-input-group'; g.innerHTML = `<label for="num-${t}">${d.nome}:</label><input type="number" id="num-${t}" data-tipo="${t}" value="5" min="0" max="50">`; animalSelectionDiv.appendChild(g); } }
    
    function iniciar() {
        world.innerHTML = '<div id="world-overlay"></div><div id="particle-container"></div>';
        particleContainer = document.getElementById('particle-container');
        world.className = `world world-${scenarioSelect.value}`;
        
        tribos.forEach(t => t.dissolver());
        [...animais, ...comidas, ...aguas, ...obstaculos, ...abrigos, ...carcacas].forEach(e => e.remover());

        animais = []; comidas = []; aguas = []; obstaculos = []; abrigos = []; tribos = []; carcacas = [];
        tempo = 0; statsHistory = []; logContainer.innerHTML = '';
        
        for(let i=0; i<parseInt(numAguaInput.value); i++) aguas.push(new Agua());
        const tiposSel = Array.from(animalSelectionDiv.querySelectorAll('input')).filter(i => parseInt(i.value) > 0).map(i => i.dataset.tipo);
        if (tiposSel.length > 0) { for (let i = 0; i < parseInt(numComidaInput.value); i++) { const tC = DEFINICOES_ANIMAIS[tiposSel[Math.floor(Math.random() * tiposSel.length)]].come[0]; comidas.push(new Comida(tC)); } }
        animalSelectionDiv.querySelectorAll('input').forEach(i => { for(let j=0; j<parseInt(i.value); j++) { if (i.value > 0) animais.push(new Animal(i.dataset.tipo)); } });
        
        setupChart(); setGameSpeed(1); Telas.mostrar('game'); adicionarLog("A simulação começou!", "info");
    }

    function gameLoop() {
        if (!simulaçãoAtiva) return;
        tempo += 0.1 * currentSpeedMultiplier;
        
        [...tribos].forEach(t => t.atualizarTribo());
        [...animais].forEach(a => a.atualizar());
        
        worldViewport.classList.toggle('hide-health-bars', animais.length > HEALTH_BAR_THRESHOLD);
        populacaoTotalSpan.textContent = animais.length;
        tempoSpan.textContent = tempo.toFixed(1);
        const c = {}; animais.forEach(a => c[a.tipo] = (c[a.tipo] || 0) + 1);
        animalCountsDiv.innerHTML = Object.entries(DEFINICOES_ANIMAIS).map(([t, d]) => `<span>${d.nome}: ${c[t] || 0}</span>`).join('<br>');
        
        if (animais.length === 0 && tempo > 10) finalizarSimulacao('extinção');
        if (Math.floor(tempo) % 2 === 0 && (!statsHistory.length || statsHistory[statsHistory.length-1].tempo !== Math.floor(tempo))) { updateChart(); }
        if (animalInspecionado) atualizarPainelInspecao();
    }

    function finalizarSimulacao(motivo) { setGameSpeed(0); if (motivo === 'extinção') { alert('A simulação terminou por extinção!'); } }
    function resetar() { finalizarSimulacao('reset'); fecharPainelInspecao(); Telas.mostrar('menu'); }

    function setGameSpeed(m) {
        currentSpeedMultiplier = m;
        simulaçãoAtiva = m > 0;
        clearInterval(gameInterval);
        if (simulaçãoAtiva) {
            gameInterval = setInterval(gameLoop, 100 / currentSpeedMultiplier);
        }
        document.querySelectorAll('.btn-time').forEach(b => { b.classList.toggle('active', parseFloat(b.dataset.speed) === m); });
    }
    
    function toggleFullScreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    function toggleModoTerritorio() { modoTerritorio = !modoTerritorio; btnModoTerritorio.classList.toggle('active', modoTerritorio); tribos.forEach(t => t.atualizarVisual()); }
    
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
        if (logContainer.children.length > 100) logContainer.lastChild.remove();
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
        document.getElementById('inspect-estado').textContent = animalInspecionado.estado;
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
            return { label: DEFINICOES_ANIMAIS[tipo].nome, data: [], borderColor, backgroundColor: color, tension: 0.1, yAxisID: 'y' };
        });
        datasets.push({
            label: 'Idade Média', data: [], borderColor: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'rgba(255, 255, 255, 0.2)', yAxisID: 'y1', tension: 0.1
        });
        populationChart = new Chart(populationChartCtx, {
            type: 'line', data: { labels: [], datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'População' } },
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
            else { const tipo = Object.keys(DEFINICOES_ANIMAIS).find(k => DEFINICOES_ANIMAIS[k].nome === dataset.label); if(tipo) dataset.data = statsHistory.map(h => h.counts[tipo] || 0); }
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
    btnAddComida.addEventListener('click', () => comidas.push(new Comida('racao')));
    btnAddRato.addEventListener('click', () => animais.push(new Animal('rato')));
    btnAddCoelho.addEventListener('click', () => animais.push(new Animal('coelho')));
    btnColocarPedra.addEventListener('click', () => { modoDeColocarPedra = !modoDeColocarPedra; btnColocarPedra.classList.toggle('active', modoDeColocarPedra); });
    btnModoTerritorio.addEventListener('click', toggleModoTerritorio);

    worldViewport.addEventListener('mousedown', (e) => {
        if(modoDeColocarPedra) { obstaculos.push(new Obstaculo(e.offsetX, e.offsetY)); return; }
        isClickDrag = false;
        if (e.target.closest('.entity.animal')) objetoSendoArrastado = e.target.closest('.entity.animal').entidade;
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
