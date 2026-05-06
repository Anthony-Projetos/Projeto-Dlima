(function () {
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
        // Envia a venda para o Django; se a venda for salva, o servidor devolve o recibo pronto para imprimir.
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
            console.error(
                'O modulo static/js/vendas/recibo_impressao.js nao carregou. Rode collectstatic/deploy dos arquivos estaticos para habilitar a previa do recibo.',
                receipt
            );
            throw new Error('Modulo de impressao de recibo nao foi carregado.');
        }

        // A tela de venda nao conhece comandos de impressora; ela apenas entrega o recibo ao modulo especializado.
        return window.PDVReceiptPrinter.print(receipt);
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
})();
