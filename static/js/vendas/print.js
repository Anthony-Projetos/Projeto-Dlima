(function () {
    const PRINT_MODULE_VERSION = 'raw-escpos-qz-20260510-80mm-1';
    const DEFAULT_RECEIPT_WIDTH = 48;
    const MIN_RECEIPT_WIDTH = 48;
    const MAX_RECEIPT_WIDTH = 48;
    const DEFAULT_ENCODING = 'CP860';
    const DEFAULT_PRINTER_NAME = 'ELGIN i9(USB)';
    const DEFAULT_SEARCH_TERMS = ['ELGIN i9(USB)', 'ELGIN', 'I9', 'POS-58', 'BEMATECH'];

    const ESC = '\x1B';
    const GS = '\x1D';

    const ESC_POS = {
        init: `${ESC}@`,
        fontANormal: `${ESC}!\x00${ESC}M\x00${GS}!\x00`,
        fontBNormal: `${ESC}!\x01${ESC}M\x01${GS}!\x00`,
        noCharacterSpacing: `${ESC} \x00`,
        defaultLineSpacing: `${ESC}2`,
        leftMarginZero: `${GS}L\x00\x00`,
        leftMarginCentered58mm: `${GS}L\x0C\x00`,
        printArea58mm: `${GS}W\x80\x01`,
        printAreaCentered58mm: `${GS}W\x68\x01`,
        printArea80mm: `${GS}W\x40\x02`,
        alignLeft: `${ESC}a\x00`,
        alignCenter: `${ESC}a\x01`,
        boldOn: `${ESC}E\x01`,
        boldOff: `${ESC}E\x00`,
        cutPaper: `${GS}V\x42\x00`,
        openDrawer: `${ESC}p\x00\x19\xFA`,
        codePages: {
            CP850: `${ESC}t\x02`,
            CP860: `${ESC}t\x03`,
        },
    };

    const EXAMPLE_RECEIPT = {
        store: {
            name: 'DLIMA STORE',
            address: 'AV. CONRRADI SEGUNDO',
        },
        sale: {
            numero: '000123',
            data: '09/05/2026',
            vendedor: 'Anthony',
            forma_pagamento: 'PIX',
            subtotal: '159.80',
            desconto: '0.00',
            total: '159.80',
            itens: [
                { quantidade: 1, nome: 'Camiseta', valor_total: '59.90' },
                { quantidade: 2, nome: 'Bermuda', valor_total: '99.90' },
            ],
        },
        printer: {
            preferred_name: DEFAULT_PRINTER_NAME,
            search_terms: DEFAULT_SEARCH_TERMS,
            encoding: DEFAULT_ENCODING,
            width: DEFAULT_RECEIPT_WIDTH,
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
            headers: { 'Accept': 'text/plain' },
        });

        if (!response.ok) {
            throw new Error('Falha ao carregar configuracao de seguranca do QZ Tray.');
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
                    headers: { 'Accept': 'text/plain' },
                })
                    .then(response => response.ok ? response.text() : Promise.reject(new Error('Falha ao assinar requisicao do QZ Tray.')))
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
            throw new Error('QZ Tray nao foi carregado. Confira o script qz-tray.js no template.');
        }

        await configureQZSecurity();

        if (!window.qz.websocket.isActive()) {
            await window.qz.websocket.connect({ retries: 3, delay: 1 });
        }

        return window.qz.websocket.isActive();
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

    async function resolvePrinter(venda) {
        const config = getAppConfig();
        const printer = venda?.printer || {};
        const preferredName = printer.preferred_name || config.printerName || DEFAULT_PRINTER_NAME;
        const searchTerms = toArray(printer.search_terms || config.printerSearchTerms || DEFAULT_SEARCH_TERMS);

        if (preferredName) {
            try {
                return await window.qz.printers.find(preferredName);
            } catch (error) {
                console.warn('Impressora preferencial nao encontrada:', preferredName);
            }
        }

        const normalizedTerms = searchTerms.map(term => String(term).toLowerCase());
        const printerDetails = await window.qz.printers.details();
        const matchedPrinter = printerDetails.find(printer =>
            normalizedTerms.some(term => String(printer.name).toLowerCase().includes(term))
        );

        if (matchedPrinter) {
            return matchedPrinter.name;
        }

        const defaultPrinter = await window.qz.printers.getDefault();
        if (defaultPrinter) {
            return defaultPrinter;
        }

        throw new Error('Nenhuma impressora termica foi encontrada pelo QZ Tray.');
    }

    function getReceiptWidth(venda) {
        const configuredWidth = Number(venda?.printer?.width || getAppConfig().receiptWidth || DEFAULT_RECEIPT_WIDTH);

        if (!Number.isFinite(configuredWidth)) {
            return DEFAULT_RECEIPT_WIDTH;
        }

        return Math.max(MIN_RECEIPT_WIDTH, Math.min(Math.trunc(configuredWidth), MAX_RECEIPT_WIDTH));
    }

    function getEncoding(venda) {
        const configured = venda?.printer?.encoding || getAppConfig().receiptEncoding || DEFAULT_ENCODING;
        const normalized = String(configured).toUpperCase();
        return normalized === 'CP850' ? 'CP850' : 'CP860';
    }

    function getCodePageCommand(encoding) {
        return ESC_POS.codePages[encoding] || ESC_POS.codePages.CP860;
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

    function center(value, width) {
        const text = takeText(value, width);
        const left = Math.floor((width - textLength(text)) / 2);
        return repeat(' ', left) + text;
    }

    function line(width, char = '=') {
        return repeat(char, width);
    }

    function leftRight(left, right, width) {
        const leftText = sanitizeText(left);
        const rightText = sanitizeText(right);
        return `${padRight(leftText, width - textLength(rightText))}${rightText}`;
    }

    function placeText(lineText, value, start, width) {
        const chars = Array.from(padRight(lineText, width));
        const text = takeText(value, Math.max(width - start, 0));

        Array.from(text).forEach((char, index) => {
            if (start + index < width) {
                chars[start + index] = char;
            }
        });

        return chars.join('');
    }

    function threeColumns(left, middle, right, width) {
        let output = repeat(' ', width);
        const middleStart = Math.max(Math.floor((width - textLength(middle)) / 2), 0);
        const rightStart = Math.max(width - textLength(right), 0);

        output = placeText(output, left, 0, width);
        output = placeText(output, middle, middleStart, width);
        output = placeText(output, right, rightStart, width);

        return output;
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

    function formatShortNumber(value) {
        const text = String(value || '').replace(/^0+/, '');
        return text || '0';
    }

    function formatQuantity(value) {
        const parsed = Number(String(value || '1').replace(',', '.'));
        if (!Number.isFinite(parsed)) {
            return sanitizeText(value);
        }

        return parsed.toFixed(2).replace('.', ',');
    }

    function formatProductCode(item) {
        const code = item.codigo || item.produto_codigo || item.produto_id || item.id || '';
        return String(code || '').padStart(5, '0').slice(-5);
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }

        const text = String(value);
        const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (brDate) {
            return `${brDate[1]}/${brDate[2]}/${brDate[3]}`;
        }

        const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoDate) {
            return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
        }

        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) {
            return text.slice(0, 10);
        }

        return parsed.toLocaleDateString('pt-BR');
    }

    function stringToHex(str) {
        return Array.from(str)
            .map(char => char.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase();
    }

    function wrapText(value, width) {
        const words = sanitizeText(value).trim().split(/\s+/).filter(Boolean);
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;

            if (textLength(candidate) <= width) {
                currentLine = candidate;
                return;
            }

            if (currentLine) {
                lines.push(currentLine);
            }

            while (textLength(word) > width) {
                lines.push(takeText(word, width));
                word = Array.from(word).slice(width).join('');
            }

            currentLine = word;
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.length ? lines : [''];
    }

    function moneyLine(label, value, width) {
        return `${padRight(label, width - 10)}${padLeft(formatMoney(value), 10)}`;
    }

    function itemLines(item, width) {
        const quantity = sanitizeText(item.quantidade || item.qtd || 1);
        const name = sanitizeText(item.nome || item.descricao || item.produto || 'Produto');
        const total = formatMoney(item.valor_total || item.total || item.subtotal);
        const prefix = `${takeText(quantity, 4)}x `;
        const totalWidth = 10;
        const nameWidth = Math.max(width - totalWidth - textLength(prefix), 8);
        const wrappedName = wrapText(name, nameWidth);
        const lines = [];

        lines.push(`${prefix}${padRight(wrappedName.shift(), nameWidth)}${padLeft(total, totalWidth)}`);
        wrappedName.forEach(part => {
            lines.push(`${padRight('', textLength(prefix))}${takeText(part, width - textLength(prefix))}`);
        });

        return lines;
    }

    function budgetItemLines(item, width) {
        const codeWidth = 10;
        const descriptionIndent = codeWidth + 3;
        const code = formatProductCode(item);
        const name = sanitizeText(item.nome || item.descricao || item.produto || 'Produto').toUpperCase();
        const quantity = formatQuantity(item.quantidade || item.qtd || 1);
        const unitPrice = formatMoney(item.valor_unitario || item.preco_unitario || item.preco || item.valor_total || item.total || item.subtotal);
        const total = formatMoney(item.valor_total || item.total || item.subtotal);

        if (width <= 34) {
            const compactDescriptionWidth = Math.max(width - 9, 12);
            const compactNameLines = wrapText(name, compactDescriptionWidth);
            const lines = [];

            lines.push(center(`${code} - ${takeText(compactNameLines.shift(), compactDescriptionWidth)}`, width));

            compactNameLines.forEach(part => {
                lines.push(center(takeText(part, width), width));
            });

            lines.push(center(`QTD: ${quantity}  UNT: ${unitPrice}`, width));
            lines.push(center(`VLR: ${total}`, width));

            return lines;
        }

        const descriptionWidth = Math.max(width - descriptionIndent, 12);
        const nameLines = wrapText(name, descriptionWidth);
        const lines = [];

        lines.push(`${padRight(code, codeWidth)}-  ${takeText(nameLines.shift(), descriptionWidth)}`);

        nameLines.forEach(part => {
            lines.push(`${padRight('', descriptionIndent)}${takeText(part, descriptionWidth)}`);
        });

        lines.push(
            `${padRight('', descriptionIndent)}${padLeft(quantity, 5)} x ${padLeft(unitPrice, 8)}${padLeft(total, width - descriptionIndent - 5 - 3 - 8)}`
        );

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
                orcamento: formatShortNumber(sale.numero || sale.id || venda.numero || venda.id),
                data: formatDate(sale.data || sale.data_hora || venda.data || venda.data_hora),
                vencimento: formatDate(sale.vencimento || sale.data || sale.data_hora || venda.vencimento || venda.data || venda.data_hora),
                cliente: sanitizeText(sale.cliente || venda.cliente || 'CONSUMIDOR').toUpperCase(),
                comprador: sanitizeText(sale.comprador || venda.comprador || ''),
                vendedor: sanitizeText(sale.vendedor || venda.vendedor || ''),
                pagamento: sanitizeText(sale.forma_pagamento || sale.pagamento || venda.forma_pagamento || venda.pagamento || ''),
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
        const width = getReceiptWidth(receipt);
        const useEscPos = Boolean(options.escpos);
        const lines = [];
        const fiscalNotice = '* ORCAMENTO SEM VALOR FISCAL *';
        const total = formatMoney(receipt.sale.total);

        lines.push(threeColumns(receipt.sale.data, 'Orc.', receipt.sale.orcamento, width));
        lines.push(center(receipt.store.name, width));

        if (receipt.store.address) {
            lines.push(center(receipt.store.address.toUpperCase(), width));
        }

        lines.push('');
        lines.push(useEscPos ? `${ESC_POS.boldOn}${center(fiscalNotice, width)}${ESC_POS.boldOff}` : center(fiscalNotice, width));
        lines.push(line(width, '-'));
        lines.push('');
        lines.push(center(`Cliente: ${receipt.sale.cliente}`, width));
        lines.push('');
        lines.push(center(receipt.sale.comprador || 'Comprador', width));

        if (receipt.sale.vendedor) {
            lines.push(center(`Vendedor: ${receipt.sale.vendedor.toUpperCase()}`, width));
        }

        lines.push('');
        lines.push(useEscPos ? `${ESC_POS.boldOn}${center('Vencimentos...', width)}${ESC_POS.boldOff}` : center('Vencimentos...', width));
        if (width <= 34) {
            lines.push(center(`Vencto...: ${receipt.sale.vencimento || receipt.sale.data}`, width));
            lines.push(center(`Valor...: ${total}`, width));
        } else {
            lines.push(leftRight(`Vencto...: ${receipt.sale.vencimento || receipt.sale.data}`, `Valor...: ${total}`, width));
        }
        lines.push(line(width, '-'));
        lines.push(center('CODIGO | DESCRICAO', width));
        if (width > 34) {
            lines.push(`${padRight('', 14)}QTD | UNT.R$ |${padLeft('VLR$', width - 27)}`);
        }
        lines.push('');

        receipt.sale.itens.forEach(item => {
            budgetItemLines(item, width).forEach(itemLine => lines.push(itemLine));
            lines.push('');
        });

        lines.push('');
        lines.push('');
        lines.push(line(width, '-'));
        lines.push(center(`Total.........: ${total}`, width));
        lines.push('');
        lines.push(center('OBS', width));

        if (receipt.sale.observacao) {
            wrapText(receipt.sale.observacao, width).forEach(observationLine => {
                lines.push(center(observationLine, width));
            });
        }

        lines.push('');
        lines.push('');
        lines.push(center('VOLTE SEMPRE!!!', width));

        return `${lines.join('\n')}\n`;
    }

    function buildEscPosPayload(venda) {
        const receipt = normalizeVenda(venda);
        const encoding = getEncoding(receipt);
        const commands = [
            ESC_POS.init,
            getCodePageCommand(encoding),
            ESC_POS.fontANormal,
            ESC_POS.noCharacterSpacing,
            ESC_POS.defaultLineSpacing,
            ESC_POS.leftMarginZero,
            ESC_POS.printArea80mm,
            ESC_POS.alignLeft,
            buildReceiptText(receipt, { escpos: true }),
            '\n\n\n',
            ESC_POS.cutPaper,
        ];

        if (receipt.printer.open_drawer) {
            commands.splice(2, 0, ESC_POS.openDrawer);
        }

        return commands.join('');
    }

    function createQzConfig(printerName, venda) {
        return window.qz.configs.create(printerName, {
            encoding: getEncoding(venda)
        });
    }

    async function printReceipt(venda) {
        await connectQZ();

        const printerName = await resolvePrinter(venda);
        const config = createQzConfig(printerName, venda);
        const data = [{
            type: 'raw',
            format: 'command',
            flavor: 'plain',
            data: buildEscPosPayload(venda),
        }];

        await window.qz.print(config, data);
    }

    async function testarImpressao() {
        return printReceipt(EXAMPLE_RECEIPT);
    }

    window.PDV_PRINT_VERSION = PRINT_MODULE_VERSION;
    window.connectQZ = connectQZ;
    window.testarImpressao = testarImpressao;
    window.printReceipt = printReceipt;
    window.buildReceiptText = buildReceiptText;
    window.buildEscPosPayload = buildEscPosPayload;
    window.PDVReceiptPrinter = {
        version: PRINT_MODULE_VERSION,
        connectQZ,
        testarImpressao,
        printReceipt,
        print: printReceipt,
        buildReceiptText,
        buildEscPosPayload,
        example: EXAMPLE_RECEIPT,
    };
})();
