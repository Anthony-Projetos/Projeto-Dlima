from django.urls import path
from .views import buscar_produtos_api, finalizar_venda_api, registrar_venda

urlpatterns = [
    path('registrar/', registrar_venda, name='registrar_venda'),
    path('api/finalizar/', finalizar_venda_api, name='finalizar_venda_api'),
    path('api/produtos/buscar/', buscar_produtos_api, name='buscar_produtos_api'),
]
