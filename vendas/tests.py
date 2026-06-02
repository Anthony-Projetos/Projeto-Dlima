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
        self.assertContains(response, 'id="imprimirEtiquetasHtml"')
        self.assertContains(response, 'id="imprimirEtiquetasZpl"')

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
        self.assertIn('buildTsplBar(8, 8, 464, 2)', source)
        self.assertIn("buildTsplText(38, 286, \"D'lima\"", source)
        self.assertIn("buildTsplText(122, 212, 'store'", source)
        self.assertIn("buildTsplText(178, 148, 'VALOR'", source)
        self.assertIn("buildTsplText(236, 292, 'REF'", source)
        self.assertIn('buildTsplText(260, 292, referencia', source)
        self.assertIn("buildTsplText(294, 292, 'TAMANHO'", source)
        self.assertIn('buildTsplText(318, 292, tamanho', source)
        self.assertIn('"Nao seja copia,', source)
        self.assertIn('seja referencia."', source)
        self.assertIn('rotation: 270', source)
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
        self.assertIn('value="60x40 TSPL RAW"', template)
        self.assertIn('readonly', template)
        self.assertNotIn("orientation: 'landscape'", source)
        self.assertNotIn("orientation: 'portrait'", source)
        self.assertNotIn('pageWidth', source)
        self.assertNotIn('pageHeight', source)
        self.assertNotIn('custom: true', source)
        self.assertNotIn("format: 'command'", source)
        self.assertNotIn('buildRawLabelDocument', source)
        self.assertNotIn('buildZpl', source)
        self.assertNotIn('40x60', source)
        self.assertNotIn('label-reference', source)
        self.assertNotIn('label-logo-panel', source)
        self.assertNotIn('label-fields-panel', source)
        self.assertNotIn('label-content', source)
        self.assertNotIn('label-price-panel', source)
        self.assertNotIn('label-details-grid', source)
        self.assertNotIn('display: grid', source)
        self.assertNotIn('grid-template', source)
        self.assertNotIn('border-left', source)
        self.assertNotIn('border-right', source)
        self.assertNotIn('column-count', source)
        self.assertNotIn('canvas', source.lower())
        self.assertNotIn('base64', source.lower())
        self.assertNotIn('html2canvas', source.lower())
        self.assertNotIn('screenshot', source.lower())
        self.assertNotIn('writing-mode:', source)
        self.assertNotIn('scale(', source)
        self.assertNotIn('zoom:', source)

    def test_js_de_etiquetas_oferece_zpl_raw_60x40(self):
        source = Path(settings.BASE_DIR / 'static/js/vendas/registrar_venda.js').read_text(encoding='utf-8')
        template = Path(settings.BASE_DIR / 'templates/vendas/registrar_venda.html').read_text(encoding='utf-8')

        self.assertIn('function buildLabelZPL(dados, quantidade)', source)
        self.assertIn('^XA', source)
        self.assertIn('^PW480', source)
        self.assertIn('^LL320', source)
        self.assertIn('^CI28', source)
        self.assertIn('^FO${x},${y}^A0${orientation},${fontHeight},${fontWidth}^FD${text}^FS', source)
        self.assertIn('buildZPLText(38, 286, \'Dlima\'', source)
        self.assertIn('buildZPLText(122, 212, \'store\'', source)
        self.assertIn('buildZPLText(242, 150, preco', source)
        self.assertIn('Não seja cópia,', source)
        self.assertIn('seja referência.', source)
        self.assertIn('^PQ${copies}', source)
        self.assertIn('^XZ', source)
        self.assertIn('function sendLabelZPLToPrinter(state, zpl)', source)
        self.assertIn("type: 'raw'", source)
        self.assertIn("format: 'plain'", source)
        self.assertIn('data: zpl', source)
        self.assertIn('const data = buildLabelZPLPrintData(zpl);', source)
        self.assertIn('await window.qz.print(config, data);', source)
        self.assertIn('[DLIMA etiqueta ZPL RAW]', source)
        self.assertIn('function printLabelsZPL()', source)
        self.assertIn('id="imprimirEtiquetasZpl"', template)
        self.assertIn('RAW QZ', template)

    def test_js_de_etiquetas_oferece_html_qz_60x40(self):
        source = Path(settings.BASE_DIR / 'static/js/vendas/registrar_venda.js').read_text(encoding='utf-8')
        template = Path(settings.BASE_DIR / 'templates/vendas/registrar_venda.html').read_text(encoding='utf-8')

        self.assertIn('function buildLabelHTML(dados, quantidade)', source)
        self.assertIn('@page', source)
        self.assertIn('size: 60mm 40mm;', source)
        self.assertIn('width: 60mm;', source)
        self.assertIn('height: 40mm;', source)
        self.assertIn('overflow: hidden;', source)
        self.assertIn('border: 0.25mm solid #111111;', source)
        self.assertIn('transform: rotate(-90deg);', source)
        self.assertIn('D&#39;lima', source)
        self.assertIn('&quot;Não seja cópia,', source)
        self.assertIn('seja referência.&quot;', source)
        self.assertIn('function buildLabelHTMLPrintData(html)', source)
        self.assertIn("type: 'pixel'", source)
        self.assertIn("format: 'html'", source)
        self.assertIn("flavor: 'plain'", source)
        self.assertIn('data: html', source)
        self.assertIn('function buildLabelHtmlConfigOptions()', source)
        self.assertIn("units: 'mm'", source)
        self.assertIn('scaleContent: false', source)
        self.assertIn('function sendLabelHTMLToPrinter(state, html)', source)
        self.assertIn('const data = buildLabelHTMLPrintData(html);', source)
        self.assertIn('await window.qz.print(config, data);', source)
        self.assertIn('[DLIMA etiqueta HTML QZ]', source)
        self.assertIn('function printLabelsHTML()', source)
        self.assertIn('id="imprimirEtiquetasHtml"', template)
        self.assertIn('Imprimir HTML', template)


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
