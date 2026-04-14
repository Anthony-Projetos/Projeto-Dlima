from django.db import models


class Vendedor(models.Model):
    nome = models.CharField(max_length=120, unique=True)
    ativo = models.BooleanField(default=True)
    percentual_comissao = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome
    