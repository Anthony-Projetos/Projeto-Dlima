from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from vendas.models import Venda, Produto
from core.models import Vendedor


class Command(BaseCommand):
    help = 'Cria grupos Gerente e Caixa'

    def handle(self, *args, **kwargs):
        gerente, _ = Group.objects.get_or_create(name='Gerente')
        caixa, _ = Group.objects.get_or_create(name='Caixa')

        perms_gerente = Permission.objects.filter(
            content_type__model__in=['venda', 'itemvenda', 'produto', 'vendedor']
        )
        gerente.permissions.set(perms_gerente)

        perms_caixa = Permission.objects.filter(
            content_type__model__in=['venda', 'itemvenda']
        )
        caixa.permissions.set(perms_caixa)

        self.stdout.write(self.style.SUCCESS('Grupos criados com sucesso.'))