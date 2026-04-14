(function () {
    const RECEIPT_WIDTH = 48;
    const vendaForm = document.querySelector('.venda-form');
    const submitButton = vendaForm ? vendaForm.querySelector('button[type="submit"]') : null;
    const statusBox = document.getElementById('vendaStatus');
    const descontoInput = document.getElementById('id_desconto');
    const pesquisaProduto = document.getElementById('pesquisaProduto');
    const produtoCards = Array.from(document.querySelectorAll('.produto-card[data-produto-nome]'));
    const semResultadosBusca = document.getElementById('semResultadosBusca');

    function getAppConfig() {
        return window.PDV_CONFIG || {};
    }

    async function fetchText(url) {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                'Content-Type': 'text/plain',
            },
        });

        if (!response.ok) {
            throw new Error('Falha ao carregar configuracao do QZ Tray.');
        }

        return response.text();
    }

    function formatCurrency(value) {
        return Number(value || 0).toFixed(2).replace('.', ',');
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

    function padRight(text, width) {
        return String(text).length >= width ? String(text) : String(text).padEnd(width, ' ');
    }

    function centerText(text, width) {
        const normalized = String(text || '');
        if (normalized.length >= width) {
            return normalized;
        }
        const leftPadding = Math.floor((width - normalized.length) / 2);
        return `${' '.repeat(leftPadding)}${normalized}`;
    }

    function chunkText(text, width) {
        const value = String(text || '').trim();
        if (!value) {
            return [''];
        }

        const words = value.split(/\s+/);
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const nextLine = currentLine ? `${currentLine} ${word}` : word;
            if (nextLine.length > width) {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    lines.push(word.slice(0, width));
                    currentLine = word.slice(width);
                }
            } else {
                currentLine = nextLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    function buildLineColumns(left, right, width) {
        const safeLeft = String(left || '');
        const safeRight = String(right || '');
        const available = Math.max(width - safeRight.length, 1);
        const leftLines = chunkText(safeLeft, available);
        return leftLines.map((line, index) => {
            if (index === leftLines.length - 1) {
                return `${padRight(line, available)}${safeRight}`;
            }
            return line;
        });
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

    async function ensureQzTray() {
        if (!window.qz) {
            throw new Error('QZ Tray nao foi carregado no navegador.');
        }

        if (window.qz.websocket.isActive()) {
            return;
        }

        if (!window.__qzConfigured) {
            const config = getAppConfig();

            if (config.qzCertificateUrl) {
                window.qz.security.setCertificatePromise((resolve, reject) => {
                    fetchText(config.qzCertificateUrl)
                        .then(resolve)
                        .catch(reject);
                });
            } else {
                window.qz.security.setCertificatePromise((resolve) => resolve(''));
            }

            if (config.qzSignatureUrl) {
                window.qz.security.setSignatureAlgorithm('SHA512');
                window.qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
                    fetch(`${config.qzSignatureUrl}?request=${encodeURIComponent(toSign)}`, {
                        cache: 'no-store',
                        headers: {
                            'Content-Type': 'text/plain',
                        },
                    })
                        .then(response => response.ok ? response.text() : Promise.reject(new Error('Falha ao assinar requisicao.')))
                        .then(resolve)
                        .catch(reject);
                });
            } else {
                window.qz.security.setSignaturePromise(() => (resolve) => resolve());
            }

            window.__qzConfigured = true;
        }

        await window.qz.websocket.connect({ retries: 2, delay: 1 });
    }

    async function resolvePrinter(preferredName, searchTerms) {
        if (preferredName) {
            try {
                return await window.qz.printers.find(preferredName);
            } catch (error) {
                console.warn('Impressora preferencial nao encontrada:', preferredName);
            }
        }

        const printerDetails = await window.qz.printers.details();
        const normalizedTerms = (searchTerms || []).map(term => String(term).toLowerCase());

        const matchedPrinter = printerDetails.find(printer =>
            normalizedTerms.some(term => printer.name.toLowerCase().includes(term))
        );

        if (matchedPrinter) {
            return matchedPrinter.name;
        }

        const defaultPrinter = await window.qz.printers.getDefault();
        if (defaultPrinter) {
            return defaultPrinter;
        }

        throw new Error('Nenhuma impressora termica compativel foi encontrada.');
    }

    function buildEscPosReceipt(receipt) {
        const ESC = '\x1B';
        const GS = '\x1D';
        const lines = [];
        const sale = receipt.sale;

        lines.push(`${ESC}@`);
        lines.push(`${ESC}a${String.fromCharCode(1)}`);
        lines.push(`${ESC}E${String.fromCharCode(1)}`);
        lines.push(`${centerText(receipt.store.name, RECEIPT_WIDTH)}\n`);
        lines.push(`${ESC}E${String.fromCharCode(0)}`);
        lines.push(`${centerText(`CNPJ: ${receipt.store.cnpj}`, RECEIPT_WIDTH)}\n`);
        lines.push(`${centerText(`Venda: ${sale.numero}`, RECEIPT_WIDTH)}\n`);
        lines.push(`${centerText(sale.data_hora_formatada, RECEIPT_WIDTH)}\n`);
        lines.push(`${centerText(`Vendedor: ${sale.vendedor}`, RECEIPT_WIDTH)}\n`);
        lines.push(`${'-'.repeat(RECEIPT_WIDTH)}\n`);
        lines.push(`${ESC}a${String.fromCharCode(0)}`);

        sale.itens.forEach(item => {
            chunkText(item.nome, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));
            buildLineColumns(
                `${item.quantidade} x ${item.valor_unitario}`,
                item.valor_total,
                RECEIPT_WIDTH
            ).forEach(line => lines.push(`${line}\n`));
        });

        lines.push(`${'-'.repeat(RECEIPT_WIDTH)}\n`);
        buildLineColumns('Subtotal', sale.subtotal, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));
        buildLineColumns('Desconto', sale.desconto, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));
        lines.push(`${ESC}E${String.fromCharCode(1)}`);
        buildLineColumns('TOTAL', sale.total, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));
        lines.push(`${ESC}E${String.fromCharCode(0)}`);
        buildLineColumns('Pagamento', sale.forma_pagamento, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));

        if (sale.observacao) {
            lines.push(`${'-'.repeat(RECEIPT_WIDTH)}\n`);
            chunkText(`Obs: ${sale.observacao}`, RECEIPT_WIDTH).forEach(line => lines.push(`${line}\n`));
        }

        lines.push(`${'-'.repeat(RECEIPT_WIDTH)}\n`);
        lines.push(`${ESC}a${String.fromCharCode(1)}`);
        chunkText(receipt.message, RECEIPT_WIDTH).forEach(line => lines.push(`${centerText(line, RECEIPT_WIDTH)}\n`));
        lines.push('\n\n');
        lines.push(`${GS}V${String.fromCharCode(66)}${String.fromCharCode(0)}`);
        return lines;
    }

    async function printReceipt(receipt) {
        await ensureQzTray();
        const printerName = await resolvePrinter(
            receipt.printer.preferred_name,
            receipt.printer.search_terms
        );
        const config = window.qz.configs.create(printerName, {
            encoding: 'UTF-8',
            jobName: `Recibo Venda #${receipt.sale.numero}`,
        });
        const data = [{
            type: 'raw',
            format: 'command',
            flavor: 'plain',
            data: buildEscPosReceipt(receipt),
        }];

        await window.qz.print(config, data);
        return printerName;
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
                const printerName = await printReceipt(response.receipt);
                showStatus(`Venda #${response.receipt.sale.numero} salva e impressa em ${printerName}.`, 'success');
            } catch (printError) {
                showStatus(
                    `Venda #${response.receipt.sale.numero} salva com sucesso, mas a impressao falhou: ${printError.message}`,
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
    }

    if (vendaForm) {
        vendaForm.addEventListener('submit', finalizarVenda);
    }

    calculateTotal();

    window.finalizarVenda = finalizarVenda;
    window.printReceipt = printReceipt;
    window.buildEscPosReceipt = buildEscPosReceipt;
})();
