from decimal import Decimal
from django.conf import settings
from django.db import models
from core.models import Vendedor


class Produto(models.Model):
    nome = models.CharField(max_length=150)
    categoria = models.CharField(max_length=100, blank=True)
    tamanho = models.CharField(max_length=20, blank=True)
    cor = models.CharField(max_length=50, blank=True)
    preco = models.DecimalField(max_digits=10, decimal_places=2)
    estoque = models.PositiveIntegerField(default=0)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome


class Venda(models.Model):
    FORMA_PAGAMENTO_CHOICES = [
        ('dinheiro', 'Dinheiro'),
        ('pix', 'Pix'),
        ('cartao_credito', 'Cartão de Crédito'),
        ('cartao_debito', 'Cartão de Débito'),
    ]

    vendedor = models.ForeignKey(Vendedor, on_delete=models.PROTECT, related_name='vendas')
    usuario_registro = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    data_hora = models.DateTimeField(auto_now_add=True)
    forma_pagamento = models.CharField(max_length=20, choices=FORMA_PAGAMENTO_CHOICES)
    desconto = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    observacao = models.TextField(blank=True)
    editado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendas_editadas'
    )
    data_edicao = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-data_hora']

    def __str__(self):
        return f'Venda #{self.id} - {self.vendedor.nome}'

    def recalcular_total(self):
        total = sum(item.subtotal for item in self.itens.all())
        self.total = max(total - self.desconto, Decimal('0.00'))
        self.save(update_fields=['total'])


class ItemVenda(models.Model):
    venda = models.ForeignKey(Venda, on_delete=models.CASCADE, related_name='itens')
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT)
    quantidade = models.PositiveIntegerField()
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)        

    def __str__(self):
        return f'{self.produto.nome} - {self.quantidade}'
