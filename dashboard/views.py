from decimal import Decimal

from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Sum, Count
from django.shortcuts import render, redirect
from django.utils import timezone

from vendas.models import Venda
from vendas.forms import AdicionarEstoqueForm
from core.models import Vendedor
from django.db.models import Sum
from vendas.models import Venda, ItemVenda




def gerente_required(user):
    return user.is_authenticated and (
        user.is_superuser or user.groups.filter(name='Gerente').exists()
    )

@login_required
@user_passes_test(gerente_required)
def graficos_vendas(request):
    hoje = timezone.localdate()

    data_inicial = request.GET.get('data_inicial')
    data_final = request.GET.get('data_final')

    itens = ItemVenda.objects.select_related('produto', 'venda', 'venda__vendedor')

    if data_inicial:
        itens = itens.filter(venda__data_hora__date__gte=data_inicial)

    if data_final:
        itens = itens.filter(venda__data_hora__date__lte=data_final)

    produtos_mais_vendidos = (
        itens.values('produto__nome')
        .annotate(total_quantidade=Sum('quantidade'))
        .order_by('-total_quantidade')[:10]
    )

    vendedores_mais_venderam = (
        Venda.objects.filter(
            data_hora__date__gte=data_inicial if data_inicial else hoje.replace(day=1),
            data_hora__date__lte=data_final if data_final else hoje,
        )
        .values('vendedor__nome')
        .annotate(total_vendido=Sum('total'))
        .order_by('-total_vendido')[:10]
    )

    context = {
        'data_inicial': data_inicial or '',
        'data_final': data_final or '',
        'produtos_labels': [item['produto__nome'] for item in produtos_mais_vendidos],
        'produtos_valores': [item['total_quantidade'] for item in produtos_mais_vendidos],
        'vendedores_labels': [item['vendedor__nome'] for item in vendedores_mais_venderam],
        'vendedores_valores': [float(item['total_vendido']) for item in vendedores_mais_venderam],
        'produtos_tabela': produtos_mais_vendidos,
        'vendedores_tabela': vendedores_mais_venderam,
    }

    return render(request, 'dashboard/graficos_vendas.html', context)


@login_required
@user_passes_test(gerente_required)
def dashboard_gerente(request):
    hoje = timezone.localdate()

    vendas_hoje = Venda.objects.filter(data_hora__date=hoje)

    vendas_mes = Venda.objects.filter(
        data_hora__year=hoje.year,
        data_hora__month=hoje.month
    )

    resumo_vendedores = (
        vendas_hoje
        .values('vendedor__nome')
        .annotate(
            total_vendido=Sum('total'),
            qtd_vendas=Count('id')
        )
        .order_by('-total_vendido')
    )

    ranking_mes = (
        vendas_mes
        .values('vendedor__nome')
        .annotate(total_vendido=Sum('total'))
        .order_by('-total_vendido')
    )

    # Comissão mensal por vendedor
    vendedores = Vendedor.objects.filter(ativo=True).order_by('nome')
    comissoes_mes = []

    for vendedor in vendedores:
        total_vendido_mes = (
            vendas_mes.filter(vendedor=vendedor).aggregate(total=Sum('total'))['total']
            or Decimal('0.00')
        )

        percentual = vendedor.percentual_comissao or Decimal('0.00')
        valor_comissao = (total_vendido_mes * percentual) / Decimal('100.00')

        comissoes_mes.append({
            'nome': vendedor.nome,
            'percentual': percentual,
            'total_vendido': total_vendido_mes,
            'comissao': valor_comissao,
        })

    # ordena da maior comissão para a menor
    comissoes_mes.sort(key=lambda x: x['comissao'], reverse=True)

    ultimas_vendas = (
        vendas_hoje
        .select_related('vendedor')
        .order_by('-data_hora')[:20]
    )

    total_comissoes_mes = sum(item['comissao'] for item in comissoes_mes)

    context = {
        'total_hoje': vendas_hoje.aggregate(total=Sum('total'))['total'] or 0,
        'total_mes': vendas_mes.aggregate(total=Sum('total'))['total'] or 0,
        'resumo_vendedores': resumo_vendedores,
        'ranking_mes': ranking_mes,
        'comissoes_mes': comissoes_mes,
        'ultimas_vendas': ultimas_vendas,
        'estoque_form': AdicionarEstoqueForm(),
        'total_comissoes_mes': total_comissoes_mes,
    }

    return render(request, 'dashboard/dashboard_gerente.html', context)


@login_required
@user_passes_test(gerente_required)
def adicionar_estoque(request):
    if request.method == 'POST':
        form = AdicionarEstoqueForm(request.POST)
        if form.is_valid():
            produto = form.cleaned_data['produto']
            quantidade = form.cleaned_data['quantidade']

            produto.estoque += quantidade
            produto.save(update_fields=['estoque'])

    return redirect('dashboard_gerente')