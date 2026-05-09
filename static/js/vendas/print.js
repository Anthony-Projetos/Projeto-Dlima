(function () {
    const PRINT_MODULE_VERSION = 'raw-escpos-20260509-6';
    const RECEIPT_WIDTH = 32;
    const DEFAULT_ENCODING = 'CP860';
    const DEFAULT_PRINTER_NAME = 'ELGIN i9(USB)';
    const DEFAULT_SEARCH_TERMS = ['ELGIN i9(USB)', 'ELGIN', 'I9', 'EPSON', 'TM-T20', 'POS-58', 'BEMATECH'];
    const ESC = '\x1B';
    const GS = '\x1D';

    const ESC_POS = {
        init: `${ESC}@`,
        alignLeft: `${ESC}a\x00`,
        boldOn: `${ESC}E\x01`,
        boldOff: `${ESC}E\x00`,
        cut: `${GS}V\x42\x00`,
        drawer: `${ESC}p\x00\x19\xFA`,
        codePages: {
            CP850: `${ESC}t\x02`,
            CP860: `${ESC}t\x03`,
        },
    };

    const PRINT_EXAMPLE = {
        store: {
            name: 'DLIMA STORE',
            address: 'Rua Exemplo, 123',
        },
        sale: {
            numero: '000123',
            data_hora: '2026-05-06T12:00:00',
            vendedor: 'Anthony',
            forma_pagamento: 'PIX',
            subtotal: '159.80',
            desconto: '10.00',
            total: '149.80',
            itens: [
                { quantidade: 1, nome: 'Camiseta', valor_total: '59.90' },
                { quantidade: 2, nome: 'Bermuda', valor_total: '99.90' },
            ],
        },
        printer: {
            preferred_name: 'ELGIN i9(USB)',
            search_terms: DEFAULT_SEARCH_TERMS,
            encoding: DEFAULT_ENCODING,
            open_drawer: false,
        },
        message: 'Obrigado pela prefer\u00EAncia!',
    };

    function getAppConfig() {
        return window.PDV_CONFIG || {};
    }

    async function fetchText(url) {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain' },
        });

        if (!response.ok) {
            throw new Error('Falha ao carregar configuracao do QZ Tray.');
        }

        return response.text();
    }

    async function configureQZSecurity() {
        if (window.__pdvQzSecurityConfigured) {
            return;
        }

        const config = getAppConfig();

        if (config.qzCertificateUrl) {
            window.qz.security.setCertificatePromise((resolve, reject) => {
                fetchText(config.qzCertificateUrl).then(resolve).catch(reject);
            });
        } else {
            window.qz.security.setCertificatePromise((resolve) => resolve(''));
        }

        if (config.qzSignatureUrl) {
            window.qz.security.setSignatureAlgorithm('SHA512');
            window.qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
                fetch(`${config.qzSignatureUrl}?request=${encodeURIComponent(toSign)}`, {
                    cache: 'no-store',
                    headers: { 'Content-Type': 'text/plain' },
                })
                    .then(response => response.ok ? response.text() : Promise.reject(new Error('Falha ao assinar requisicao.')))
                    .then(resolve)
                    .catch(reject);
            });
        } else {
            window.qz.security.setSignaturePromise(() => (resolve) => resolve());
        }

        window.__pdvQzSecurityConfigured = true;
    }

    async function connectQZ() {
        if (!window.qz) {
            throw new Error('QZ Tray nao foi carregado no navegador.');
        }

        await configureQZSecurity();

        if (!window.qz.websocket.isActive()) {
            await window.qz.websocket.connect({ retries: 3, delay: 1 });
        }

        return window.qz.websocket.isActive();
    }

    async function resolvePrinter(venda) {
        const config = getAppConfig();
        const printer = venda?.printer || {};
        const preferredName = printer.preferred_name || config.printerName || DEFAULT_PRINTER_NAME;
        const searchTerms = asArray(printer.search_terms || config.printerSearchTerms || DEFAULT_SEARCH_TERMS);

        if (preferredName) {
            try {
                return await window.qz.printers.find(preferredName);
            } catch (error) {
                console.warn('Impressora preferencial nao encontrada:', preferredName);
            }
        }

        const normalizedTerms = searchTerms.map(term => String(term).toLowerCase());
        const details = await window.qz.printers.details();
        const matchedPrinter = details.find(printer =>
            normalizedTerms.some(term => String(printer.name).toLowerCase().includes(term))
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

    function asArray(value) {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            return value.split(',').map(item => item.trim()).filter(Boolean);
        }

        return [];
    }

    function getEncoding(venda) {
        const configured = venda?.printer?.encoding || getAppConfig().receiptEncoding || DEFAULT_ENCODING;
        const normalized = String(configured).toUpperCase();
        return normalized === 'CP850' ? 'CP850' : 'CP860';
    }

    function textLength(value) {
        return Array.from(String(value || '')).length;
    }

    function takeText(value, width) {
        return Array.from(String(value || '')).slice(0, width).join('');
    }

    function repeat(char, width) {
        return char.repeat(Math.max(width, 0));
    }

    function padRight(value, width) {
        const text = takeText(value, width);
        return text + repeat(' ', width - textLength(text));
    }

    function padLeft(value, width) {
        const text = takeText(value, width);
        return repeat(' ', width - textLength(text)) + text;
    }

    function center(value, width = RECEIPT_WIDTH) {
        const text = takeText(value, width);
        const left = Math.floor((width - textLength(text)) / 2);
        return repeat(' ', left) + text;
    }

    function line(char = '=') {
        return repeat(char, RECEIPT_WIDTH);
    }

    function sanitizeText(value) {
        return String(value || '')
            .normalize('NFC')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u00A0/g, ' ')
            .replace(/[^\x09\x0A\x0D\x20-\x7E\u00C0-\u00FF]/g, '');
    }

    function formatMoney(value) {
        if (value === null || value === undefined || value === '') {
            return '0,00';
        }

        const text = sanitizeText(value).replace(/^R\$\s*/i, '').trim();
        const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
        const parsed = Number(normalized);

        if (!Number.isFinite(parsed)) {
            return text.replace('.', ',');
        }

        return parsed.toFixed(2).replace('.', ',');
    }

    function formatSaleNumber(value) {
        return String(value || '').padStart(6, '0').slice(-6);
    }

    function formatDateOnly(value) {
        if (!value) {
            return '';
        }

        const text = String(value);
        const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (brazilianDate) {
            return `${brazilianDate[1]}/${brazilianDate[2]}/${brazilianDate[3]}`;
        }

        const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoDate) {
            return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return text.slice(0, 10);
        }

        return parsed.toLocaleDateString('pt-BR');
    }

    function wrapText(value, width) {
        const words = sanitizeText(value).trim().split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';

        words.forEach(word => {
            const candidate = current ? `${current} ${word}` : word;
            if (textLength(candidate) <= width) {
                current = candidate;
                return;
            }

            if (current) {
                lines.push(current);
            }

            while (textLength(word) > width) {
                lines.push(takeText(word, width));
                word = Array.from(word).slice(width).join('');
            }

            current = word;
        });

        if (current) {
            lines.push(current);
        }

        return lines.length ? lines : [''];
    }

    function moneyLine(label, value) {
        return `${padRight(label, 18)}${padLeft(formatMoney(value), 14)}`;
    }

    function itemLines(item) {
        const quantity = sanitizeText(item.quantidade || item.qtd || 1);
        const name = sanitizeText(item.nome || item.descricao || item.produto || 'Produto');
        const total = formatMoney(item.valor_total || item.total || item.subtotal);
        const prefix = `${takeText(quantity, 4)}x `;
        const totalWidth = 10;
        const nameWidth = Math.max(RECEIPT_WIDTH - totalWidth - textLength(prefix), 8);
        const nameParts = wrapText(name, nameWidth);
        const lines = [];

        lines.push(`${prefix}${padRight(nameParts.shift(), nameWidth)}${padLeft(total, totalWidth)}`);
        nameParts.forEach(part => {
            lines.push(`${padRight('', textLength(prefix))}${takeText(part, RECEIPT_WIDTH - textLength(prefix))}`);
        });

        return lines;
    }

    function normalizeVenda(venda) {
        const sale = venda.sale || venda;
        const store = venda.store || {};
        const items = sale.itens || venda.itens || [];

        return {
            store: {
                name: sanitizeText(store.name || getAppConfig().storeName || 'DLIMA STORE').toUpperCase(),
                address: sanitizeText(store.address || getAppConfig().storeAddress || ''),
            },
            sale: {
                numero: formatSaleNumber(sale.numero || sale.id || venda.numero || venda.id),
                data: formatDateOnly(sale.data_hora || sale.data_hora_formatada || sale.data || venda.data),
                vendedor: sanitizeText(sale.vendedor || venda.vendedor || ''),
                pagamento: sanitizeText(sale.forma_pagamento || sale.pagamento || venda.pagamento || venda.forma_pagamento || ''),
                subtotal: sale.subtotal || venda.subtotal || sale.total || venda.total,
                desconto: sale.desconto || venda.desconto || '0.00',
                total: sale.total || venda.total || '0.00',
                observacao: sanitizeText(sale.observacao || venda.observacao || ''),
                itens: items,
            },
            printer: venda.printer || {},
            message: sanitizeText(venda.message || 'Obrigado pela prefer\u00EAncia!'),
        };
    }

    function buildReceiptText(venda, options = {}) {
        const receipt = normalizeVenda(venda);
        const escpos = Boolean(options.escpos);
        const lines = [];

        lines.push(line('='));
        lines.push(center(receipt.store.name));

        if (receipt.store.address) {
            wrapText(receipt.store.address, RECEIPT_WIDTH).forEach(addressLine => {
                lines.push(center(addressLine));
            });
        }

        lines.push(line('='));
        lines.push(`Venda: ${receipt.sale.numero}`);
        lines.push(`Data: ${receipt.sale.data}`);

        if (receipt.sale.vendedor) {
            lines.push(`Vendedor: ${receipt.sale.vendedor}`);
        }

        lines.push('');
        receipt.sale.itens.forEach(item => {
            lines.push(...itemLines(item));
        });

        lines.push('');
        lines.push(line('-'));
        lines.push(moneyLine('Subtotal:', receipt.sale.subtotal));

        if (Number(String(receipt.sale.desconto).replace(',', '.')) > 0) {
            lines.push(moneyLine('Desconto:', receipt.sale.desconto));
        }

        const totalLine = moneyLine('TOTAL:', receipt.sale.total);
        lines.push(escpos ? `${ESC_POS.boldOn}${totalLine}${ESC_POS.boldOff}` : totalLine);
        lines.push(line('='));
        lines.push('');

        if (receipt.sale.pagamento) {
            lines.push(`Pagamento: ${receipt.sale.pagamento}`);
            lines.push('');
        }

        if (receipt.sale.observacao) {
            wrapText(`OBS: ${receipt.sale.observacao}`, RECEIPT_WIDTH).forEach(observationLine => {
                lines.push(observationLine);
            });
            lines.push('');
        }

        wrapText(receipt.message, RECEIPT_WIDTH).forEach(messageLine => {
            lines.push(messageLine);
        });
        lines.push(line('='));

        return lines.join('\n');
    }

    function buildPrintPayload(venda) {
        return `${buildReceiptText(venda)}\n\n\n`;
    }

    function buildEscPosPayload(venda) {
        const receipt = normalizeVenda(venda);
        const encoding = getEncoding(venda);
        const commands = [
            ESC_POS.init,
            ESC_POS.codePages[encoding],
            ESC_POS.alignLeft,
        ];

        if (receipt.printer.open_drawer || receipt.printer.openDrawer) {
            commands.push(ESC_POS.drawer);
        }

        commands.push(buildReceiptText(receipt, { escpos: true }));
        commands.push('\n\n\n');
        commands.push(ESC_POS.cut);
        return commands.join('');
    }

    async function printReceipt(venda) {
        await connectQZ();

        const printerName = await resolvePrinter(venda);
        const encoding = getEncoding(venda);
        const config = window.qz.configs.create(printerName, {
            encoding,
            jobName: `Recibo Venda ${normalizeVenda(venda).sale.numero}`,
            copies: 1,
        });
        const data = [buildEscPosPayload(venda)];

        await window.qz.print(config, data);
        return printerName;
    }

    window.connectQZ = connectQZ;
    window.printReceipt = printReceipt;
    window.PDV_PRINT_VERSION = PRINT_MODULE_VERSION;
    window.buildReceiptText = buildReceiptText;
    window.buildPrintPayload = buildPrintPayload;
    window.buildEscPosPayload = buildEscPosPayload;
    window.PDVPrintExample = PRINT_EXAMPLE;
    window.PDVPrintExampleText = () => buildReceiptText(PRINT_EXAMPLE);
    window.PDVPrintExampleEscPos = () => buildEscPosPayload(PRINT_EXAMPLE);
    window.PDVReceiptPrinter = {
        version: PRINT_MODULE_VERSION,
        connectQZ,
        print: printReceipt,
        printReceipt,
        buildReceiptText,
        buildPrintPayload,
        buildEscPosPayload,
        example: PRINT_EXAMPLE,
    };
})();
