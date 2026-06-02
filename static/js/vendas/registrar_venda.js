(function () {
    const REQUIRED_PRINT_MODULE_VERSION = 'raw-escpos-qz-20260512-piprinter-prod-1';
    const vendaForm = document.querySelector('.venda-form');
    const submitButton = vendaForm ? vendaForm.querySelector('button[type="submit"]') : null;
    const statusBox = document.getElementById('vendaStatus');
    const descontoInput = document.getElementById('id_desconto');
    const pesquisaProduto = document.getElementById('pesquisaProduto');
    const produtoCards = Array.from(document.querySelectorAll('.produto-card[data-produto-nome]'));
    const semResultadosBusca = document.getElementById('semResultadosBusca');
    const etiquetasModal = document.getElementById('etiquetasModal');
    const etiquetaStatus = document.getElementById('etiquetaModalStatus');
    const etiquetaBuscaProduto = document.getElementById('etiquetaBuscaProduto');
    const etiquetaResultadosProduto = document.getElementById('etiquetaResultadosProduto');
    const etiquetaQuantidade = document.getElementById('etiquetaQuantidade');
    const etiquetaTamanho = document.getElementById('etiquetaTamanho');
    const etiquetaPrinterName = document.getElementById('etiquetaPrinterName');
    const etiquetaNome = document.getElementById('etiquetaNome');
    const etiquetaPreco = document.getElementById('etiquetaPreco');
    const etiquetaCodigo = document.getElementById('etiquetaCodigo');
    const etiquetaProdutoTamanho = document.getElementById('etiquetaProdutoTamanho');
    const etiquetaCor = document.getElementById('etiquetaCor');
    const etiquetaBordaTeste = document.getElementById('etiquetaBordaTeste');
    const etiquetaPreview = document.getElementById('etiquetaPreview');
    const etiquetaComandoPreview = document.getElementById('etiquetaComandoPreview');
    const etiquetaOptions = {
        nome: document.getElementById('etiquetaMostrarNome'),
        preco: document.getElementById('etiquetaMostrarPreco'),
        codigo: document.getElementById('etiquetaMostrarCodigo'),
    };
    const LABEL_WIDTH_MM = 60;
    const LABEL_HEIGHT_MM = 40;
    const LABEL_DISPLAY_NAME = '60x40 TSPL RAW deitada';
    const TSPL_DOTS_PER_MM = 8;
    const LABEL_WIDTH_DOTS = LABEL_WIDTH_MM * TSPL_DOTS_PER_MM;
    const LABEL_HEIGHT_DOTS = LABEL_HEIGHT_MM * TSPL_DOTS_PER_MM;
    const LABEL_LAYOUT_WIDTH_DOTS = LABEL_HEIGHT_DOTS;

    function getAppConfig() {
        return window.PDV_CONFIG || {};
    }

    function toArray(value) {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            return value.split(',').map(item => item.trim()).filter(Boolean);
        }

        return [];
    }

    function normalizePrinterName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getPrinterNameFromDetail(printer) {
        if (typeof printer === 'string') {
            return printer;
        }

        return printer?.name || printer?.printerName || printer?.displayName || '';
    }

    function formatCurrency(value) {
        return Number(value || 0).toFixed(2).replace('.', ',');
    }

    function parseMoney(value) {
        const text = String(value || '').replace(/^R\$\s*/i, '').trim();
        const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatLabelPrice(value) {
        return `R$ ${formatCurrency(parseMoney(value))}`;
    }

    function formatLabelPriceCompact(value) {
        return `R$${formatCurrency(parseMoney(value))}`;
    }

    function sanitizeLabelText(value) {
        return String(value || '')
            .normalize('NFC')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u00A0/g, ' ')
            .replace(/"/g, "'")
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .trim();
    }

    function escapePreviewText(value) {
        return sanitizeLabelText(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeTsplText(value, maxLength) {
        const text = sanitizeLabelText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/"/g, "'")
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!maxLength || text.length <= maxLength) {
            return text;
        }

        return text.slice(0, maxLength).trimEnd();
    }

    function getTsplFontWidth(font, multiplier) {
        const fontWidths = {
            '1': 8,
            '2': 12,
            '3': 16,
            '4': 24,
            '5': 32,
        };

        return (fontWidths[font] || 16) * (multiplier || 1);
    }

    function fitTsplTextToWidth(value, font, multiplier, maxWidthDots) {
        const charWidth = getTsplFontWidth(font, multiplier);
        const maxLength = Math.max(Math.floor(maxWidthDots / charWidth), 1);
        return normalizeTsplText(value, maxLength);
    }

    function buildCenteredTsplText(y, value, options = {}) {
        const font = options.font || '3';
        const xMultiplier = options.xMultiplier || 1;
        const yMultiplier = options.yMultiplier || 1;
        const maxWidthDots = options.maxWidthDots || LABEL_WIDTH_DOTS;
        const text = fitTsplTextToWidth(value, font, xMultiplier, maxWidthDots);
        const charWidth = getTsplFontWidth(font, xMultiplier);
        const textWidth = text.length * charWidth;
        const x = Math.max(Math.round((LABEL_WIDTH_DOTS - textWidth) / 2), 0);

        return `TEXT ${x},${y},"${font}",0,${xMultiplier},${yMultiplier},"${text}"`;
    }

    function buildTsplText(x, y, value, options = {}) {
        const font = options.font || '2';
        const rotation = options.rotation || 0;
        const xMultiplier = options.xMultiplier || 1;
        const yMultiplier = options.yMultiplier || 1;
        const maxWidthDots = options.maxWidthDots || LABEL_WIDTH_DOTS;
        const text = fitTsplTextToWidth(value, font, xMultiplier, maxWidthDots);

        return `TEXT ${x},${y},"${font}",${rotation},${xMultiplier},${yMultiplier},"${text}"`;
    }

    function buildRotatedTsplText(x, y, value, options = {}) {
        const font = options.font || '2';
        const rotation = options.rotation || 270;
        const xMultiplier = options.xMultiplier || 1;
        const yMultiplier = options.yMultiplier || 1;
        const maxWidthDots = options.maxWidthDots || LABEL_LAYOUT_WIDTH_DOTS;
        const text = fitTsplTextToWidth(value, font, xMultiplier, maxWidthDots);
        const charWidth = getTsplFontWidth(font, xMultiplier);
        const textWidth = text.length * charWidth;
        const rotatedX = Math.max(Math.round(y), 0);
        const rotatedY = Math.max(Math.round(x + textWidth), 0);

        return `TEXT ${rotatedX},${rotatedY},"${font}",${rotation},${xMultiplier},${yMultiplier},"${text}"`;
    }

    function buildRotatedCenteredTsplText(y, value, options = {}) {
        const font = options.font || '3';
        const xMultiplier = options.xMultiplier || 1;
        const maxWidthDots = options.maxWidthDots || LABEL_LAYOUT_WIDTH_DOTS;
        const text = fitTsplTextToWidth(value, font, xMultiplier, maxWidthDots);
        const charWidth = getTsplFontWidth(font, xMultiplier);
        const textWidth = text.length * charWidth;
        const x = Math.max(Math.round((LABEL_LAYOUT_WIDTH_DOTS - textWidth) / 2), 0);

        return buildRotatedTsplText(x, y, text, {
            ...options,
            font,
            xMultiplier,
            maxWidthDots,
        });
    }

    function buildTsplBar(x, y, width, height) {
        return `BAR ${x},${y},${width},${height}`;
    }

    function buildRotatedTsplBar(x, y, width, height) {
        const rotatedX = Math.max(Math.round(y), 0);
        const rotatedY = Math.max(Math.round(LABEL_LAYOUT_WIDTH_DOTS - x - width), 0);

        return buildTsplBar(rotatedX, rotatedY, height, width);
    }

    function splitTsplProductName(value) {
        const text = normalizeTsplText(value, 30).toUpperCase();
        const words = text.split(/\s+/).filter(Boolean);

        if (text.length <= 12 || words.length <= 1) {
            return [text];
        }

        const lines = ['', ''];
        words.forEach(word => {
            const candidate = lines[0] ? `${lines[0]} ${word}` : word;
            if (!lines[1] && candidate.length <= 12) {
                lines[0] = candidate;
                return;
            }

            lines[1] = lines[1] ? `${lines[1]} ${word}` : word;
        });

        return lines.filter(Boolean).slice(0, 2);
    }

    function getProductTsplFont(value) {
        const length = sanitizeLabelText(value).length;
        if (length <= 12) {
            return '4';
        }

        return '3';
    }

    function buildLabelTSPL(dados, quantidade) {
        const copies = Math.max(parseInt(quantidade, 10) || 1, 1);
        const nome = dados.showNome === false ? '' : dados.nome || '';
        const productLines = splitTsplProductName(nome);
        const referencia = dados.showCodigo === false ? 'DLM-000' : dados.codigo || 'DLM-000';
        const tamanho = dados.produtoTamanho || 'G';
        const preco = dados.showPreco === false ? 'R$ 0,00' : formatLabelPrice(dados.preco || 0);
        const footerText = `REF: ${referencia}`;

        return [
            'SIZE 60 mm,40 mm',
            'GAP 3 mm,0 mm',
            'DIRECTION 1',
            'REFERENCE 0,0',
            'CLS',
            buildRotatedTsplBar(0, 96, LABEL_LAYOUT_WIDTH_DOTS, 3),
            buildRotatedTsplBar(0, 238, LABEL_LAYOUT_WIDTH_DOTS, 3),
            buildRotatedTsplBar(0, 330, LABEL_LAYOUT_WIDTH_DOTS, 3),
            buildRotatedTsplBar(0, 420, LABEL_LAYOUT_WIDTH_DOTS, 3),
            buildRotatedCenteredTsplText(38, "D'LIMA", { font: '3', xMultiplier: 2, maxWidthDots: 260 }),
            buildRotatedCenteredTsplText(66, 'S T O R E', { font: '2', maxWidthDots: 150 }),
            buildRotatedCenteredTsplText(118, productLines[0] || '', {
                font: getProductTsplFont(productLines[0] || ''),
                maxWidthDots: 260,
            }),
            buildRotatedCenteredTsplText(182, productLines[1] || '', {
                font: getProductTsplFont(productLines[1] || ''),
                maxWidthDots: 260,
            }),
            buildRotatedTsplText(200, 274, 'TAM:', { font: '3', maxWidthDots: 74 }),
            buildRotatedCenteredTsplText(260, tamanho, { font: '5', maxWidthDots: 120 }),
            buildRotatedCenteredTsplText(360, preco, { font: '5', maxWidthDots: 288 }),
            buildRotatedCenteredTsplText(434, footerText, { font: '2', maxWidthDots: 292 }),
            buildRotatedTsplText(46, 462, 'NAO SEJA COPIA,SEJA REFERENCIA', { font: '1', maxWidthDots: 248 }),
            `PRINT ${copies}`,
            '',
        ].join('\r\n');
    }

    function buildLabelMarkup(state) {
        const nome = state.nome || '';
        const productLines = splitTsplProductName(nome);
        const referencia = state.codigo || 'DLM-000';
        const tamanho = state.produtoTamanho || 'G';
        const preco = formatLabelPrice(state.preco || 0);

        return [
            '<div class="etiqueta-teste etiqueta-teste--tspl-simple">',
            '<header class="label-simple-brand">',
            '<span class="label-brand-main">D&#39;LIMA</span>',
            '<span class="label-brand-sub">S T O R E</span>',
            '</header>',
            '<section class="label-simple-product">',
            '<strong>' + escapePreviewText(productLines[0] || '') + '</strong>',
            '<strong>' + escapePreviewText(productLines[1] || '') + '</strong>',
            '</section>',
            '<section class="label-simple-details">',
            '<span>TAM:</span>',
            '<strong>' + escapePreviewText(tamanho) + '</strong>',
            '</section>',
            '<section class="label-simple-price">' + escapePreviewText(preco) + '</section>',
            '<footer class="label-simple-footer">',
            '<span class="label-simple-ref">REF: ' + escapePreviewText(referencia) + '</span>',
            '<span class="label-simple-quote">NAO SEJA COPIA,SEJA REFERENCIA</span>',
            '</footer>',
            '</div>',
        ].join('');
    }

    function showStatus(message, type) {
        if (!statusBox) {
            return;
        }

        statusBox.textContent = message;
        statusBox.hidden = false;
        statusBox.dataset.statusType = type || 'info';
    }

    function clearStatus() {
        if (!statusBox) {
            return;
        }

        statusBox.hidden = true;
        statusBox.textContent = '';
        delete statusBox.dataset.statusType;
    }

    function showEtiquetaStatus(message, type) {
        if (!etiquetaStatus) {
            showStatus(message, type);
            return;
        }

        etiquetaStatus.textContent = message;
        etiquetaStatus.hidden = false;
        etiquetaStatus.dataset.statusType = type || 'info';
    }

    function clearEtiquetaStatus() {
        if (!etiquetaStatus) {
            return;
        }

        etiquetaStatus.hidden = true;
        etiquetaStatus.textContent = '';
        delete etiquetaStatus.dataset.statusType;
    }

    function setSubmitting(isSubmitting) {
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;
        submitButton.textContent = isSubmitting ? 'Salvando venda...' : 'Finalizar venda';
    }

    function getCookie(name) {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const cookie of cookies) {
            const trimmed = cookie.trim();
            if (trimmed.startsWith(`${name}=`)) {
                return decodeURIComponent(trimmed.substring(name.length + 1));
            }
        }
        return '';
    }

    function calculateTotal() {
        let subtotal = 0;

        document.querySelectorAll('[data-preco]').forEach(input => {
            const preco = parseFloat(input.dataset.preco.replace(',', '.')) || 0;
            const quantidade = parseInt(input.value, 10) || 0;
            const estoque = parseInt(input.dataset.estoque, 10) || 0;
            subtotal += preco * Math.min(quantidade, estoque);
        });

        const desconto = descontoInput ? (parseFloat(descontoInput.value.replace(',', '.')) || 0) : 0;
        const total = Math.max(subtotal - desconto, 0);

        document.getElementById('totalVenda').innerText = formatCurrency(total);
        document.getElementById('subtotalVenda').innerText = `Subtotal: R$ ${formatCurrency(subtotal)}`;
    }

    function validateStock(input) {
        const quantidade = parseInt(input.value, 10) || 0;
        const estoque = parseInt(input.dataset.estoque, 10) || 0;
        const alerta = input.parentElement.querySelector('.estoque-alerta');
        const excedeu = quantidade > estoque;

        if (alerta) {
            alerta.hidden = !excedeu;
        }

        input.setCustomValidity(excedeu ? 'Quantidade maior que o estoque disponivel.' : '');
    }

    function collectSaleItems() {
        const itens = [];

        document.querySelectorAll('[data-preco]').forEach(input => {
            const quantidade = parseInt(input.value, 10) || 0;
            if (quantidade > 0) {
                itens.push({
                    produto_id: Number(input.id.replace('quantidade_', '')),
                    quantidade,
                });
            }
        });

        return itens;
    }

    function buildSalePayload() {
        return {
            vendedor_id: Number(document.getElementById('id_vendedor').value),
            forma_pagamento: document.getElementById('id_forma_pagamento').value,
            desconto: descontoInput ? (descontoInput.value || '0.00') : '0.00',
            observacao: document.getElementById('id_observacao').value.trim(),
            itens: collectSaleItems(),
        };
    }

    async function saveSale(payload) {
        // Envia a venda para o Django; o backend devolve os dados prontos para o recibo termico.
        const response = await fetch(getAppConfig().finalizeSaleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(payload),
        });

        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            throw new Error('Nao foi possivel interpretar a resposta do servidor.');
        }

        if (!response.ok || !data.success) {
            const message = data.message || 'Nao foi possivel salvar a venda.';
            const fieldErrors = data.field_errors || {};
            const details = Object.values(fieldErrors).flat().join(' ');
            throw new Error(details ? `${message} ${details}` : message);
        }

        return data;
    }

    async function printSavedReceipt(receipt) {
        if (!window.PDVReceiptPrinter) {
            throw new Error('Modulo de impressao nao foi carregado.');
        }

        if (window.PDVReceiptPrinter.version !== REQUIRED_PRINT_MODULE_VERSION) {
            console.error('[PDV_PRINT] Versao inesperada do modulo de impressao.', {
                expectedVersion: REQUIRED_PRINT_MODULE_VERSION,
                loadedVersion: window.PDVReceiptPrinter.version,
                moduleLoads: window.__PDV_PRINT_MODULE_LOADS || [],
            });
            throw new Error(`Modulo de impressao antigo em cache (${window.PDVReceiptPrinter.version || 'sem versao'}). Atualize a pagina com Ctrl+F5.`);
        }

        if (window.__PDV_PRINT_MODULE_LOADS && window.__PDV_PRINT_MODULE_LOADS.length > 1) {
            console.warn('[PDV_PRINT] Multiplas cargas do print.js detectadas.', {
                moduleLoads: window.__PDV_PRINT_MODULE_LOADS,
            });
        }

        return window.PDVReceiptPrinter.printReceipt(receipt);
    }

    function resetSaleForm() {
        if (!vendaForm) {
            return;
        }

        vendaForm.reset();
        document.querySelectorAll('[data-preco]').forEach(input => {
            validateStock(input);
        });

        if (window.TomSelect) {
            const vendedorSelect = document.getElementById('id_vendedor');
            const pagamentoSelect = document.getElementById('id_forma_pagamento');
            if (vendedorSelect && vendedorSelect.tomselect) {
                vendedorSelect.tomselect.clear();
            }
            if (pagamentoSelect && pagamentoSelect.tomselect) {
                pagamentoSelect.tomselect.clear();
            }
        }

        calculateTotal();
    }

    async function finalizarVenda(event) {
        event.preventDefault();
        clearStatus();

        let possuiErro = false;
        document.querySelectorAll('[data-preco]').forEach(input => {
            validateStock(input);
            if (!input.checkValidity()) {
                possuiErro = true;
            }
        });

        if (possuiErro) {
            showStatus('Revise as quantidades informadas antes de finalizar a venda.', 'error');
            return;
        }

        const payload = buildSalePayload();
        if (!payload.vendedor_id || !payload.forma_pagamento) {
            showStatus('Selecione o vendedor e a forma de pagamento para continuar.', 'error');
            return;
        }

        if (!payload.itens.length) {
            showStatus('Adicione ao menos um produto para finalizar a venda.', 'error');
            return;
        }

        setSubmitting(true);

        try {
            const response = await saveSale(payload);
            resetSaleForm();

            try {
                const printerName = await printSavedReceipt(response.receipt);
                const saleNumber = response.sale?.numero || response.receipt?.sale?.numero || '';
                showStatus(
                    saleNumber ? `Venda #${saleNumber} salva e impressa em ${printerName}.` : `Venda salva e impressa em ${printerName}.`,
                    'success'
                );
            } catch (printError) {
                const saleNumber = response.sale?.numero || response.receipt?.sale?.numero || '';
                showStatus(
                    saleNumber
                        ? `Venda #${saleNumber} salva com sucesso, mas a impressao falhou: ${printError.message}`
                        : `Venda salva com sucesso, mas a impressao falhou: ${printError.message}`,
                    'warning'
                );
            }
        } catch (error) {
            showStatus(error.message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    function filterProducts() {
        if (!pesquisaProduto) {
            return;
        }

        const termo = pesquisaProduto.value.trim().toLowerCase();
        let visiveis = 0;

        produtoCards.forEach(card => {
            const conteudoPesquisa = [
                card.dataset.produtoNome || '',
                card.dataset.produtoCategoria || '',
                card.dataset.produtoCor || '',
                card.dataset.produtoTamanho || '',
            ].join(' ');
            const corresponde = conteudoPesquisa.includes(termo);

            card.hidden = !corresponde;
            if (corresponde) {
                visiveis += 1;
            }
        });

        if (semResultadosBusca) {
            semResultadosBusca.hidden = visiveis > 0 || termo === '';
        }
    }

    function handleProductSearchKeydown(event) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        submitProductSearch();
    }

    function submitProductSearch() {
        if (!pesquisaProduto) {
            return;
        }

        const url = new URL(window.location.href);
        const termo = pesquisaProduto.value.trim();

        if (termo) {
            url.searchParams.set('q', termo);
        } else {
            url.searchParams.delete('q');
        }

        window.location.assign(url.toString());
    }

    function getLabelState() {
        const quantity = parseInt(etiquetaQuantidade ? etiquetaQuantidade.value : '1', 10) || 0;
        const sizeKey = 'tspl-60x40';
        const size = {
            width: LABEL_WIDTH_MM,
            height: LABEL_HEIGHT_MM,
        };
        const configuredPrinterName = etiquetaPrinterName ? etiquetaPrinterName.value : '';
        if (etiquetaTamanho) {
            etiquetaTamanho.value = LABEL_DISPLAY_NAME;
        }

        return {
            quantity,
            sizeKey,
            size,
            printerName: sanitizeLabelText(configuredPrinterName || getAppConfig().labelPrinterName || 'ELGIN'),
            nome: sanitizeLabelText(etiquetaNome ? etiquetaNome.value : ''),
            preco: sanitizeLabelText(etiquetaPreco ? etiquetaPreco.value : ''),
            codigo: sanitizeLabelText(etiquetaCodigo ? etiquetaCodigo.value : ''),
            produtoTamanho: sanitizeLabelText(etiquetaProdutoTamanho ? etiquetaProdutoTamanho.value : ''),
            cor: sanitizeLabelText(etiquetaCor ? etiquetaCor.value : ''),
            showNome: !etiquetaOptions.nome || etiquetaOptions.nome.checked,
            showPreco: !etiquetaOptions.preco || etiquetaOptions.preco.checked,
            showCodigo: !etiquetaOptions.codigo || etiquetaOptions.codigo.checked,
            testBorder: Boolean(etiquetaBordaTeste && etiquetaBordaTeste.checked),
        };
    }

    function normalizeLabelQuantity(state) {
        const quantity = Math.max(parseInt(state.quantity, 10) || 0, 0);
        if (etiquetaQuantidade) {
            etiquetaQuantidade.value = quantity > 0 ? String(quantity) : '';
        }

        return quantity;
    }

    function validateLabelState(state) {
        state.quantity = normalizeLabelQuantity(state);
        if (state.quantity <= 0) {
            throw new Error('Informe uma quantidade de etiquetas maior que zero.');
        }

        if (!state.printerName) {
            throw new Error('Informe o nome da impressora no QZ Tray.');
        }
    }

    function buildLabelCommand() {
        const state = getLabelState();
        validateLabelState(state);
        return buildLabelTSPL(state, state.quantity);
    }

    function atualizarPreviewEtiqueta() {
        if (!etiquetaPreview) {
            return;
        }

        const state = getLabelState();
        etiquetaPreview.dataset.size = state.sizeKey;

        etiquetaPreview.innerHTML = buildLabelMarkup(state);

        if (etiquetaComandoPreview) {
            try {
                etiquetaComandoPreview.textContent = buildLabelTSPL(state, state.quantity);
            } catch (error) {
                etiquetaComandoPreview.textContent = '';
            }
        }
    }

    function preencherProdutoEtiqueta(produto) {
        const codigo = produto.referencia || produto.codigo || produto.id || '';
        if (etiquetaNome) {
            etiquetaNome.value = produto.nome || '';
        }
        if (etiquetaPreco) {
            etiquetaPreco.value = formatLabelPrice(produto.preco || 0);
        }
        if (etiquetaCodigo) {
            etiquetaCodigo.value = codigo;
        }
        if (etiquetaProdutoTamanho) {
            etiquetaProdutoTamanho.value = produto.tamanho || '';
        }
        if (etiquetaCor) {
            etiquetaCor.value = produto.cor || '';
        }
        clearEtiquetaStatus();
        atualizarPreviewEtiqueta();
    }

    function renderProductResults(produtos) {
        if (!etiquetaResultadosProduto) {
            return;
        }

        etiquetaResultadosProduto.innerHTML = '';
        if (!produtos.length) {
            etiquetaResultadosProduto.hidden = false;
            etiquetaResultadosProduto.innerHTML = '<div class="label-search-empty">Nenhum produto encontrado.</div>';
            return;
        }

        produtos.forEach(produto => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'label-product-result';
            button.innerHTML = `<strong>${sanitizeLabelText(produto.nome)}</strong><span>R$ ${formatCurrency(produto.preco)} | REF: ${sanitizeLabelText(produto.referencia || produto.codigo || produto.id)} | TAM: ${sanitizeLabelText(produto.tamanho || '-')} | COR: ${sanitizeLabelText(produto.cor || '-')} | Estoque: ${produto.estoque}</span>`;
            button.addEventListener('click', () => {
                preencherProdutoEtiqueta(produto);
                etiquetaResultadosProduto.hidden = true;
            });
            etiquetaResultadosProduto.appendChild(button);
        });

        etiquetaResultadosProduto.hidden = false;
    }

    async function buscarProdutoEtiqueta() {
        if (!etiquetaBuscaProduto) {
            return;
        }

        const termo = etiquetaBuscaProduto.value.trim();
        if (!termo) {
            if (etiquetaResultadosProduto) {
                etiquetaResultadosProduto.hidden = true;
                etiquetaResultadosProduto.innerHTML = '';
            }
            return;
        }

        try {
            const url = new URL(getAppConfig().productSearchUrl || '/api/produtos/buscar/', window.location.origin);
            url.searchParams.set('q', termo);
            const response = await fetch(url.toString(), {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Nao foi possivel buscar produtos.');
            }
            renderProductResults(data.results || []);
        } catch (error) {
            showEtiquetaStatus(error.message, 'error');
        }
    }

    function abrirModalEtiquetas() {
        if (!etiquetasModal) {
            return;
        }

        etiquetasModal.hidden = false;
        document.body.classList.add('label-modal-open');
        clearEtiquetaStatus();
        atualizarPreviewEtiqueta();
        if (etiquetaBuscaProduto) {
            etiquetaBuscaProduto.focus();
        }
    }

    function fecharModalEtiquetas() {
        if (!etiquetasModal) {
            return;
        }

        etiquetasModal.hidden = true;
        document.body.classList.remove('label-modal-open');
    }

    function limparEtiquetas() {
        [etiquetaBuscaProduto, etiquetaNome, etiquetaPreco, etiquetaCodigo, etiquetaProdutoTamanho, etiquetaCor].forEach(input => {
            if (input) {
                input.value = '';
            }
        });
        if (etiquetaQuantidade) {
            etiquetaQuantidade.value = '1';
        }
        if (etiquetaTamanho) {
            etiquetaTamanho.value = LABEL_DISPLAY_NAME;
        }
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = getAppConfig().labelPrinterName || 'ELGIN';
        }
        Object.values(etiquetaOptions).forEach(option => {
            if (option) {
                option.checked = true;
            }
        });
        if (etiquetaBordaTeste) {
            etiquetaBordaTeste.checked = false;
        }
        if (etiquetaResultadosProduto) {
            etiquetaResultadosProduto.hidden = true;
            etiquetaResultadosProduto.innerHTML = '';
        }
        clearEtiquetaStatus();
        atualizarPreviewEtiqueta();
    }

    async function connectQzForLabels() {
        if (!window.qz) {
            throw new Error('QZ Tray nao foi carregado. Atualize a pagina e tente novamente.');
        }
        if (window.connectQZ) {
            await window.connectQZ();
            return;
        }
        if (!window.qz.websocket.isActive()) {
            await window.qz.websocket.connect({ retries: 3, delay: 1 });
        }
    }

    async function resolveLabelPrinter(printerName) {
        const config = getAppConfig();
        const searchTerms = [
            printerName,
            config.labelPrinterName,
            ...toArray(config.labelPrinterSearchTerms),
        ]
            .map(term => String(term || '').trim())
            .filter((term, index, terms) => term && terms.indexOf(term) === index);

        let details = [];
        try {
            const printerDetails = await window.qz.printers.details();
            details = Array.isArray(printerDetails) ? printerDetails : [];
        } catch (error) {
            details = [];
        }

        const printerNames = details.map(getPrinterNameFromDetail).filter(Boolean);

        for (const term of searchTerms) {
            const normalizedTerm = normalizePrinterName(term);
            const exactMatch = printerNames.find(name => normalizePrinterName(name) === normalizedTerm);
            if (exactMatch) {
                return exactMatch;
            }
        }

        for (const term of searchTerms) {
            const normalizedTerm = normalizePrinterName(term);
            const partialMatch = printerNames.find(name => normalizePrinterName(name).includes(normalizedTerm));
            if (partialMatch) {
                return partialMatch;
            }
        }

        for (const term of searchTerms) {
            try {
                return await window.qz.printers.find(term);
            } catch (error) {
                // Try the next configured printer alias.
            }
        }

        const availablePrinters = printerNames.length ? printerNames.join(', ') : 'nenhuma impressora retornada';
        throw new Error(`Impressora de etiquetas "${printerName}" nao encontrada no QZ Tray. Disponiveis: ${availablePrinters}.`);
    }

    function setLabelPrintButtonState(isPrinting) {
        if (imprimirEtiquetasButton) {
            imprimirEtiquetasButton.disabled = isPrinting;
            imprimirEtiquetasButton.textContent = isPrinting ? 'Imprimindo...' : 'Imprimir etiquetas';
        }

    }

    function buildLabelRawConfigOptions() {
        return {
            encoding: 'UTF-8',
        };
    }

    function buildLabelPrintData(comandoTSPL) {
        return [{
            type: 'raw',
            format: 'plain',
            data: comandoTSPL,
        }];
    }

    function logLabelTSPLDiagnostic({ state, printerName, configOptions, config, etiquetas, comandoTSPL }) {
        console.group('[DLIMA etiqueta TSPL RAW]');
        console.table({
            larguraEtiquetaMm: state.size.width,
            alturaEtiquetaMm: state.size.height,
            larguraEtiquetaDots: LABEL_WIDTH_DOTS,
            alturaEtiquetaDots: LABEL_HEIGHT_DOTS,
            quantidade: state.quantity,
        });
        console.log('Impressora resolvida:', printerName);
        console.log('qz.configs.create(printerName, configOptions) - configOptions:', configOptions);
        console.log('Objeto config retornado pelo QZ:', config);
        console.log('Array data enviado ao qz.print(config, data):', etiquetas);
        console.log('Comando TSPL enviado ao QZ:', comandoTSPL);
        console.groupEnd();
    }

    async function sendLabelTSPLToPrinter(state, comandoTSPL) {
        await connectQzForLabels();
        const printerName = await resolveLabelPrinter(state.printerName);
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = printerName;
        }
        const configOptions = buildLabelRawConfigOptions();
        const config = window.qz.configs.create(printerName, configOptions);
        const etiquetas = buildLabelPrintData(comandoTSPL);
        logLabelTSPLDiagnostic({
            state,
            printerName,
            configOptions,
            config,
            etiquetas,
            comandoTSPL,
        });
        await window.qz.print(config, etiquetas);
        return printerName;
    }

    async function printLabels() {
        clearEtiquetaStatus();
        setLabelPrintButtonState(true);

        try {
            const state = getLabelState();
            validateLabelState(state);
            atualizarPreviewEtiqueta();
            showEtiquetaStatus('Enviando etiqueta TSPL RAW para a impressora...', 'info');
            const comandoTSPL = buildLabelTSPL(state, state.quantity);
            const printerName = await sendLabelTSPLToPrinter(state, comandoTSPL);
            showEtiquetaStatus(`${state.quantity} etiqueta${state.quantity === 1 ? '' : 's'} enviada${state.quantity === 1 ? '' : 's'} para ${printerName}.`, 'success');
        } catch (error) {
            const message = /websocket|connect|qz/i.test(error.message || '')
                ? 'Nao foi possivel conectar ao QZ Tray. Verifique se ele esta aberto e tente novamente.'
                : error.message;
            showEtiquetaStatus(message, 'error');
        } finally {
            setLabelPrintButtonState(false);
        }
    }

    document.querySelectorAll('[data-preco]').forEach(input => {
        input.addEventListener('input', () => {
            validateStock(input);
            calculateTotal();
        });
        validateStock(input);
    });

    if (descontoInput) {
        descontoInput.addEventListener('input', calculateTotal);
    }

    const vendedorSelect = document.getElementById('id_vendedor');
    if (vendedorSelect && window.TomSelect) {
        new window.TomSelect(vendedorSelect, {
            create: false,
            sortField: { field: 'text', direction: 'asc' },
            placeholder: 'Selecione o vendedor',
            allowEmptyOption: true,
            maxOptions: 100,
            searchField: ['text'],
        });
    }

    const pagamentoSelect = document.getElementById('id_forma_pagamento');
    if (pagamentoSelect && window.TomSelect) {
        new window.TomSelect(pagamentoSelect, {
            create: false,
            placeholder: 'Selecione a forma de pagamento',
            allowEmptyOption: true,
            searchField: ['text'],
        });
    }

    if (pesquisaProduto) {
        filterProducts();
        pesquisaProduto.addEventListener('input', filterProducts);
        pesquisaProduto.addEventListener('keydown', handleProductSearchKeydown);
    }

    const openEtiquetasModal = document.getElementById('openEtiquetasModal');
    const closeEtiquetasModal = document.getElementById('closeEtiquetasModal');
    const fecharEtiquetas = document.getElementById('fecharEtiquetas');
    const limparEtiquetasButton = document.getElementById('limparEtiquetas');
    const imprimirEtiquetasButton = document.getElementById('imprimirEtiquetas');
    let etiquetaSearchTimeout = null;

    if (openEtiquetasModal) {
        openEtiquetasModal.addEventListener('click', abrirModalEtiquetas);
    }
    if (closeEtiquetasModal) {
        closeEtiquetasModal.addEventListener('click', fecharModalEtiquetas);
    }
    if (fecharEtiquetas) {
        fecharEtiquetas.addEventListener('click', fecharModalEtiquetas);
    }
    if (limparEtiquetasButton) {
        limparEtiquetasButton.addEventListener('click', limparEtiquetas);
    }
    if (imprimirEtiquetasButton) {
        imprimirEtiquetasButton.addEventListener('click', printLabels);
    }
    if (etiquetasModal) {
        etiquetasModal.addEventListener('click', event => {
            if (event.target === etiquetasModal) {
                fecharModalEtiquetas();
            }
        });
    }
    if (etiquetaBuscaProduto) {
        etiquetaBuscaProduto.addEventListener('input', () => {
            window.clearTimeout(etiquetaSearchTimeout);
            etiquetaSearchTimeout = window.setTimeout(buscarProdutoEtiqueta, 250);
        });
    }

    [
        etiquetaQuantidade,
        etiquetaTamanho,
        etiquetaPrinterName,
        etiquetaNome,
        etiquetaPreco,
        etiquetaCodigo,
        etiquetaProdutoTamanho,
        etiquetaCor,
        etiquetaBordaTeste,
        etiquetaOptions.nome,
        etiquetaOptions.preco,
        etiquetaOptions.codigo,
    ].forEach(input => {
        if (input) {
            input.addEventListener('input', atualizarPreviewEtiqueta);
            input.addEventListener('change', atualizarPreviewEtiqueta);
        }
    });

    if (vendaForm) {
        vendaForm.addEventListener('submit', finalizarVenda);
    }

    calculateTotal();
    atualizarPreviewEtiqueta();

    window.finalizarVenda = finalizarVenda;
    window.abrirModalEtiquetas = abrirModalEtiquetas;
    window.fecharModalEtiquetas = fecharModalEtiquetas;
    window.buscarProdutoEtiqueta = buscarProdutoEtiqueta;
    window.atualizarPreviewEtiqueta = atualizarPreviewEtiqueta;
    window.buildLabelTSPL = buildLabelTSPL;
    window.buildLabelCommand = buildLabelCommand;
    window.printLabels = printLabels;
})();
