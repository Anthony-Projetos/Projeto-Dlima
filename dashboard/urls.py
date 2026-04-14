from django.urls import path
from .views import dashboard_gerente, adicionar_estoque, graficos_vendas

urlpatterns = [
    path('', dashboard_gerente, name='dashboard_gerente'),
    path('adicionar-estoque/', adicionar_estoque, name='adicionar_estoque'),
    path('graficos/', graficos_vendas, name='graficos_vendas'),
]