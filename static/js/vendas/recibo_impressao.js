(function () {
    window.PDVReceiptPrinter = {
        version: 'legacy-blocked',
        print: async function () {
            throw new Error('Arquivo antigo de impressao carregado. Atualize a pagina com Ctrl+F5 para usar static/js/vendas/print.js.');
        },
    };
})();
