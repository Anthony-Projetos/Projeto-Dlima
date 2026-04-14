from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render


def home(request):
    return redirect('login')


@login_required
def redirecionar_usuario(request):
    if request.user.groups.filter(name='Gerente').exists() or request.user.is_superuser:
        return redirect('dashboard_gerente')
    return redirect('registrar_venda')
