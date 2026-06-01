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
    const etiquetaTesteTexto = document.getElementById('etiquetaTesteTexto');
    const etiquetaBordaTeste = document.getElementById('etiquetaBordaTeste');
    const etiquetaPreview = document.getElementById('etiquetaPreview');
    const etiquetaHtmlPreview = document.getElementById('etiquetaHtmlPreview');
    const etiquetaOptions = {
        nome: document.getElementById('etiquetaMostrarNome'),
        preco: document.getElementById('etiquetaMostrarPreco'),
        codigo: document.getElementById('etiquetaMostrarCodigo'),
    };
    const DIAGNOSTIC_LABEL_WIDTH_MM = 60;
    const DIAGNOSTIC_LABEL_HEIGHT_MM = 40;
    const DIAGNOSTIC_LABEL_ORIENTATION = 'landscape';
    const CENTER_TEST_DEFAULT_TEXT = 'TESTE';

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

    function buildLabelMarkup(state, options = {}) {
        return [
            '<div class="etiqueta-teste">',
            'TESTE DLIMA',
            '</div>',
        ].join('');
    }

    function buildLabelPrintCss() {
        return `
@page {
    size: 60mm 40mm;
    margin: 0;
}

html, body {
    width: 60mm;
    height: 40mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

.etiqueta-teste {
    width: 60mm;
    height: 40mm;
    border: 2px solid black;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
    font-size: 20px;
    font-weight: bold;
    overflow: hidden;
}
`;
    }

    function buildLabelHtmlDocument(state, options = {}) {
        return [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8">',
            `<style>${buildLabelPrintCss()}</style>`,
            '</head>',
            '<body>',
            buildLabelMarkup(state, options),
            '</body>',
            '</html>',
        ].join('');
    }

    function buildCenteredWordTestHtml(state) {
        const word = sanitizeLabelText(etiquetaTesteTexto ? etiquetaTesteTexto.value : '') || CENTER_TEST_DEFAULT_TEXT;
        return buildLabelHtmlDocument(state, { centerText: word });
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
        const sizeKey = 'diagnostico-60x40';
        const size = {
            width: DIAGNOSTIC_LABEL_WIDTH_MM,
            height: DIAGNOSTIC_LABEL_HEIGHT_MM,
            orientation: DIAGNOSTIC_LABEL_ORIENTATION,
        };
        const configuredPrinterName = etiquetaPrinterName ? etiquetaPrinterName.value : '';
        if (etiquetaTamanho) {
            etiquetaTamanho.value = '60x40 diagnostico';
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

    function buildLabelHtml() {
        const state = getLabelState();
        validateLabelState(state);
        return buildLabelHtmlDocument(state);
    }

    function atualizarPreviewEtiqueta() {
        if (!etiquetaPreview) {
            return;
        }

        const state = getLabelState();
        etiquetaPreview.dataset.size = state.sizeKey;

        etiquetaPreview.innerHTML = buildLabelMarkup(state);

        if (etiquetaHtmlPreview) {
            try {
                etiquetaHtmlPreview.textContent = buildLabelHtmlDocument(state);
            } catch (error) {
                etiquetaHtmlPreview.textContent = '';
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
        if (etiquetaTesteTexto) {
            etiquetaTesteTexto.value = CENTER_TEST_DEFAULT_TEXT;
        }
        if (etiquetaQuantidade) {
            etiquetaQuantidade.value = '1';
        }
        if (etiquetaTamanho) {
            etiquetaTamanho.value = '60x40 diagnostico';
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

        if (imprimirTesteCentralizadoButton) {
            imprimirTesteCentralizadoButton.disabled = isPrinting;
            imprimirTesteCentralizadoButton.textContent = isPrinting ? 'Imprimindo...' : 'Teste centro';
        }
    }

    function buildLabelPrintConfigOptions(state) {
        return {
            units: 'mm',
            size: { width: state.size.width, height: state.size.height },
            orientation: state.size.orientation,
            margins: 0,
            density: 203,
            copies: state.quantity,
            scaleContent: false,
        };
    }

    function buildLabelPrintData(htmlEtiqueta, state) {
        return [{
            type: 'pixel',
            format: 'html',
            flavor: 'plain',
            data: htmlEtiqueta,
            options: {
                pageWidth: state.size.width,
                pageHeight: state.size.height,
            },
        }];
    }

    function measureLabelHtml(htmlEtiqueta) {
        return new Promise(resolve => {
            if (!document.body) {
                resolve(null);
                return;
            }

            const iframe = document.createElement('iframe');
            const timeout = window.setTimeout(() => {
                iframe.remove();
                resolve(null);
            }, 1200);

            iframe.style.position = 'fixed';
            iframe.style.left = '-10000px';
            iframe.style.top = '0';
            iframe.style.width = `${DIAGNOSTIC_LABEL_WIDTH_MM}mm`;
            iframe.style.height = `${DIAGNOSTIC_LABEL_HEIGHT_MM}mm`;
            iframe.style.border = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            iframe.setAttribute('aria-hidden', 'true');

            iframe.addEventListener('load', () => {
                window.clearTimeout(timeout);
                try {
                    const element = iframe.contentDocument.querySelector('.etiqueta-teste');
                    const rect = element ? element.getBoundingClientRect() : null;
                    resolve(rect ? {
                        widthPx: rect.width,
                        heightPx: rect.height,
                        expectedWidthPxAt96Dpi: DIAGNOSTIC_LABEL_WIDTH_MM * 96 / 25.4,
                        expectedHeightPxAt96Dpi: DIAGNOSTIC_LABEL_HEIGHT_MM * 96 / 25.4,
                    } : null);
                } catch (error) {
                    resolve(null);
                } finally {
                    iframe.remove();
                }
            });

            document.body.appendChild(iframe);
            iframe.srcdoc = htmlEtiqueta;
        });
    }

    function logLabelPrintDiagnostic({ state, printerName, configOptions, config, etiquetas, htmlEtiqueta, measurement }) {
        const summary = {
            elementWidthPx: measurement ? measurement.widthPx : null,
            elementHeightPx: measurement ? measurement.heightPx : null,
            expectedWidthPxAt96Dpi: measurement ? measurement.expectedWidthPxAt96Dpi : null,
            expectedHeightPxAt96Dpi: measurement ? measurement.expectedHeightPxAt96Dpi : null,
            qzWidthMm: state.size.width,
            qzHeightMm: state.size.height,
            qzOrientation: state.size.orientation,
            qzHtmlPageWidth: etiquetas[0]?.options?.pageWidth,
            qzHtmlPageHeight: etiquetas[0]?.options?.pageHeight,
        };

        console.group('[DLIMA etiqueta diagnostico]');
        console.table(summary);
        console.log('Impressora resolvida:', printerName);
        console.log('qz.configs.create(printerName, configOptions) - configOptions:', configOptions);
        console.log('Objeto config retornado pelo QZ:', config);
        console.log('Array data enviado ao qz.print(config, data):', etiquetas);
        console.log('HTML enviado ao QZ:', htmlEtiqueta);
        console.groupEnd();
    }

    async function sendLabelHtmlToPrinter(state, htmlEtiqueta) {
        await connectQzForLabels();
        const printerName = await resolveLabelPrinter(state.printerName);
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = printerName;
        }
        const configOptions = buildLabelPrintConfigOptions(state);
        const config = window.qz.configs.create(printerName, configOptions);
        const etiquetas = buildLabelPrintData(htmlEtiqueta, state);
        const measurement = await measureLabelHtml(htmlEtiqueta);
        logLabelPrintDiagnostic({
            state,
            printerName,
            configOptions,
            config,
            etiquetas,
            htmlEtiqueta,
            measurement,
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
            showEtiquetaStatus('Enviando etiqueta para a impressora...', 'info');
            const htmlEtiqueta = buildLabelHtmlDocument(state);
            const printerName = await sendLabelHtmlToPrinter(state, htmlEtiqueta);
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

    async function printCenteredWordTest() {
        clearEtiquetaStatus();
        setLabelPrintButtonState(true);

        try {
            const state = getLabelState();
            state.quantity = normalizeLabelQuantity(state);
            if (state.quantity <= 0) {
                throw new Error('Informe uma quantidade de etiquetas maior que zero.');
            }
            if (!state.printerName) {
                throw new Error('Informe o nome da impressora no QZ Tray.');
            }

            const word = sanitizeLabelText(etiquetaTesteTexto ? etiquetaTesteTexto.value : '') || CENTER_TEST_DEFAULT_TEXT;
            showEtiquetaStatus(`Enviando teste centralizado "${word}"...`, 'info');
            etiquetaPreview.innerHTML = buildLabelMarkup(state, { centerText: word });
            if (etiquetaHtmlPreview) {
                etiquetaHtmlPreview.textContent = buildCenteredWordTestHtml(state);
            }
            const htmlEtiqueta = buildCenteredWordTestHtml(state);
            const printerName = await sendLabelHtmlToPrinter(state, htmlEtiqueta);
            showEtiquetaStatus(`Teste centralizado enviado para ${printerName}.`, 'success');
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
    const imprimirTesteCentralizadoButton = document.getElementById('imprimirTesteCentralizado');
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
    if (imprimirTesteCentralizadoButton) {
        imprimirTesteCentralizadoButton.addEventListener('click', printCenteredWordTest);
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
        etiquetaTesteTexto,
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
    window.buildLabelHtml = buildLabelHtml;
    window.buildCenteredWordTestHtml = buildCenteredWordTestHtml;
    window.printLabels = printLabels;
    window.printCenteredWordTest = printCenteredWordTest;
})();
