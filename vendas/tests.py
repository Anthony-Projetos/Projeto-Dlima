import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from core.models import Vendedor
from .models import ItemVenda, Produto, Venda
from .services import build_receipt_payload


class RegistrarVendaBuscaTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='teste',
            password='123456'
        )
        self.vendedor = Vendedor.objects.create(
            nome='Carlos',
            percentual_comissao=10,
            ativo=True
        )
        self.client.login(username='teste', password='123456')

        Produto.objects.create(
            nome='Camisa Polo Azul',
            categoria='Camisas',
            cor='Azul',
            tamanho='M',
            preco='99.90',
            estoque=10,
            ativo=True,
        )
        Produto.objects.create(
            nome='Calca Jeans Preta',
            categoria='Calcas',
            cor='Preta',
            tamanho='42',
            preco='149.90',
            estoque=8,
            ativo=True,
        )

    def test_busca_por_nome_retorna_produto_correspondente(self):
        response = self.client.get(reverse('registrar_venda'), {'q': 'polo'})

        self.assertContains(response, 'Camisa Polo Azul')
        self.assertNotContains(response, 'Calca Jeans Preta')

    def test_busca_por_detalhe_retorna_produto_correspondente(self):
        response = self.client.get(reverse('registrar_venda'), {'q': 'preta'})

        self.assertContains(response, 'Calca Jeans Preta')
        self.assertNotContains(response, 'Camisa Polo Azul')

    @override_settings(PDV_LABEL_SETTINGS={
        'printer_name': 'ELGIN L42PRO FULL',
        'printer_search_terms': ['ELGIN L42PRO FULL', 'ELGIN', 'L42'],
    })
    def test_registrar_venda_expoe_configuracao_da_impressora_de_etiquetas(self):
        response = self.client.get(reverse('registrar_venda'))

        self.assertContains(response, '"labelPrinterName": "ELGIN L42PRO FULL"')
        self.assertContains(response, '"labelPrinterSearchTerms": ["ELGIN L42PRO FULL", "ELGIN", "L42"]')
        self.assertContains(response, 'value="ELGIN L42PRO FULL"')
        self.assertContains(response, 'id="etiquetaBordaTeste"')
        self.assertContains(response, 'id="etiquetaComandoPreview"')
        self.assertNotContains(response, 'id="imprimirEtiquetasHtml"')
        self.assertNotContains(response, 'id="imprimirEtiquetasZpl"')
        self.assertNotContains(response, 'id="imprimirTesteCentralizado"')

    def test_finalizar_venda_retorna_dados_para_impressao(self):
        produto = Produto.objects.get(nome='Camisa Polo Azul')
        payload = {
            'vendedor_id': self.vendedor.id,
            'forma_pagamento': 'pix',
            'desconto': '0.00',
            'observacao': '',
            'itens': [
                {
                    'produto_id': produto.id,
                    'quantidade': 1,
                }
            ],
        }

        response = self.client.post(
            reverse('finalizar_venda_api'),
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )

        data = response.json()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(data['success'])
        self.assertIn('sale', data)
        self.assertIn('receipt', data)
        self.assertEqual(data['receipt']['sale']['numero'], data['sale']['numero'])
        self.assertEqual(data['receipt']['printer']['encoding'], 'CP860')


