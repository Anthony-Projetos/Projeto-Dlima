from decimal import Decimal, InvalidOperation

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .forms import VendaForm
from .models import ItemVenda, Produto, Venda


TWO_PLACES = Decimal("0.01")

DEFAULT_RECEIPT_SETTINGS = {
    "store_name": "Dlima Store",
    "cnpj": "00.000.000/0001-00",
    "store_address": "",
    "customer_label": "CONSUMIDOR",
    "printer_name": "PIPrinter",
    "printer_search_terms": ["PIPrinter", "EPSON", "TM-T20", "POS-58", "POS-80", "ELGIN", "BEMATECH"],
}


class VendaPayloadError(Exception):
    def __init__(self, message, field_errors=None, status_code=400):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}
        self.status_code = status_code


def get_receipt_settings():
    custom_settings = getattr(settings, "PDV_RECEIPT_SETTINGS", {})
    return {**DEFAULT_RECEIPT_SETTINGS, **custom_settings}


def decimal_to_str(value):
    return str((value or Decimal("0.00")).quantize(TWO_PLACES))


def parse_decimal(value, field_name):
    try:
        return Decimal(str(value or "0")).quantize(TWO_PLACES)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise VendaPayloadError(
            "Payload invalido para processamento da venda.",
            field_errors={field_name: ["Informe um valor monetario valido."]},
        ) from exc


def parse_positive_int(value, field_name):
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise VendaPayloadError(
            "Payload invalido para processamento da venda.",
            field_errors={field_name: ["Informe um numero inteiro valido."]},
        ) from exc

    if parsed <= 0:
        raise VendaPayloadError(
            "Payload invalido para processamento da venda.",
            field_errors={field_name: ["O valor deve ser maior que zero."]},
        )
    return parsed


def normalize_form_errors(form_errors):
    normalized = {}
    for field, errors in form_errors.items():
        normalized[field] = [error["message"] for error in errors]
    return normalized


def build_receipt_payload(venda):
    venda = (
        Venda.objects.select_related("vendedor")
        .prefetch_related("itens__produto")
        .get(pk=venda.pk)
    )
    receipt_settings = get_receipt_settings()
    subtotal = sum((item.subtotal for item in venda.itens.all()), Decimal("0.00"))
    venda_datetime = timezone.localtime(venda.data_hora)

    itens = []
    for item in venda.itens.all():
        itens.append(
            {
                "produto_id": item.produto_id,
                "nome": item.produto.nome,
                "quantidade": item.quantidade,
                "valor_unitario": decimal_to_str(item.preco_unitario),
                "valor_total": decimal_to_str(item.subtotal),
            }
        )

    return {
        "store": {
            "name": receipt_settings["store_name"],
            "cnpj": receipt_settings["cnpj"],
            "address": receipt_settings["store_address"],
        },
        "sale": {
            "id": venda.id,
            "numero": str(venda.id).zfill(6),
            "data_hora": venda_datetime.isoformat(),
            "data_hora_formatada": venda_datetime.strftime("%d/%m/%Y %H:%M:%S"),
            "vendedor": venda.vendedor.nome,
            "forma_pagamento": venda.get_forma_pagamento_display(),
            "observacao": venda.observacao,
            "subtotal": decimal_to_str(subtotal),
            "desconto": decimal_to_str(venda.desconto),
            "total": decimal_to_str(venda.total),
            "itens": itens,
        },
        "printer": {
            "preferred_name": receipt_settings["printer_name"],
            "search_terms": receipt_settings["printer_search_terms"],
        },
        "customer": {
            "name": receipt_settings["customer_label"],
        },
        "message": "VOLTE SEMPRE!!!",
    }


def create_venda_from_payload(payload, user):
    venda_data = {
        "vendedor": payload.get("vendedor_id"),
        "forma_pagamento": payload.get("forma_pagamento"),
        "desconto": payload.get("desconto", "0.00"),
        "observacao": payload.get("observacao", ""),
    }
    form = VendaForm(venda_data)

    if not form.is_valid():
        raise VendaPayloadError(
            "Dados da venda invalidos.",
            field_errors=normalize_form_errors(form.errors.get_json_data()),
        )

    itens_payload = payload.get("itens") or []
    if not isinstance(itens_payload, list) or not itens_payload:
        raise VendaPayloadError(
            "Adicione ao menos um item na venda.",
            field_errors={"itens": ["Adicione ao menos um item na venda."]},
        )

    item_specs = []
    product_ids = []
    for index, raw_item in enumerate(itens_payload):
        if not isinstance(raw_item, dict):
            raise VendaPayloadError(
                "Payload invalido para processamento da venda.",
                field_errors={"itens": [f"Item #{index + 1} invalido."]},
            )

        product_id = parse_positive_int(raw_item.get("produto_id"), f"itens[{index}].produto_id")
        quantidade = parse_positive_int(raw_item.get("quantidade"), f"itens[{index}].quantidade")
        product_ids.append(product_id)
        item_specs.append({"produto_id": product_id, "quantidade": quantidade, "index": index})

    with transaction.atomic():
        produtos = {
            produto.id: produto
            for produto in Produto.objects.select_for_update().filter(id__in=product_ids, ativo=True)
        }

        itens_venda = []
        subtotal_venda = Decimal("0.00")
        validation_errors = {}

        for item in item_specs:
            produto = produtos.get(item["produto_id"])
            if produto is None:
                validation_errors.setdefault("itens", []).append(
                    f"Produto #{item['produto_id']} nao esta disponivel para venda."
                )
                continue

            if item["quantidade"] > produto.estoque:
                validation_errors.setdefault("itens", []).append(
                    f'A quantidade de "{produto.nome}" nao pode ser maior que o estoque disponivel ({produto.estoque}).'
                )
                continue

            subtotal_item = (produto.preco * item["quantidade"]).quantize(TWO_PLACES)
            subtotal_venda += subtotal_item
            itens_venda.append(
                {
                    "produto": produto,
                    "quantidade": item["quantidade"],
                    "subtotal": subtotal_item,
                }
            )

        desconto = parse_decimal(form.cleaned_data.get("desconto"), "desconto")
        if desconto > subtotal_venda:
            validation_errors.setdefault("desconto", []).append(
                "O desconto nao pode ser maior que o subtotal da venda."
            )

        if validation_errors:
            raise VendaPayloadError("Nao foi possivel salvar a venda.", field_errors=validation_errors)

        venda = form.save(commit=False)
        venda.usuario_registro = user
        venda.total = (subtotal_venda - desconto).quantize(TWO_PLACES)
        venda.save()

        itens_model = []
        produtos_atualizados = []
        for item in itens_venda:
            produto = item["produto"]
            itens_model.append(
                ItemVenda(
                    venda=venda,
                    produto=produto,
                    quantidade=item["quantidade"],
                    preco_unitario=produto.preco,
                    subtotal=item["subtotal"],
                )
            )
            produto.estoque -= item["quantidade"]
            produtos_atualizados.append(produto)

        ItemVenda.objects.bulk_create(itens_model)
        Produto.objects.bulk_update(produtos_atualizados, ["estoque"])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "dashboard_vendas",
        {
            "type": "venda_atualizada",
        },
    )

    return venda
