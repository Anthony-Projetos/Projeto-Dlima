(function () {
    const DEFAULT_RECEIPT_WIDTH = 48;
    const MIN_RECEIPT_WIDTH = 24;
    const MAX_RECEIPT_WIDTH = 64;

    function getAppConfig() {
        // Busca URLs e opcoes publicadas pelo template Django em window.PDV_CONFIG.
        return window.PDV_CONFIG || {};
    }

    // Mantem a largura do recibo dentro de um intervalo seguro para impressoras termicas.
    function getReceiptWidth(receipt) {
        const configuredWidth = Number(receipt?.printer?.width);
        if (!Number.isFinite(configuredWidth)) {
            return DEFAULT_RECEIPT_WIDTH;
        }

        return Math.max(MIN_RECEIPT_WIDTH, Math.min(Math.trunc(configuredWidth), MAX_RECEIPT_WIDTH));
    }

    async function fetchText(url) {
        // Carrega certificado/assinatura quando o QZ Tray estiver configurado para modo seguro.
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

    function padRight(text, width) {
        // Completa a direita com espacos para alinhar colunas em impressoras monoespacadas.
        const value = String(text || '');
        return value.length >= width ? value : value.padEnd(width, ' ');
    }

    function centerText(text, width) {
        // Centraliza cabecalhos como nome da loja e mensagem final.
        const value = String(text || '');
        if (value.length >= width) {
            return value;
        }

        const leftPadding = Math.floor((width - value.length) / 2);
        return `${' '.repeat(leftPadding)}${value}`;
    }

    // Quebra textos longos por palavra para nao cortar nomes de produtos no meio.
    function chunkText(text, width) {
        const value = String(text || '').trim();
        if (!value) {
            return [''];
        }

        const lines = [];
        let currentLine = '';

        value.split(/\s+/).forEach(word => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;

            if (candidate.length <= width) {
                currentLine = candidate;
                return;
            }

            if (currentLine) {
                lines.push(currentLine);
            }

            if (word.length > width) {
                lines.push(word.slice(0, width));
                currentLine = word.slice(width);
            } else {
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    function buildLineColumns(left, right, width) {
        // Monta linhas com uma informacao na esquerda e outra encostada na direita.
        const safeRight = String(right || '');
        const availableForLeft = Math.max(width - safeRight.length, 1);
        const leftLines = chunkText(left, availableForLeft);

        return leftLines.map((line, index) => {
            const isLastLine = index === leftLines.length - 1;
            return isLastLine ? `${padRight(line, availableForLeft)}${safeRight}` : line;
        });
    }

    function buildDottedLine(label, value, width) {
        // Cria linhas de totalizacao no formato "Total........123.45".
        const safeLabel = String(label || '');
        const safeValue = String(value || '');
        const dots = '.'.repeat(Math.max(width - safeLabel.length - safeValue.length, 1));
        return `${safeLabel}${dots}${safeValue}`;
    }

    // Ajusta as colunas conforme a bobina: 58mm costuma ter menos caracteres que 80mm.
    function getItemColumnSizes(width) {
        if (width <= 32) {
            return {
                code: 6,
                description: 16,
                total: 10,
            };
        }

        if (width <= 42) {
            return {
                code: 8,
                description: 22,
                total: 12,
            };
        }

        return {
            code: 10,
            description: width - 24,
            total: 14,
        };
    }

    function formatDateOnly(dateTime) {
        // Mostra apenas a data no recibo para manter o cabecalho curto.
        if (!dateTime) {
            return '';
        }

        const parsed = new Date(dateTime);
        if (Number.isNaN(parsed.getTime())) {
            return String(dateTime).slice(0, 10);
        }

        return parsed.toLocaleDateString('pt-BR');
    }

    async function configureQzSecurity() {
        // Configura certificado e assinatura uma unica vez antes de abrir a conexao com o QZ Tray.
        if (window.__qzConfigured) {
            return;
        }

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

    async function ensureQzTray() {
        // Confirma que a biblioteca existe e abre o WebSocket usado para conversar com o app QZ Tray.
        if (!window.qz) {
            throw new Error('QZ Tray nao foi carregado no navegador.');
        }

        await configureQzSecurity();

        if (!window.qz.websocket.isActive()) {
            await window.qz.websocket.connect({ retries: 2, delay: 1 });
        }
    }

    async function resolvePrinter(preferredName, searchTerms) {
        // Tenta a impressora preferida, depois busca por palavras-chave e por ultimo usa a padrao do Windows.
        if (preferredName) {
            try {
                return await window.qz.printers.find(preferredName);
            } catch (error) {
                console.warn('Impressora preferencial nao encontrada:', preferredName);
            }
        }

        const normalizedTerms = (searchTerms || []).map(term => String(term).toLowerCase());
        const printerDetails = await window.qz.printers.details();
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

    function buildItemLines(item, columns) {
        // Transforma um item da venda em duas ou mais linhas: codigo/nome/total e quantidade x unitario.
        const lines = [];
        const code = String(item.produto_id).padStart(5, '0');
        const descriptionLines = chunkText(item.nome, columns.description);
        const firstDescription = descriptionLines.shift() || '';

        lines.push(
            `${padRight(code, columns.code)}${padRight(firstDescription, columns.description)}${String(item.valor_total).padStart(columns.total, ' ')}\n`
        );

        descriptionLines.forEach(line => {
            lines.push(`${padRight('', columns.code)}${line}\n`);
        });

        lines.push(
            `${padRight('', columns.code)}${padRight(`${item.quantidade}x ${item.valor_unitario}`, columns.description)}${''.padStart(columns.total, ' ')}\n`
        );

        return lines;
    }

    function buildEscPosReceipt(receipt) {
        // Converte o recibo em comandos ESC/POS puros, que o QZ envia direto para a impressora termica.
        const ESC = '\x1B';
        const GS = '\x1D';
        const alignLeft = `${ESC}a${String.fromCharCode(0)}`;
        const alignCenter = `${ESC}a${String.fromCharCode(1)}`;
        const boldOn = `${ESC}E${String.fromCharCode(1)}`;
        const boldOff = `${ESC}E${String.fromCharCode(0)}`;
        const cutPaper = `${GS}V${String.fromCharCode(66)}${String.fromCharCode(0)}`;
        const lines = [];
        const receiptWidth = getReceiptWidth(receipt);
        const columns = getItemColumnSizes(receiptWidth);
        const sale = receipt.sale;
        const storeAddress = receipt.store.address || '';
        const customerName = receipt.customer?.name || 'CONSUMIDOR';
        const issueDate = formatDateOnly(sale.data_hora);

        // ESC/POS e o idioma que impressoras termicas entendem: inicializa, alinha, negrita e corta papel.
        lines.push(`${ESC}@`);
        lines.push(`${ESC}2`);
        lines.push(alignLeft);
        lines.push(`${buildLineColumns(issueDate, `Orc. ${sale.numero}`, receiptWidth).join('\n')}\n`);
        lines.push('\n');
        lines.push(alignCenter);
        lines.push(boldOn);
        lines.push(`${centerText(receipt.store.name, receiptWidth)}\n`);
        lines.push(boldOff);

        if (storeAddress) {
            chunkText(storeAddress, receiptWidth).forEach(line => lines.push(`${centerText(line, receiptWidth)}\n`));
        }

        lines.push(`${centerText(receipt.title, receiptWidth)}\n`);
        lines.push(`${'-'.repeat(receiptWidth)}\n`);
        lines.push(alignLeft);
        lines.push(`Cliente: ${customerName}\n`);
        lines.push(`Vendedor: ${sale.vendedor}\n`);
        lines.push(`Pagamento: ${sale.forma_pagamento}\n`);
        lines.push(`${'-'.repeat(receiptWidth)}\n`);
        lines.push(`${buildLineColumns(`Vencto.: ${issueDate}`, `Valor: ${sale.total}`, receiptWidth).join('\n')}\n`);
        lines.push(`${'-'.repeat(receiptWidth)}\n`);
        lines.push(
            `${padRight('COD.', columns.code)}${padRight('DESCRICAO', columns.description)}${'TOTAL'.padStart(columns.total, ' ')}\n`
        );

        sale.itens.forEach(item => {
            lines.push(...buildItemLines(item, columns));
        });

        lines.push(`${'-'.repeat(receiptWidth)}\n`);
        if (Number(sale.desconto || 0) > 0) {
            lines.push(`${buildDottedLine('Subtotal', sale.subtotal, receiptWidth)}\n`);
            lines.push(`${buildDottedLine('Desconto', sale.desconto, receiptWidth)}\n`);
        }
        lines.push(boldOn);
        lines.push(`${buildDottedLine('Total', sale.total, receiptWidth)}\n`);
        lines.push(boldOff);
        lines.push('\n');

        if (sale.observacao) {
            chunkText(`OBS: ${sale.observacao}`, receiptWidth).forEach(line => lines.push(`${line}\n`));
            lines.push('\n');
        }

        lines.push(alignCenter);
        chunkText(receipt.message, receiptWidth).forEach(line => lines.push(`${centerText(line, receiptWidth)}\n`));
        lines.push('\n\n');
        lines.push(cutPaper);

        return lines;
    }

    function stripEscPosCommands(value) {
        return String(value || '')
            .replace(/\x1B[@2]/g, '')
            .replace(/\x1Ba[\x00\x01]/g, '')
            .replace(/\x1BE[\x00\x01]/g, '')
            .replace(/\x1DVB\x00/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    function buildReceiptPreview(receipt) {
        return buildEscPosReceipt(receipt)
            .join('')
            .split('\n')
            .map(stripEscPosCommands)
            .join('\n');
    }

    function logReceiptPreview(receipt) {
        // Mostra no console uma versao sem comandos ESC/POS, boa para conferir sem impressora.
        console.group(`Recibo Venda #${receipt.sale.numero}`);
        console.log(buildReceiptPreview(receipt));
        console.groupEnd();
    }

    async function print(receipt) {
        // Fluxo principal: conecta no QZ, escolhe a impressora, cria o job e envia os comandos.
        logReceiptPreview(receipt);
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
            format: 'plain',
            flavor: 'plain',
            data: `${buildReceiptPreview(receipt)}\n\n\n`,
        }];

        await window.qz.print(config, data);
        return printerName;
    }

    window.PDVReceiptPrinter = {
        buildEscPosReceipt,
        buildReceiptPreview,
        logReceiptPreview,
        print,
    };
})();