class LabelPrintingFrontendTests(TestCase):
    def test_js_de_etiquetas_usa_tspl_raw_60x40(self):
        source = Path(settings.BASE_DIR / 'static/js/vendas/registrar_venda.js').read_text(encoding='utf-8')
        template = Path(settings.BASE_DIR / 'templates/vendas/registrar_venda.html').read_text(encoding='utf-8')

        self.assertIn('function buildLabelTSPL(dados, quantidade)', source)
        self.assertIn('SIZE 60 mm,40 mm', source)
        self.assertIn('GAP 3 mm,0 mm', source)
        self.assertIn('DIRECTION 1', source)
        self.assertIn('REFERENCE 0,0', source)
        self.assertIn('CLS', source)
        self.assertIn('function splitTsplProductName(value)', source)
        self.assertIn('function getProductTsplFont(value)', source)
        self.assertIn('LABEL_DISPLAY_NAME', source)
        self.assertIn('LABEL_HEIGHT_DOTS', source)
        self.assertIn('LABEL_LAYOUT_WIDTH_DOTS', source)
        self.assertIn('function buildRotatedTsplText(x, y, value, options = {})', source)
        self.assertIn('function buildRotatedCenteredTsplText(y, value, options = {})', source)
        self.assertIn('function buildRotatedTsplBar(x, y, width, height)', source)
        self.assertIn('const rotation = options.rotation || 270', source)
        self.assertIn('const rotatedY = Math.max(Math.round(x + textWidth), 0)', source)
        self.assertNotIn('LABEL_LAYOUT_WIDTH_DOTS - x - textWidth', source)
        self.assertIn('buildRotatedTsplBar(0, 96, LABEL_LAYOUT_WIDTH_DOTS, 3)', source)
        self.assertIn('buildRotatedTsplBar(0, 238, LABEL_LAYOUT_WIDTH_DOTS, 3)', source)
        self.assertIn('buildRotatedTsplBar(0, 330, LABEL_LAYOUT_WIDTH_DOTS, 3)', source)
        self.assertIn('buildRotatedTsplBar(0, 420, LABEL_LAYOUT_WIDTH_DOTS, 3)', source)
        self.assertIn("buildRotatedCenteredTsplText(38, \"D'LIMA\"", source)
        self.assertIn("buildRotatedCenteredTsplText(66, 'S T O R E'", source)
        self.assertNotIn('buildRotatedTsplBar(44, 76, 54, 3)', source)
        self.assertNotIn('buildRotatedTsplBar(222, 76, 54, 3)', source)
        self.assertIn('buildRotatedCenteredTsplText(118, productLines[0]', source)
        self.assertIn('buildRotatedCenteredTsplText(182, productLines[1]', source)
        self.assertIn("buildRotatedTsplText(200, 274, 'TAM:'", source)
        self.assertIn('buildRotatedCenteredTsplText(260, tamanho', source)
        self.assertIn('buildRotatedCenteredTsplText(360, preco', source)
        self.assertIn("buildRotatedCenteredTsplText(360, preco, { font: '5', maxWidthDots: 288 })", source)
        self.assertIn('buildRotatedCenteredTsplText(434, footerText', source)
        self.assertIn("buildRotatedTsplText(46, 462, 'NAO SEJA COPIA, SEJA REFERENCIA'", source)
        self.assertNotIn('buildRotatedTsplBar(24, 466, 38, 3)', source)
        self.assertNotIn('buildRotatedTsplBar(258, 466, 38, 3)', source)
        self.assertIn('NAO SEJA COPIA, SEJA REFERENCIA', source)
        self.assertIn('label-simple-product', source)
        self.assertIn('label-simple-details', source)
        self.assertIn('label-simple-price', source)
        self.assertIn('rotate(-90deg)', css := Path(settings.BASE_DIR / 'static/css/style.css').read_text(encoding='utf-8'))
        self.assertNotIn('.label-brand-sub::before', css)
        self.assertNotIn('.label-brand-sub::after', css)
        self.assertNotIn('.label-simple-quote::before', css)
        self.assertNotIn('.label-simple-quote::after', css)
        self.assertIn('PRINT ${copies}', source)
        self.assertIn("type: 'raw'", source)
        self.assertIn("format: 'plain'", source)
        self.assertIn('data: comandoTSPL', source)
        self.assertIn('encoding: \'UTF-8\'', source)
        self.assertIn('function sendLabelTSPLToPrinter(state, comandoTSPL)', source)
        self.assertIn('const config = window.qz.configs.create(printerName, configOptions);', source)
        self.assertIn('const etiquetas = buildLabelPrintData(comandoTSPL);', source)
        self.assertIn('await window.qz.print(config, etiquetas);', source)
        self.assertIn('[DLIMA etiqueta TSPL RAW]', source)
        self.assertIn("console.log('qz.configs.create(printerName, configOptions) - configOptions:'", source)
        self.assertIn("console.log('Array data enviado ao qz.print(config, data):'", source)
        self.assertIn('Comando TSPL enviado ao QZ:', source)
        self.assertIn('value="60x40 TSPL RAW deitada"', template)
        self.assertIn("css/style.css' %}?v=label-sideways-value-20260602", template)
        self.assertIn("js/vendas/registrar_venda.js' %}?v=label-sideways-value-20260602", template)
        self.assertIn('id="etiquetaComandoPreview"', template)
        self.assertIn('readonly', template)
        self.assertNotIn("buildTsplText(178, 292, 'PRODUTO'", source)
        self.assertNotIn("buildTsplText(294, 292, 'TAMANHO'", source)
        self.assertNotIn('id="imprimirEtiquetasHtml"', template)
        self.assertNotIn('id="imprimirEtiquetasZpl"', template)
        self.assertNotIn('id="imprimirTesteCentralizado"', template)
        self.assertNotIn('Teste de centro', template)
        self.assertNotIn('etiquetaTesteTexto', source)
        self.assertNotIn('CENTER_TEST', source)
        self.assertNotIn('printCenteredWordTest', source)
        self.assertNotIn('buildLabelZPL', source)
        self.assertNotIn('buildLabelHTML', source)
        self.assertNotIn('printLabelsZPL', source)
        self.assertNotIn('printLabelsHTML', source)
        self.assertNotIn('sendLabelZPLToPrinter', source)
        self.assertNotIn('sendLabelHTMLToPrinter', source)
        self.assertNotIn('^XA', source)
        self.assertNotIn('@page', source)
        self.assertNotIn("type: 'pixel'", source)
        self.assertNotIn("format: 'html'", source)
        self.assertNotIn("flavor: 'plain'", source)
        self.assertNotIn('scaleContent', source)
        self.assertNotIn("orientation: 'landscape'", source)
        self.assertNotIn("orientation: 'portrait'", source)
        self.assertNotIn('pageWidth', source)
        self.assertNotIn('pageHeight', source)
        self.assertNotIn('custom: true', source)
        self.assertNotIn("format: 'command'", source)
        self.assertNotIn('buildRawLabelDocument', source)
        self.assertNotIn('buildZpl', source)
        self.assertNotIn('40x60', source)
        self.assertNotIn('label-logo-panel', source)
        self.assertNotIn('label-fields-panel', source)
        self.assertNotIn('label-content', source)
        self.assertNotIn('label-price-panel', source)
        self.assertNotIn('label-details-grid', source)
        self.assertNotIn('column-count', source)
        self.assertNotIn('canvas', source.lower())
        self.assertNotIn('base64', source.lower())
        self.assertNotIn('html2canvas', source.lower())
        self.assertNotIn('screenshot', source.lower())
        self.assertNotIn('writing-mode:', source)
        self.assertNotIn('scale(', source)
        self.assertNotIn('zoom:', source)


class ReceiptPayloadTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='caixa',
            password='123456'
        )
        self.vendedor = Vendedor.objects.create(
            nome='Marina',
            percentual_comissao=10,
            ativo=True
        )
        self.produto = Produto.objects.create(
            nome='Vestido Floral',
            categoria='Vestidos',
            cor='Verde',
            tamanho='P',
            preco='120.00',
            estoque=5,
            ativo=True,
        )

    def test_recibo_tem_contrato_esperado_pelo_print_js(self):
        venda = Venda.objects.create(
            vendedor=self.vendedor,
            usuario_registro=self.user,
            forma_pagamento='pix',
            desconto='10.00',
            total='110.00',
        )
        ItemVenda.objects.create(
            venda=venda,
            produto=self.produto,
            quantidade=1,
            preco_unitario='120.00',
            subtotal='120.00',
        )

        receipt = build_receipt_payload(venda)

        self.assertEqual(receipt['store']['name'], 'Dlima Store')
        self.assertEqual(receipt['sale']['numero'], str(venda.id).zfill(6))
        self.assertEqual(receipt['sale']['subtotal'], '120.00')
        self.assertEqual(receipt['sale']['desconto'], '10.00')
        self.assertEqual(receipt['sale']['total'], '110.00')
        self.assertEqual(receipt['sale']['itens'][0]['nome'], 'Vestido Floral')
        self.assertEqual(receipt['printer']['width'], 48)
        self.assertEqual(receipt['printer']['encoding'], 'CP860')
        self.assertFalse(receipt['printer']['open_drawer'])
        self.assertIn('preferred_name', receipt['printer'])
