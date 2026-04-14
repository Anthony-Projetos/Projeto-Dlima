from django import forms
from core.models import Vendedor
from .models import Venda, Produto


class VendaForm(forms.ModelForm):
    class Meta:
        model = Venda
        fields = ['vendedor', 'forma_pagamento', 'desconto', 'observacao']
        widgets = {
            'vendedor': forms.Select(attrs={'class': 'form-control'}),
            'forma_pagamento': forms.Select(attrs={'class': 'form-control'}),
            'desconto': forms.NumberInput(attrs={
                'class': 'form-control',
                'min': '0',
                'step': '0.01',
                'placeholder': '0,00',
            }),
            'observacao': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['vendedor'].queryset = Vendedor.objects.filter(ativo=True)
        self.fields['vendedor'].empty_label = None
        self.fields['vendedor'].required = True
        self.fields['desconto'].required = False
        self.fields['desconto'].initial = 0


class AdicionarEstoqueForm(forms.Form):
    produto = forms.ModelChoiceField(
        queryset=Produto.objects.filter(ativo=True).order_by('nome'),
        empty_label=None,
        widget=forms.Select(attrs={'class': 'modal-select'})
    )
    quantidade = forms.IntegerField(
        min_value=1,
        widget=forms.NumberInput(attrs={
            'class': 'modal-input',
            'placeholder': 'Digite a quantidade'
        })
    )
