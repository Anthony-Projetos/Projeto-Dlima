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
    const LABEL_WIDTH_MM = 60;
    const LABEL_HEIGHT_MM = 40;
    const TSPL_DOTS_PER_MM = 8;
    const ZPL_DOTS_PER_MM = 8;
    const LABEL_WIDTH_DOTS = LABEL_WIDTH_MM * TSPL_DOTS_PER_MM;
    const ZPL_LABEL_WIDTH_DOTS = LABEL_WIDTH_MM * ZPL_DOTS_PER_MM;
    const ZPL_LABEL_HEIGHT_DOTS = LABEL_HEIGHT_MM * ZPL_DOTS_PER_MM;
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

    function buildTsplBar(x, y, width, height) {
        return `BAR ${x},${y},${width},${height}`;
    }

    function normalizeZplText(value, maxLength) {
        const text = sanitizeLabelText(value)
            .replace(/\^/g, ' ')
            .replace(/~/g, ' ')
            .replace(/\\/g, '/')
            .replace(/\s+/g, ' ')
            .trim();

        if (!maxLength || text.length <= maxLength) {
            return text;
        }

        return text.slice(0, maxLength).trimEnd();
    }

    function buildZPLText(x, y, value, options = {}) {
        const orientation = options.orientation || 'N';
        const fontHeight = options.fontHeight || 24;
        const fontWidth = options.fontWidth || fontHeight;
        const maxLength = options.maxLength || 0;
        const text = normalizeZplText(value, maxLength);

        return `^FO${x},${y}^A0${orientation},${fontHeight},${fontWidth}^FD${text}^FS`;
    }

    function buildZPLBox(x, y, width, height, thickness = 2) {
        return `^FO${x},${y}^GB${width},${height},${thickness}^FS`;
    }

    function getLabelLayoutValues(dados) {
        return {
            nome: dados.showNome === false ? 'PRODUTO' : dados.nome || 'PRODUTO',
            referencia: dados.showCodigo === false ? '000000' : dados.codigo || '000000',
            tamanho: dados.produtoTamanho || 'G',
            preco: dados.showPreco === false ? 'R$0,00' : formatLabelPriceCompact(dados.preco || 0),
        };
    }

    function buildPremiumLabelMarkup(dados, rootClass) {
        const values = getLabelLayoutValues(dados);

        return [
            `<div class="${rootClass}">`,
            '<span class="dlima-label-line dlima-label-line--main-left"></span>',
            '<span class="dlima-label-line dlima-label-line--main-right"></span>',
            '<span class="dlima-label-line dlima-label-line--quote-left"></span>',
            '<span class="dlima-label-line dlima-label-line--quote-right"></span>',
            '<span class="dlima-label-line dlima-label-line--value-bottom"></span>',
            '<span class="dlima-label-line dlima-label-line--field-one"></span>',
            '<span class="dlima-label-line dlima-label-line--field-two"></span>',
            '<span class="dlima-label-text dlima-label-logo">D&#39;lima</span>',
            '<span class="dlima-label-text dlima-label-store">store</span>',
            '<span class="dlima-label-text dlima-label-value-title">VALOR</span>',
            `<span class="dlima-label-text dlima-label-price">${escapePreviewText(values.preco)}</span>`,
            '<span class="dlima-label-text dlima-label-product-title">PRODUTO</span>',
            `<span class="dlima-label-text dlima-label-product-value">${escapePreviewText(values.nome)}</span>`,
            '<span class="dlima-label-text dlima-label-ref-title">REF</span>',
            `<span class="dlima-label-text dlima-label-ref-value">${escapePreviewText(values.referencia)}</span>`,
            '<span class="dlima-label-text dlima-label-size-title">TAMANHO</span>',
            `<span class="dlima-label-text dlima-label-size-value">${escapePreviewText(values.tamanho)}</span>`,
            '<span class="dlima-label-text dlima-label-quote-one">&quot;Não seja cópia,</span>',
            '<span class="dlima-label-text dlima-label-quote-two">seja referência.&quot;</span>',
            '</div>',
        ].join('');
    }

    function buildLabelHtmlStyles() {
        return `
            @page {
                size: 60mm 40mm;
                margin: 0;
            }

            html,
            body {
                width: 60mm;
                min-height: 40mm;
                margin: 0;
                padding: 0;
                background: #ffffff;
            }

            * {
                box-sizing: border-box;
            }

            body {
                color: #000000;
                font-family: Arial, Helvetica, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .dlima-html-label {
                width: 60mm;
                height: 40mm;
                position: relative;
                overflow: hidden;
                background: #ffffff;
                border: 0.25mm solid #111111;
                border-radius: 1.8mm;
                page-break-after: always;
            }

            .dlima-html-label:last-child {
                page-break-after: auto;
            }

            .dlima-label-line {
                position: absolute;
                display: block;
                background: #111111;
            }

            .dlima-label-line--main-left {
                left: 20.2mm;
                top: 2.8mm;
                width: 0.22mm;
                height: 34.0mm;
            }

            .dlima-label-line--main-right {
                left: 41.0mm;
                top: 2.8mm;
                width: 0.22mm;
                height: 34.0mm;
            }

            .dlima-label-line--quote-left {
                left: 45.0mm;
                top: 2.8mm;
                width: 0.22mm;
                height: 34.0mm;
            }

            .dlima-label-line--quote-right {
                left: 54.2mm;
                top: 2.8mm;
                width: 0.22mm;
                height: 34.0mm;
            }

            .dlima-label-line--value-bottom {
                left: 20.2mm;
                top: 20.55mm;
                width: 20.8mm;
                height: 0.22mm;
            }

            .dlima-label-line--field-one {
                left: 27.35mm;
                top: 20.55mm;
                width: 0.22mm;
                height: 16.25mm;
            }

            .dlima-label-line--field-two {
                left: 34.1mm;
                top: 20.55mm;
                width: 0.22mm;
                height: 16.25mm;
            }

            .dlima-label-text {
                position: absolute;
                display: block;
                color: #111111;
                white-space: nowrap;
                line-height: 1;
                transform: rotate(-90deg);
                transform-origin: left top;
            }

            .dlima-label-logo {
                left: 5.1mm;
                top: 33.7mm;
                font-family: Georgia, "Times New Roman", serif;
                font-size: 9.4mm;
                font-style: italic;
                font-weight: 900;
                letter-spacing: 0;
            }

            .dlima-label-store {
                left: 15.8mm;
                top: 22.6mm;
                font-family: Georgia, "Times New Roman", serif;
                font-size: 2.6mm;
                font-weight: 400;
            }

            .dlima-label-value-title {
                left: 23.9mm;
                top: 19.3mm;
                font-family: Georgia, "Times New Roman", serif;
                font-size: 2.4mm;
                font-weight: 400;
            }

            .dlima-label-price {
                left: 30.8mm;
                top: 18.6mm;
                font-size: 5.4mm;
                font-weight: 900;
            }

            .dlima-label-product-title,
            .dlima-label-ref-title,
            .dlima-label-size-title {
                font-family: Georgia, "Times New Roman", serif;
                font-size: 2.35mm;
                font-weight: 400;
            }

            .dlima-label-product-value,
            .dlima-label-ref-value,
            .dlima-label-size-value {
                font-size: 1.45mm;
                font-weight: 800;
                max-width: 15.8mm;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .dlima-label-product-title {
                left: 23.8mm;
                top: 34.6mm;
            }

            .dlima-label-product-value {
                left: 26.4mm;
                top: 35.2mm;
            }

            .dlima-label-ref-title {
                left: 30.7mm;
                top: 33.1mm;
            }

            .dlima-label-ref-value {
                left: 33.2mm;
                top: 35.2mm;
            }

            .dlima-label-size-title {
                left: 37.2mm;
                top: 34.8mm;
            }

            .dlima-label-size-value {
                left: 39.7mm;
                top: 35.2mm;
            }

            .dlima-label-quote-one,
            .dlima-label-quote-two {
                font-family: Georgia, "Times New Roman", serif;
                font-size: 2.55mm;
                font-style: italic;
                font-weight: 400;
            }

            .dlima-label-quote-one {
                left: 49.0mm;
                top: 27.8mm;
            }

            .dlima-label-quote-two {
                left: 52.0mm;
                top: 27.8mm;
            }
        `;
    }

    function buildLabelHTML(dados, quantidade) {
        const copies = Math.max(parseInt(quantidade, 10) || 1, 1);
        const labels = Array.from({ length: copies }, () => (
            buildPremiumLabelMarkup(dados, 'dlima-html-label')
        )).join('');

        return [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8">',
            '<style>',
            buildLabelHtmlStyles(),
            '</style>',
            '</head>',
            '<body>',
            labels,
            '</body>',
            '</html>',
        ].join('');
    }

    function buildLabelTSPL(dados, quantidade) {
        const copies = Math.max(parseInt(quantidade, 10) || 1, 1);
        const nome = dados.showNome === false ? 'PRODUTO' : dados.nome || 'PRODUTO';
        const referencia = dados.showCodigo === false ? '000000' : dados.codigo || '000000';
        const tamanho = dados.produtoTamanho || 'G';
        const preco = dados.showPreco === false ? 'R$0,00' : formatLabelPriceCompact(dados.preco || 0);

        return [
            'SIZE 60 mm,40 mm',
            'GAP 3 mm,0 mm',
            'DIRECTION 1',
            'REFERENCE 0,0',
            'CLS',
            buildTsplBar(8, 8, 464, 2),
            buildTsplBar(8, 310, 464, 2),
            buildTsplBar(8, 8, 2, 304),
            buildTsplBar(470, 8, 2, 304),
            buildTsplBar(160, 24, 2, 272),
            buildTsplBar(332, 24, 2, 272),
            buildTsplBar(362, 24, 2, 272),
            buildTsplBar(452, 24, 2, 272),
            buildTsplBar(162, 160, 170, 2),
            buildTsplBar(218, 160, 2, 136),
            buildTsplBar(276, 160, 2, 136),
            buildTsplText(38, 286, "D'lima", { font: '5', rotation: 270, xMultiplier: 1, yMultiplier: 2, maxWidthDots: 220 }),
            buildTsplText(122, 212, 'store', { font: '2', rotation: 270, maxWidthDots: 70 }),
            buildTsplText(178, 148, 'VALOR', { font: '2', rotation: 270, maxWidthDots: 70 }),
            buildTsplText(246, 150, preco, { font: '3', rotation: 270, xMultiplier: 1, yMultiplier: 2, maxWidthDots: 118 }),
            buildTsplText(178, 292, 'PRODUTO', { font: '2', rotation: 270, maxWidthDots: 88 }),
            buildTsplText(202, 292, nome, { font: '1', rotation: 270, maxWidthDots: 112 }),
            buildTsplText(236, 292, 'REF', { font: '2', rotation: 270, maxWidthDots: 60 }),
            buildTsplText(260, 292, referencia, { font: '1', rotation: 270, maxWidthDots: 112 }),
            buildTsplText(294, 292, 'TAMANHO', { font: '2', rotation: 270, maxWidthDots: 92 }),
            buildTsplText(318, 292, tamanho, { font: '1', rotation: 270, maxWidthDots: 112 }),
            buildTsplText(392, 250, '"Nao seja copia,', { font: '2', rotation: 270, maxWidthDots: 190 }),
            buildTsplText(420, 250, 'seja referencia."', { font: '2', rotation: 270, maxWidthDots: 190 }),
            `PRINT ${copies}`,
            '',
        ].join('\r\n');
    }

    function buildLabelZPL(dados, quantidade) {
        const copies = Math.max(parseInt(quantidade, 10) || 1, 1);
        const nome = dados.showNome === false ? 'PRODUTO' : dados.nome || 'PRODUTO';
        const referencia = dados.showCodigo === false ? '000000' : dados.codigo || '000000';
        const tamanho = dados.produtoTamanho || 'G';
        const preco = dados.showPreco === false ? 'R$0,00' : formatLabelPriceCompact(dados.preco || 0);

        return [
            '^XA',
            '^PW480',
            '^LL320',
            '^CI28',
            '^LH0,0',
            buildZPLBox(8, 8, 464, 304, 2),
            buildZPLBox(160, 24, 2, 272, 2),
            buildZPLBox(332, 24, 2, 272, 2),
            buildZPLBox(362, 24, 2, 272, 2),
            buildZPLBox(452, 24, 2, 272, 2),
            buildZPLBox(162, 160, 170, 2, 2),
            buildZPLBox(218, 160, 2, 136, 2),
            buildZPLBox(276, 160, 2, 136, 2),
            buildZPLText(38, 286, 'Dlima', { orientation: 'B', fontHeight: 70, fontWidth: 44, maxLength: 6 }),
            buildZPLText(122, 212, 'store', { orientation: 'B', fontHeight: 24, fontWidth: 16, maxLength: 8 }),
            buildZPLText(178, 148, 'VALOR', { orientation: 'B', fontHeight: 24, fontWidth: 16, maxLength: 8 }),
            buildZPLText(242, 150, preco, { orientation: 'B', fontHeight: 46, fontWidth: 30, maxLength: 9 }),
            buildZPLText(178, 292, 'PRODUTO', { orientation: 'B', fontHeight: 22, fontWidth: 14, maxLength: 10 }),
            buildZPLText(202, 292, nome, { orientation: 'B', fontHeight: 16, fontWidth: 10, maxLength: 16 }),
            buildZPLText(236, 292, 'REF', { orientation: 'B', fontHeight: 22, fontWidth: 14, maxLength: 6 }),
            buildZPLText(260, 292, referencia, { orientation: 'B', fontHeight: 16, fontWidth: 10, maxLength: 16 }),
            buildZPLText(294, 292, 'TAMANHO', { orientation: 'B', fontHeight: 22, fontWidth: 14, maxLength: 10 }),
            buildZPLText(318, 292, tamanho, { orientation: 'B', fontHeight: 16, fontWidth: 10, maxLength: 16 }),
            buildZPLText(392, 250, 'Não seja cópia,', { orientation: 'B', fontHeight: 24, fontWidth: 16, maxLength: 18 }),
            buildZPLText(420, 250, 'seja referência.', { orientation: 'B', fontHeight: 24, fontWidth: 16, maxLength: 18 }),
            `^PQ${copies}`,
            '^XZ',
            '',
        ].join('\r\n');
    }

    function buildLabelMarkup(state) {
        return buildPremiumLabelMarkup(state, 'dlima-html-label etiqueta-teste etiqueta-teste--premium');
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
            etiquetaTamanho.value = '60x40 TSPL RAW';
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

    function buildLabelZPLCommand() {
        const state = getLabelState();
        validateLabelState(state);
        return buildLabelZPL(state, state.quantity);
    }

    function buildLabelHTMLCommand() {
        const state = getLabelState();
        validateLabelState(state);
        return buildLabelHTML(state, state.quantity);
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
                etiquetaHtmlPreview.textContent = buildLabelTSPL(state, state.quantity);
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
            etiquetaTamanho.value = '60x40 TSPL RAW';
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

        if (imprimirEtiquetasZplButton) {
            imprimirEtiquetasZplButton.disabled = isPrinting;
            imprimirEtiquetasZplButton.textContent = isPrinting ? 'Imprimindo...' : 'Imprimir ZPL';
        }

        if (imprimirEtiquetasHtmlButton) {
            imprimirEtiquetasHtmlButton.disabled = isPrinting;
            imprimirEtiquetasHtmlButton.textContent = isPrinting ? 'Imprimindo...' : 'Imprimir HTML';
        }

        if (imprimirTesteCentralizadoButton) {
            imprimirTesteCentralizadoButton.disabled = isPrinting;
            imprimirTesteCentralizadoButton.textContent = isPrinting ? 'Imprimindo...' : 'Teste centro';
        }
    }

    function buildLabelRawConfigOptions() {
        return {
            encoding: 'UTF-8',
        };
    }

    function buildLabelHtmlConfigOptions() {
        return {
            units: 'mm',
            size: {
                width: LABEL_WIDTH_MM,
                height: LABEL_HEIGHT_MM,
            },
            margins: 0,
            scaleContent: false,
        };
    }

    function buildLabelPrintData(comandoTSPL) {
        return [{
            type: 'raw',
            format: 'plain',
            data: comandoTSPL,
        }];
    }

    function buildLabelZPLPrintData(zpl) {
        const data = [{
            type: 'raw',
            format: 'plain',
            data: zpl,
        }];

        return data;
    }

    function buildLabelHTMLPrintData(html) {
        const data = [{
            type: 'pixel',
            format: 'html',
            flavor: 'plain',
            data: html,
        }];

        return data;
    }

    function logLabelTSPLDiagnostic({ state, printerName, configOptions, config, etiquetas, comandoTSPL }) {
        console.group('[DLIMA etiqueta TSPL RAW]');
        console.table({
            larguraEtiquetaMm: state.size.width,
            alturaEtiquetaMm: state.size.height,
            larguraEtiquetaDots: LABEL_WIDTH_DOTS,
            alturaEtiquetaDots: LABEL_HEIGHT_MM * TSPL_DOTS_PER_MM,
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

    function logLabelZPLDiagnostic({ state, printerName, configOptions, config, data, zpl }) {
        console.group('[DLIMA etiqueta ZPL RAW]');
        console.table({
            larguraEtiquetaMm: state.size.width,
            alturaEtiquetaMm: state.size.height,
            larguraEtiquetaDots: ZPL_LABEL_WIDTH_DOTS,
            alturaEtiquetaDots: ZPL_LABEL_HEIGHT_DOTS,
            quantidade: state.quantity,
        });
        console.log('Impressora resolvida:', printerName);
        console.log('qz.configs.create(printerName, configOptions) - configOptions:', configOptions);
        console.log('Objeto config retornado pelo QZ:', config);
        console.log('Array data enviado ao qz.print(config, data):', data);
        console.log('Comando ZPL enviado ao QZ:', zpl);
        console.groupEnd();
    }

    async function sendLabelZPLToPrinter(state, zpl) {
        await connectQzForLabels();
        const printerName = await resolveLabelPrinter(state.printerName);
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = printerName;
        }
        const configOptions = buildLabelRawConfigOptions();
        const config = window.qz.configs.create(printerName, configOptions);
        const data = buildLabelZPLPrintData(zpl);
        logLabelZPLDiagnostic({
            state,
            printerName,
            configOptions,
            config,
            data,
            zpl,
        });
        await window.qz.print(config, data);
        return printerName;
    }

    function logLabelHTMLDiagnostic({ state, printerName, configOptions, config, data, html }) {
        console.group('[DLIMA etiqueta HTML QZ]');
        console.table({
            larguraEtiquetaMm: state.size.width,
            alturaEtiquetaMm: state.size.height,
            quantidade: state.quantity,
        });
        console.log('Impressora resolvida:', printerName);
        console.log('qz.configs.create(printerName, configOptions) - configOptions:', configOptions);
        console.log('Objeto config retornado pelo QZ:', config);
        console.log('Array data enviado ao qz.print(config, data):', data);
        console.log('HTML enviado ao QZ:', html);
        console.groupEnd();
    }

    async function sendLabelHTMLToPrinter(state, html) {
        await connectQzForLabels();
        const printerName = await resolveLabelPrinter(state.printerName);
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = printerName;
        }
        const configOptions = buildLabelHtmlConfigOptions();
        const config = window.qz.configs.create(printerName, configOptions);
        const data = buildLabelHTMLPrintData(html);
        logLabelHTMLDiagnostic({
            state,
            printerName,
            configOptions,
            config,
            data,
            html,
        });
        await window.qz.print(config, data);
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

    async function printLabelsZPL() {
        clearEtiquetaStatus();
        setLabelPrintButtonState(true);

        try {
            const state = getLabelState();
            validateLabelState(state);
            atualizarPreviewEtiqueta();
            showEtiquetaStatus('Enviando etiqueta ZPL RAW para a impressora...', 'info');
            const zpl = buildLabelZPL(state, state.quantity);
            if (etiquetaHtmlPreview) {
                etiquetaHtmlPreview.textContent = zpl;
            }
            const printerName = await sendLabelZPLToPrinter(state, zpl);
            showEtiquetaStatus(`${state.quantity} etiqueta${state.quantity === 1 ? '' : 's'} ZPL enviada${state.quantity === 1 ? '' : 's'} para ${printerName}.`, 'success');
        } catch (error) {
            const message = /websocket|connect|qz/i.test(error.message || '')
                ? 'Nao foi possivel conectar ao QZ Tray. Verifique se ele esta aberto e tente novamente.'
                : error.message;
            showEtiquetaStatus(message, 'error');
        } finally {
            setLabelPrintButtonState(false);
        }
    }

    async function printLabelsHTML() {
        clearEtiquetaStatus();
        setLabelPrintButtonState(true);

        try {
            const state = getLabelState();
            validateLabelState(state);
            atualizarPreviewEtiqueta();
            showEtiquetaStatus('Enviando etiqueta HTML 60x40 pelo QZ Tray...', 'info');
            const html = buildLabelHTML(state, state.quantity);
            if (etiquetaHtmlPreview) {
                etiquetaHtmlPreview.textContent = html;
            }
            const printerName = await sendLabelHTMLToPrinter(state, html);
            showEtiquetaStatus(`${state.quantity} etiqueta${state.quantity === 1 ? '' : 's'} HTML enviada${state.quantity === 1 ? '' : 's'} para ${printerName}.`, 'success');
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
            const testState = {
                ...state,
                nome: word,
                codigo: 'TESTE',
                produtoTamanho: 'G',
                preco: '0',
            };
            etiquetaPreview.innerHTML = buildLabelMarkup(testState);
            if (etiquetaHtmlPreview) {
                etiquetaHtmlPreview.textContent = buildLabelTSPL(testState, state.quantity);
            }
            const comandoTSPL = buildLabelTSPL(testState, state.quantity);
            const printerName = await sendLabelTSPLToPrinter(state, comandoTSPL);
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
    const imprimirEtiquetasZplButton = document.getElementById('imprimirEtiquetasZpl');
    const imprimirEtiquetasHtmlButton = document.getElementById('imprimirEtiquetasHtml');
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
    if (imprimirEtiquetasZplButton) {
        imprimirEtiquetasZplButton.addEventListener('click', printLabelsZPL);
    }
    if (imprimirEtiquetasHtmlButton) {
        imprimirEtiquetasHtmlButton.addEventListener('click', printLabelsHTML);
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
    window.buildLabelTSPL = buildLabelTSPL;
    window.buildLabelZPL = buildLabelZPL;
    window.buildLabelHTML = buildLabelHTML;
    window.buildLabelCommand = buildLabelCommand;
    window.buildLabelZPLCommand = buildLabelZPLCommand;
    window.buildLabelHTMLCommand = buildLabelHTMLCommand;
    window.printLabels = printLabels;
    window.printLabelsZPL = printLabelsZPL;
    window.printLabelsHTML = printLabelsHTML;
    window.printCenteredWordTest = printCenteredWordTest;
})();
