import json
from json import JSONDecodeError

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from .forms import VendaForm
from .models import Produto
from .services import (
    VendaPayloadError,
    build_receipt_payload,
    create_venda_from_payload,
    get_label_settings,
    get_receipt_settings,
)

@login_required
def registrar_venda(request):
    termo_pesquisa = request.GET.get('q', '').strip()
    produtos = Produto.objects.filter(ativo=True, estoque__gt=0)

    if termo_pesquisa:
        produtos = produtos.filter(
            Q(nome__icontains=termo_pesquisa) |
            Q(categoria__icontains=termo_pesquisa) |
            Q(cor__icontains=termo_pesquisa) |
            Q(tamanho__icontains=termo_pesquisa)
        )

    form = VendaForm()
    receipt_settings = get_receipt_settings()
    label_settings = get_label_settings()
    pdv_config = {
        'finalizeSaleUrl': reverse('finalizar_venda_api'),
        'productSearchUrl': reverse('buscar_produtos_api_root'),
        'printerName': receipt_settings['printer_name'],
        'printerSearchTerms': receipt_settings['printer_search_terms'],
        'receiptEncoding': receipt_settings['receipt_encoding'],
        'receiptHtmlFallback': True,
        'labelPrinterName': label_settings['printer_name'],
        'labelPrinterSearchTerms': label_settings['printer_search_terms'],
        'qzCertificateUrl': '',
        'qzSignatureUrl': '',
    }

    return render(request, 'vendas/registrar_venda.html', {
        'form': form,
        'produtos': produtos,
        'termo_pesquisa': termo_pesquisa,
        'pdv_config': pdv_config,
    })


def get_optional_product_value(produto, field_name, default=''):
    if hasattr(produto, field_name):
        return getattr(produto, field_name) or default
    return default


@login_required
def buscar_produtos_api(request):
    termo = request.GET.get('q', '').strip()
    produtos = Produto.objects.filter(ativo=True)

    if termo:
        filtros = (
            Q(nome__icontains=termo) |
            Q(categoria__icontains=termo) |
            Q(cor__icontains=termo) |
            Q(tamanho__icontains=termo)
        )

        if termo.isdigit():
            filtros |= Q(id=int(termo))

        campos_produto = {field.name for field in Produto._meta.get_fields()}
        if 'codigo' in campos_produto:
            filtros |= Q(codigo__icontains=termo)
        if 'referencia' in campos_produto:
            filtros |= Q(referencia__icontains=termo)

        produtos = produtos.filter(filtros)

    resultados = []
    for produto in produtos.order_by('nome')[:20]:
        codigo = str(get_optional_product_value(produto, 'codigo', '') or produto.id)
        referencia = str(get_optional_product_value(produto, 'referencia', '') or codigo)

        resultados.append({
            'id': produto.id,
            'nome': produto.nome,
            'preco': str(produto.preco),
            'codigo': codigo,
            'referencia': referencia,
            'tamanho': produto.tamanho,
            'cor': produto.cor,
            'estoque': produto.estoque,
        })

    return JsonResponse({'results': resultados})


@login_required
def finalizar_venda_api(request):
    if request.method != 'POST':
        return JsonResponse(
            {'success': False, 'message': 'Metodo nao permitido.'},
            status=405,
        )

    try:
        payload = json.loads(request.body or '{}')
    except JSONDecodeError:
        return JsonResponse(
            {
                'success': False,
                'message': 'JSON invalido no corpo da requisicao.',
                'field_errors': {'payload': ['Envie um JSON valido.']},
            },
            status=400,
        )

    try:
        venda = create_venda_from_payload(payload, request.user)
        receipt = build_receipt_payload(venda)
    except VendaPayloadError as exc:
        return JsonResponse(
            {
                'success': False,
                'message': exc.message,
                'field_errors': exc.field_errors,
            },
            status=exc.status_code,
        )
    except Exception:
        return JsonResponse(
            {
                'success': False,
                'message': 'Erro interno ao salvar a venda.',
            },
            status=500,
        )

    return JsonResponse(
        {
            'success': True,
            'message': 'Venda salva com sucesso.',
            'sale': {
                'id': venda.id,
                'numero': str(venda.id).zfill(6),
            },
            'receipt': receipt,
        },
        status=201,
    )
