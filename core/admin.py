from django.contrib import admin
from .models import Vendedor


@admin.register(Vendedor)
class VendedorAdmin(admin.ModelAdmin):
    list_display = ('nome', 'ativo', 'percentual_comissao', 'criado_em')
    search_fields = ('nome',)
    list_filter = ('ativo',)