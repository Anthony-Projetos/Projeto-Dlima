from django.urls import path
from .views import home, redirecionar_usuario

urlpatterns = [
    path('', home, name='home'),
    path('redirecionar/', redirecionar_usuario, name='redirecionar_usuario'),
]