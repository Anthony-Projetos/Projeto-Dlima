from django.urls import path
from .views import finalizar_venda_api, registrar_venda

urlpatterns = [
    path('registrar/', registrar_venda, name='registrar_venda'),
    path('api/finalizar/', finalizar_venda_api, name='finalizar_venda_api'),
]
