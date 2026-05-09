import json
from json import JSONDecodeError

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from .forms import VendaForm
from .models import Produto
from .services import VendaPayloadError, create_venda_from_payload

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

    return render(request, 'vendas/registrar_venda.html', {
        'form': form,
        'produtos': produtos,
        'termo_pesquisa': termo_pesquisa,
    })


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
        },
        status=201,
    )
