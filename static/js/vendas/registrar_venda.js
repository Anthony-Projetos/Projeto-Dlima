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
    const etiquetaLinguagem = document.getElementById('etiquetaLinguagem');
    const etiquetaPrinterName = document.getElementById('etiquetaPrinterName');
    const etiquetaNome = document.getElementById('etiquetaNome');
    const etiquetaPreco = document.getElementById('etiquetaPreco');
    const etiquetaCodigo = document.getElementById('etiquetaCodigo');
    const etiquetaProdutoTamanho = document.getElementById('etiquetaProdutoTamanho');
    const etiquetaCor = document.getElementById('etiquetaCor');
    const etiquetaPreview = document.getElementById('etiquetaPreview');
    const etiquetaCommandPreview = document.getElementById('etiquetaCommandPreview');
    const etiquetaOptions = {
        nome: document.getElementById('etiquetaMostrarNome'),
        preco: document.getElementById('etiquetaMostrarPreco'),
        codigo: document.getElementById('etiquetaMostrarCodigo'),
    };
    const LABEL_DOTS_PER_MM = 8;
    const LABEL_SAFE_MARGIN_DOTS = 24;
    const LABEL_FONT_WIDTHS = {
        '0': 8,
        '1': 8,
        '2': 12,
        '3': 16,
    };
    const DLIMA_LABEL_STORE_NAME = 'Dlima Store';
    const DLIMA_LABEL_QUOTE_LINES = [
        'Nao seja copia,',
        'seja referencia',
    ];
    const labelSizes = {
        '40x60': { width: 40, height: 60, gap: 2, layout: 'dlima-clothing' },
        '60x40': { width: 60, height: 40, gap: 2, layout: 'dlima-clothing' },
        '40x30': { width: 40, height: 30, gap: 2, layout: 'dlima-clothing' },
        '60x30': { width: 60, height: 30, gap: 2, vertical: true },
        '40x80': { width: 40, height: 80, gap: 2, brandY: 38, nameY: 170, detailsY: 260, colorY: 335, priceY: 520 },
        '50x80': { width: 50, height: 80, gap: 2, brandY: 38, nameY: 170, detailsY: 260, colorY: 335, priceY: 520 },
        '60x80': { width: 60, height: 80, gap: 2, brandY: 38, nameY: 170, detailsY: 260, colorY: 335, priceY: 520 },
    };

    function getAppConfig() {
        return window.PDV_CONFIG || {};
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

    function onlyBarcodeText(value) {
        return sanitizeLabelText(value).replace(/[^A-Za-z0-9\-_.]/g, '') || '00000';
    }

    function fitLabelText(value, maxLength) {
        const text = sanitizeLabelText(value).toUpperCase();
        if (text.length <= maxLength) {
            return text;
        }

        return text.slice(0, Math.max(maxLength - 1, 1)).trimEnd();
    }

    function clampLabelValue(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getFontCharWidth(font) {
        return LABEL_FONT_WIDTHS[String(font)] || LABEL_FONT_WIDTHS['1'];
    }

    function getEstimatedTextWidth(text, font, xMul) {
        return sanitizeLabelText(text).length * getFontCharWidth(font) * (xMul || 1);
    }

    function getMaxCharsForWidth(font, xMul, maxWidth) {
        const charWidth = getFontCharWidth(font) * (xMul || 1);
        return Math.max(Math.floor(maxWidth / charWidth), 1);
    }

    function splitLabelText(value, maxChars, maxLines) {
        const source = sanitizeLabelText(value).toUpperCase();
        if (!source) {
            return [];
        }

        const words = source.split(/\s+/).filter(Boolean);
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const pending = currentLine ? `${currentLine} ${word}` : word;
            if (pending.length <= maxChars) {
                currentLine = pending;
                return;
            }

            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }

            if (word.length > maxChars) {
                lines.push(fitLabelText(word, maxChars));
            } else {
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.slice(0, maxLines).map(line => fitLabelText(line, maxChars));
    }

    function fitTextForCommand(item, text) {
        if (!item.maxWidth || item.noFit) {
            return sanitizeLabelText(text);
        }

        return fitLabelText(text, getMaxCharsForWidth(item.font, item.xMul, item.maxWidth));
    }

    function getAlignedTextX(geometry, item, text) {
        if (item.align !== 'center') {
            return item.x;
        }

        const maxWidth = item.maxWidth || (geometry.designWidthDots - (LABEL_SAFE_MARGIN_DOTS * 2));
        const textWidth = getEstimatedTextWidth(text, item.font, item.xMul);
        const centeredX = Math.round((geometry.designWidthDots - textWidth) / 2);
        const minX = Math.max(Math.round((geometry.designWidthDots - maxWidth) / 2), 0);
        const maxX = Math.max(geometry.designWidthDots - LABEL_SAFE_MARGIN_DOTS - textWidth, minX);

        return clampLabelValue(centeredX, minX, maxX);
    }

    function getVerticalLabelLines(state) {
        const lines = [];
        lines.push({ x: 14, font: '3', xMul: 1, yMul: 1, text: "D'lima" });

        if (state.showNome && state.nome) {
            lines.push({ x: 48, font: '2', xMul: 1, yMul: 1, text: fitLabelText(state.nome, 24) });
        }

        const details = [];
        if (state.showCodigo && state.codigo) {
            details.push(`REF: ${fitLabelText(state.codigo, 12)}`);
        }
        if (state.produtoTamanho) {
            details.push(`TAM: ${fitLabelText(state.produtoTamanho, 5)}`);
        }
        if (details.length) {
            lines.push({ x: 82, font: '2', xMul: 1, yMul: 1, text: details.join('  ') });
        }

        if (state.cor) {
            lines.push({ x: 116, font: '2', xMul: 1, yMul: 1, text: `COR: ${fitLabelText(state.cor, 14)}` });
        }
        if (state.showPreco && state.preco) {
            lines.push({ x: 156, font: '3', xMul: 2, yMul: 2, text: `R$ ${formatCurrency(parseMoney(state.preco))}` });
        }

        return lines;
    }

    function shouldPrintVertically(size) {
        const mediaAspect = size.width / size.height;
        const designAspect = (size.designWidth || size.width) / (size.designHeight || size.height);
        return mediaAspect > 1 && designAspect < 1;
    }

    function getLabelGeometry(size) {
        const mediaWidthDots = Math.round(size.width * LABEL_DOTS_PER_MM);
        const mediaHeightDots = Math.round(size.height * LABEL_DOTS_PER_MM);
        const verticalPrint = shouldPrintVertically(size);

        return {
            mediaWidthDots,
            mediaHeightDots,
            designWidthDots: Math.round((size.designWidth || (verticalPrint ? size.height : size.width)) * LABEL_DOTS_PER_MM),
            designHeightDots: Math.round((size.designHeight || (verticalPrint ? size.width : size.height)) * LABEL_DOTS_PER_MM),
            verticalPrint,
        };
    }

    function transformLabelPoint(geometry, x, y) {
        if (!geometry.verticalPrint) {
            return { x, y, rotation: 0, zplOrientation: 'N' };
        }

        const rotatedTextInsetDots = 42;
        return {
            x: y,
            y: geometry.designWidthDots - x - rotatedTextInsetDots,
            rotation: 90,
            zplOrientation: 'R',
        };
    }

    function transformLabelRect(geometry, rect) {
        if (!geometry.verticalPrint) {
            return rect;
        }

        return {
            x: rect.y,
            y: geometry.designWidthDots - rect.x - rect.width,
            width: rect.height,
            height: rect.width,
        };
    }

    function escapeZplText(value) {
        return sanitizeLabelText(value).replace(/[\^~]/g, ' ');
    }

    function tsplTextCommand(geometry, item) {
        const text = fitTextForCommand(item, item.text);
        const x = getAlignedTextX(geometry, item, text);
        const point = transformLabelPoint(geometry, x, item.y);
        return `TEXT ${Math.round(point.x)},${Math.round(point.y)},"${item.font}",${point.rotation},${item.xMul},${item.yMul},"${text}"`;
    }

    function zplTextCommand(geometry, item) {
        const text = fitTextForCommand(item, item.text);
        const x = getAlignedTextX(geometry, item, text);
        const point = transformLabelPoint(geometry, x, item.y);
        if (item.align === 'center' && !geometry.verticalPrint) {
            const blockWidth = Math.round(item.maxWidth || (geometry.designWidthDots - (LABEL_SAFE_MARGIN_DOTS * 2)));
            const blockX = Math.round((geometry.designWidthDots - blockWidth) / 2);
            return `^FO${blockX},${Math.round(point.y)}^A0N,${item.zplHeight},${item.zplWidth}^FB${blockWidth},1,0,C,0^FD${escapeZplText(text)}^FS`;
        }

        return `^FO${Math.round(point.x)},${Math.round(point.y)}^A0${point.zplOrientation},${item.zplHeight},${item.zplWidth}^FD${escapeZplText(text)}^FS`;
    }

    function tsplBarCommand(geometry, item) {
        const rect = transformLabelRect(geometry, item);
        return `BAR ${Math.round(rect.x)},${Math.round(rect.y)},${Math.max(Math.round(rect.width), 1)},${Math.max(Math.round(rect.height), 1)}`;
    }

    function zplBarCommand(geometry, item) {
        const rect = transformLabelRect(geometry, item);
        const width = Math.max(Math.round(rect.width), 1);
        const height = Math.max(Math.round(rect.height), 1);
        const thickness = Math.max(Math.min(width, height), 1);
        return `^FO${Math.round(rect.x)},${Math.round(rect.y)}^GB${width},${height},${thickness},B,0^FS`;
    }

    function buildDlimaClothingLayout(state) {
        const geometry = getLabelGeometry(state.size);
        const labelWidth = geometry.designWidthDots;
        const labelHeight = geometry.designHeightDots;
        const contentWidth = Math.max(labelWidth - (LABEL_SAFE_MARGIN_DOTS * 2), 1);
        const compact = labelHeight <= 260;
        const productFont = compact ? '1' : '2';
        const productMaxLines = compact ? 1 : 2;
        const productMaxChars = getMaxCharsForWidth(productFont, 1, contentWidth);
        const productLines = state.showNome && state.nome
            ? splitLabelText(state.nome, productMaxChars, productMaxLines)
            : [];
        const details = [];
        const elements = [
            {
                type: 'text',
                align: 'center',
                x: 0,
                y: Math.round(labelHeight * 0.06),
                font: '3',
                xMul: 1,
                yMul: 1,
                zplHeight: compact ? 28 : 34,
                zplWidth: compact ? 24 : 28,
                maxWidth: contentWidth,
                noFit: true,
                text: DLIMA_LABEL_STORE_NAME,
            },
        ];

        productLines.forEach((line, index) => {
            elements.push({
                type: 'text',
                align: 'center',
                x: 0,
                y: Math.round(labelHeight * 0.20) + (index * (compact ? 18 : 28)),
                font: productFont,
                xMul: 1,
                yMul: 1,
                zplHeight: compact ? 20 : 26,
                zplWidth: compact ? 18 : 22,
                maxWidth: contentWidth,
                text: line,
            });
        });

        if (state.showCodigo && state.codigo) {
            details.push(`REF: ${fitLabelText(state.codigo, compact ? 12 : 16)}`);
        }
        if (state.produtoTamanho) {
            details.push(`TAM: ${fitLabelText(state.produtoTamanho, compact ? 4 : 6)}`);
        }
        if (details.length) {
            elements.push({
                type: 'text',
                align: 'center',
                x: 0,
                y: Math.round(labelHeight * 0.34),
                font: '1',
                xMul: 1,
                yMul: 1,
                zplHeight: compact ? 18 : 22,
                zplWidth: compact ? 14 : 16,
                maxWidth: contentWidth,
                text: details.join('   '),
            });
        }

        if (state.showPreco && state.preco) {
            elements.push({
                type: 'text',
                align: 'center',
                x: 0,
                y: Math.round(labelHeight * 0.48),
                font: '3',
                xMul: 1,
                yMul: compact ? 1 : 2,
                zplHeight: compact ? 34 : 54,
                zplWidth: compact ? 28 : 36,
                maxWidth: contentWidth,
                noFit: true,
                text: formatLabelPrice(state.preco),
            });
        }

        const footerY = Math.round(labelHeight * 0.82);
        if (compact) {
            elements.push({
                type: 'text',
                align: 'center',
                x: 0,
                y: footerY,
                font: '1',
                xMul: 1,
                yMul: 1,
                zplHeight: 18,
                zplWidth: 14,
                maxWidth: contentWidth,
                noFit: true,
                text: DLIMA_LABEL_QUOTE_LINES.join(' '),
            });
        } else {
            DLIMA_LABEL_QUOTE_LINES.forEach((line, index) => {
                elements.push({
                    type: 'text',
                    align: 'center',
                    x: 0,
                    y: footerY + (index * 22),
                    font: '1',
                    xMul: 1,
                    yMul: 1,
                    zplHeight: 20,
                    zplWidth: 14,
                    maxWidth: contentWidth,
                    noFit: true,
                    text: index === 0 ? `"${line}` : `${line}"`,
                });
            });
        }

        return elements;
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
        const sizeKey = etiquetaTamanho ? etiquetaTamanho.value : '40x60';
        const configuredPrinterName = etiquetaPrinterName ? etiquetaPrinterName.value : '';

        return {
            quantity,
            sizeKey,
            size: labelSizes[sizeKey] || labelSizes['40x60'],
            language: etiquetaLinguagem ? etiquetaLinguagem.value : 'TSPL',
            printerName: sanitizeLabelText(configuredPrinterName || getAppConfig().labelPrinterName || 'ELGIN'),
            nome: sanitizeLabelText(etiquetaNome ? etiquetaNome.value : ''),
            preco: sanitizeLabelText(etiquetaPreco ? etiquetaPreco.value : ''),
            codigo: sanitizeLabelText(etiquetaCodigo ? etiquetaCodigo.value : ''),
            produtoTamanho: sanitizeLabelText(etiquetaProdutoTamanho ? etiquetaProdutoTamanho.value : ''),
            cor: sanitizeLabelText(etiquetaCor ? etiquetaCor.value : ''),
            showNome: !etiquetaOptions.nome || etiquetaOptions.nome.checked,
            showPreco: !etiquetaOptions.preco || etiquetaOptions.preco.checked,
            showCodigo: !etiquetaOptions.codigo || etiquetaOptions.codigo.checked,
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

        const printableFields = [
            state.showNome && state.nome,
            state.showPreco && state.preco,
            state.showCodigo && state.codigo,
            state.produtoTamanho,
        ];
        if (state.size.layout !== 'dlima-clothing') {
            printableFields.push(state.cor);
        }
        const hasContent = printableFields.some(Boolean);

        if (!hasContent) {
            throw new Error('Informe ao menos um conteudo para imprimir na etiqueta.');
        }

        if (!state.printerName) {
            throw new Error('Informe o nome da impressora no QZ Tray.');
        }
    }

    function buildTsplLabelPayload() {
        const state = getLabelState();
        validateLabelState(state);
        if (state.size.layout === 'dlima-clothing') {
            const geometry = getLabelGeometry(state.size);
            const commands = [
                `SIZE ${state.size.width} mm,${state.size.height} mm`,
                `GAP ${state.size.gap} mm,0 mm`,
                'DIRECTION 1',
                'REFERENCE 0,0',
                'CODEPAGE UTF-8',
                'CLS',
            ];

            buildDlimaClothingLayout(state).forEach(item => {
                commands.push(item.type === 'bar' ? tsplBarCommand(geometry, item) : tsplTextCommand(geometry, item));
            });

            commands.push(`PRINT 1,${state.quantity}`);
            return `${commands.join('\n')}\n`;
        }

        const commands = [
            `SIZE ${state.size.width} mm,${state.size.height} mm`,
            `GAP ${state.size.gap} mm,0 mm`,
            'DIRECTION 1',
            'REFERENCE 0,0',
            'CODEPAGE UTF-8',
            'CLS',
        ];
        const labelWidth = Math.round(state.size.width * LABEL_DOTS_PER_MM);

        if (state.size.vertical) {
            const labelHeight = Math.round(state.size.height * LABEL_DOTS_PER_MM);
            getVerticalLabelLines(state).forEach(line => {
                commands.push(`TEXT ${line.x},${labelHeight - 18},"${line.font}",90,${line.xMul},${line.yMul},"${line.text}"`);
            });
            commands.push(`PRINT 1,${state.quantity}`);
            return `${commands.join('\n')}\n`;
        }

        commands.push(`TEXT ${Math.max(Math.round(labelWidth / 2) - 60, 20)},${state.size.brandY},"3",0,2,2,"D'lima"`);
        if (state.showNome && state.nome) {
            commands.push(`TEXT 20,${state.size.nameY},"3",0,1,1,"${state.nome.toUpperCase()}"`);
        }
        if (state.showCodigo && state.codigo) {
            commands.push(`TEXT 20,${state.size.detailsY},"3",0,1,1,"Ref: ${state.codigo}"`);
        }
        if (state.produtoTamanho) {
            commands.push(`TEXT ${Math.round(labelWidth * 0.66)},${state.size.detailsY},"3",0,1,1,"TAM: ${state.produtoTamanho.toUpperCase()}"`);
        }
        if (state.cor) {
            commands.push(`TEXT 20,${state.size.colorY},"3",0,1,1,"COR: ${state.cor.toUpperCase()}"`);
        }
        if (state.showPreco && state.preco) {
            commands.push(`TEXT 20,${state.size.priceY},"3",0,2,2,"R$"`);
            commands.push(`TEXT ${Math.round(labelWidth * 0.54)},${state.size.priceY},"3",0,2,2,"${formatCurrency(parseMoney(state.preco))}"`);
        }

        commands.push(`PRINT 1,${state.quantity}`);
        return `${commands.join('\n')}\n`;
    }

    function buildZplLabelPayload() {
        const state = getLabelState();
        validateLabelState(state);
        const dotsPerMm = LABEL_DOTS_PER_MM;
        const widthDots = Math.round(state.size.width * dotsPerMm);
        const heightDots = Math.round(state.size.height * dotsPerMm);
        const commands = ['^XA', `^PW${widthDots}`, `^LL${heightDots}`, '^CI28'];

        if (state.size.layout === 'dlima-clothing') {
            const geometry = getLabelGeometry(state.size);
            buildDlimaClothingLayout(state).forEach(item => {
                commands.push(item.type === 'bar' ? zplBarCommand(geometry, item) : zplTextCommand(geometry, item));
            });

            commands.push(`^PQ${state.quantity}`, '^XZ');
            return `${commands.join('\n')}\n`;
        }

        if (state.size.vertical) {
            getVerticalLabelLines(state).forEach(line => {
                const height = line.font === '3' ? 30 * line.yMul : 24 * line.yMul;
                const width = line.font === '3' ? 24 * line.xMul : 22 * line.xMul;
                commands.push(`^FO${line.x},${heightDots - 18}^A0R,${height},${width}^FD${line.text}^FS`);
            });
            commands.push(`^PQ${state.quantity}`, '^XZ');
            return `${commands.join('\n')}\n`;
        }

        commands.push(`^FO${Math.max(Math.round(widthDots / 2) - 58, 20)},${state.size.brandY}^A0N,40,34^FDD'lima^FS`);
        if (state.showNome && state.nome) {
            commands.push(`^FO20,${state.size.nameY}^A0N,34,30^FD${state.nome.toUpperCase()}^FS`);
        }
        if (state.showCodigo && state.codigo) {
            commands.push(`^FO20,${state.size.detailsY}^A0N,32,26^FDRef: ${state.codigo}^FS`);
        }
        if (state.produtoTamanho) {
            commands.push(`^FO${Math.round(widthDots * 0.66)},${state.size.detailsY}^A0N,32,26^FDTAM: ${state.produtoTamanho.toUpperCase()}^FS`);
        }
        if (state.cor) {
            commands.push(`^FO20,${state.size.colorY}^A0N,32,26^FDCOR: ${state.cor.toUpperCase()}^FS`);
        }
        if (state.showPreco && state.preco) {
            commands.push(`^FO20,${state.size.priceY}^A0N,44,38^FDR$^FS`);
            commands.push(`^FO${Math.round(widthDots * 0.54)},${state.size.priceY}^A0N,56,46^FD${formatCurrency(parseMoney(state.preco))}^FS`);
        }

        commands.push(`^PQ${state.quantity}`, '^XZ');
        return `${commands.join('\n')}\n`;
    }

    function buildLabelPayload() {
        return getLabelState().language === 'ZPL' ? buildZplLabelPayload() : buildTsplLabelPayload();
    }

    function atualizarPreviewEtiqueta() {
        if (!etiquetaPreview) {
            return;
        }

        const state = getLabelState();
        const nameNode = etiquetaPreview.querySelector('[data-preview-name]');
        const priceNode = etiquetaPreview.querySelector('[data-preview-price]');
        const codeNode = etiquetaPreview.querySelector('[data-preview-code]');
        const sizeNode = etiquetaPreview.querySelector('[data-preview-size]');
        const colorNode = etiquetaPreview.querySelector('[data-preview-color]');

        etiquetaPreview.dataset.size = state.sizeKey;
        etiquetaPreview.dataset.orientation = shouldPrintVertically(state.size) ? 'vertical' : 'horizontal';
        if (nameNode) {
            nameNode.textContent = state.nome ? splitLabelText(state.nome, 24, 2).join(' ') : 'Produto';
            nameNode.hidden = !state.showNome;
        }
        if (priceNode) {
            priceNode.textContent = state.preco ? formatCurrency(parseMoney(state.preco)) : '0,00';
            priceNode.hidden = !state.showPreco;
            if (priceNode.parentElement) {
                priceNode.parentElement.hidden = !state.showPreco;
            }
        }
        if (codeNode) {
            codeNode.textContent = state.codigo ? `REF: ${fitLabelText(state.codigo, 16)}` : 'REF: 0000000';
            codeNode.hidden = !state.showCodigo;
        }
        if (sizeNode) {
            sizeNode.textContent = state.produtoTamanho ? `TAM: ${fitLabelText(state.produtoTamanho, 6)}` : 'TAM: G';
        }
        if (colorNode) {
            colorNode.textContent = `COR: ${(state.cor || 'PRETO').toUpperCase()}`;
        }

        if (etiquetaCommandPreview) {
            try {
                etiquetaCommandPreview.textContent = buildLabelPayload();
            } catch (error) {
                etiquetaCommandPreview.textContent = '';
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
            etiquetaTamanho.value = '40x60';
        }
        if (etiquetaLinguagem) {
            etiquetaLinguagem.value = getAppConfig().labelLanguage || 'TSPL';
        }
        if (etiquetaPrinterName) {
            etiquetaPrinterName.value = getAppConfig().labelPrinterName || 'ELGIN';
        }
        Object.values(etiquetaOptions).forEach(option => {
            if (option) {
                option.checked = true;
            }
        });
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
        try {
            return await window.qz.printers.find(printerName);
        } catch (error) {
            const details = await window.qz.printers.details();
            const normalized = printerName.toLowerCase();
            const match = details.find(printer => String(printer.name).toLowerCase().includes(normalized));
            if (match) {
                return match.name;
            }
            throw new Error(`Impressora "${printerName}" nao encontrada no QZ Tray.`);
        }
    }

    function setLabelPrintButtonState(isPrinting) {
        if (!imprimirEtiquetasButton) {
            return;
        }

        imprimirEtiquetasButton.disabled = isPrinting;
        imprimirEtiquetasButton.textContent = isPrinting ? 'Imprimindo...' : 'Imprimir etiquetas';
    }

    async function printLabels() {
        clearEtiquetaStatus();
        setLabelPrintButtonState(true);

        try {
            const state = getLabelState();
            validateLabelState(state);
            showEtiquetaStatus('Enviando etiqueta para a impressora...', 'info');
            const payload = buildLabelPayload();
            await connectQzForLabels();
            const printerName = await resolveLabelPrinter(state.printerName);
            const config = window.qz.configs.create(printerName, {
                encoding: 'UTF-8',
            });
            const data = [{
                type: 'raw',
                format: 'command',
                flavor: 'plain',
                data: payload,
            }];

            await window.qz.print(config, data);
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
        etiquetaLinguagem,
        etiquetaPrinterName,
        etiquetaNome,
        etiquetaPreco,
        etiquetaCodigo,
        etiquetaProdutoTamanho,
        etiquetaCor,
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
    window.buildTsplLabelPayload = buildTsplLabelPayload;
    window.printLabels = printLabels;
})();
