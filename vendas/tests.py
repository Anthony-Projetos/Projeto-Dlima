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
        self.assertContains(response, 'value="60x40 HTML"')
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
    def test_js_de_etiquetas_usa_html_60x40(self):
        source = Path(settings.BASE_DIR / 'static/js/vendas/registrar_venda.js').read_text(encoding='utf-8')
        template = Path(settings.BASE_DIR / 'templates/vendas/registrar_venda.html').read_text(encoding='utf-8')

        self.assertIn('function buildLabelHTML(dados, quantidade)', source)
        self.assertIn('@page', source)
        self.assertIn('size: 60mm 40mm;', source)
        self.assertIn('width: 60mm;', source)
        self.assertIn('height: 40mm;', source)
        self.assertIn('box-sizing: border-box;', source)
        self.assertIn('overflow: hidden;', source)
        self.assertIn('grid-template-rows: 7.2mm 11.8mm 10.2mm 4.8mm 3.3mm;', source)
        self.assertIn('D&#39;lima', source)
        self.assertIn('<span>store</span>', source)
        self.assertIn('class="label-product-name"', source)
        self.assertIn('<span>REF.</span>', source)
        self.assertIn('class="label-size-value"', source)
        self.assertIn('<span>VALOR</span>', source)
        self.assertIn('&quot;N&atilde;o seja c&oacute;pia,', source)
        self.assertIn('seja refer&ecirc;ncia.&quot;', source)
        self.assertIn('D L I M A&nbsp;&nbsp;S T O R E', source)
        self.assertIn("type: 'pixel'", source)
        self.assertIn("format: 'html'", source)
        self.assertIn("flavor: 'plain'", source)
        self.assertIn('data: html', source)
        self.assertIn("units: 'mm'", source)
        self.assertIn('scaleContent: false', source)
        self.assertIn('function sendLabelHTMLToPrinter(state, html)', source)
        self.assertIn('const config = window.qz.configs.create(printerName, configOptions);', source)
        self.assertIn('const data = buildLabelPrintData(html);', source)
        self.assertIn('await window.qz.print(config, data);', source)
        self.assertIn('[DLIMA etiqueta HTML 60x40]', source)
        self.assertIn("console.log('qz.configs.create(printerName, configOptions) - configOptions:'", source)
        self.assertIn("console.log('Array data enviado ao qz.print(config, data):'", source)
        self.assertIn('HTML enviado ao QZ:', source)
        self.assertIn('value="60x40 HTML"', template)
        self.assertIn('HTML QZ', template)
        self.assertIn('id="etiquetaComandoPreview"', template)
        self.assertIn('readonly', template)
        self.assertNotIn('id="imprimirEtiquetasHtml"', template)
        self.assertNotIn('id="imprimirEtiquetasZpl"', template)
        self.assertNotIn('id="imprimirTesteCentralizado"', template)
        self.assertNotIn('Teste de centro', template)
        self.assertNotIn('etiquetaTesteTexto', source)
        self.assertNotIn('CENTER_TEST', source)
        self.assertNotIn('printCenteredWordTest', source)
        self.assertNotIn('buildLabelTSPL', source)
        self.assertNotIn('sendLabelTSPLToPrinter', source)
        self.assertNotIn('buildLabelZPL', source)
        self.assertNotIn('printLabelsZPL', source)
        self.assertNotIn('sendLabelZPLToPrinter', source)
        self.assertNotIn('^XA', source)
        self.assertNotIn('SIZE 60 mm,40 mm', source)
        self.assertNotIn("type: 'raw'", source)
        self.assertNotIn('DIRECTION 1', source)
        self.assertNotIn('REFERENCE 0,0', source)
        self.assertNotIn("orientation: 'landscape'", source)
        self.assertNotIn("orientation: 'portrait'", source)
        self.assertNotIn('PRO' + 'DUTO', source)
        self.assertNotIn('TAMA' + 'NHO', source)
        self.assertNotIn('40x60', source)
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
